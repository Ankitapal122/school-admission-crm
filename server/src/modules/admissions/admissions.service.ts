import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { LeadStatus, VerificationStatus } from '@prisma/client';
import * as puppeteer from 'puppeteer';
import { PrismaService } from '../../prisma/prisma.service';
import { CommissionsService } from '../commissions/commissions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { apiEnvelope, toBlueprintRole } from '../../common/utils/crm.utils';

const ALLOWED_STAGES = [
  'applied',
  'conference_call',
  'test_interview',
  'visit_registration',
  'selected',
  'admission_done',
  'closed',
] as const;

const ALLOWED_SUB_STAGES = [
  'A_waiting',
  'B_only_registration',
  'C_formalities_done',
] as const;

@Injectable()
export class AdmissionsService {
  constructor(
    private prisma: PrismaService,
    private commissionsService: CommissionsService,
    @Optional() private notifications?: NotificationsService,
  ) {}

  private async nextAppCode(tx: any = this.prisma): Promise<string> {
    try {
      const seq: any[] = await tx.$queryRawUnsafe(
        `SELECT nextval('seq_app_id') AS val`,
      );
      const val = Number(seq?.[0]?.val || 1);
      return `AP${String(val).padStart(3, '0')}`;
    } catch {
      const count = await tx.admission.count();
      return `AP${String(count + 1).padStart(3, '0')}`;
    }
  }

  private stageToLeadStatus(stage: string, subStage?: string): LeadStatus {
    switch (stage) {
      case 'applied':
        return LeadStatus.applied;
      case 'conference_call':
        return LeadStatus.conference_call;
      case 'test_interview':
        return LeadStatus.test_interview;
      case 'visit_registration':
        return LeadStatus.visit_registration;
      case 'selected':
        return LeadStatus.selected;
      case 'admission_done':
        return LeadStatus.admission_done;
      case 'closed':
        return LeadStatus.closed;
      default:
        return subStage === 'C_formalities_done'
          ? LeadStatus.admission_done
          : LeadStatus.applied;
    }
  }

  private formatAdmission(adm: any) {
    const counsellor = adm.counsellor;
    const manager = adm.manager || counsellor?.team?.manager;
    return {
      ...adm,
      _id: adm.id,
      appId: adm.admissionNumber,
      admissionId: adm.admissionNumber,
      confirmedRevenue: adm.feeAgreed || 250000,
      feeAgreed: adm.feeAgreed || 250000,
      admissionDateDisplay: adm.admissionDate || adm.confirmedAt || adm.createdAt,
      admissionStatus: adm.status || adm.stage || 'applied',
      proofDocument: adm.proofDocument || adm.receiptNumber,
      leadId: adm.lead
        ? {
            _id: adm.lead.id,
            id: adm.lead.id,
            leadId: adm.lead.leadNumber,
            studentName: adm.lead.studentName,
            studentId: {
              name: adm.lead.studentName,
              admissionClass: adm.lead.applyingForGrade,
            },
            parentId: {
              name: adm.lead.parentName,
              mobile: adm.lead.parentPhone,
            },
          }
        : null,
      schoolId: adm.school
        ? {
            _id: adm.school.id,
            id: adm.school.id,
            schoolId: adm.school.schoolCode,
            name: adm.school.name,
            city: adm.school.city,
          }
        : null,
      assignedCounsellor: counsellor
        ? {
            _id: counsellor.id,
            id: counsellor.id,
            name: counsellor.fullName,
            fullName: counsellor.fullName,
            employeeId: counsellor.employeeId,
          }
        : null,
      assignedManager: manager
        ? {
            _id: manager.id,
            id: manager.id,
            name: manager.fullName,
            fullName: manager.fullName,
          }
        : null,
    };
  }

  async findAll(user?: any, query: any = {}) {
    const role = toBlueprintRole(user?.role);
    const where: any = { deletedAt: null };

    if (role === 'jr_counsellor' && user?.id) {
      where.counsellorId = user.id;
    } else if (role === 'manager' && user?.id) {
      const members = await this.prisma.user.findMany({
        where: { OR: [{ managerId: user.id }, { id: user.id }], deletedAt: null },
        select: { id: true },
      });
      where.OR = [
        { managerId: user.id },
        { counsellorId: { in: members.map((m) => m.id) } },
      ];
    }

    if (query.stage) where.stage = query.stage;
    if (query.sub_stage || query.subStage) where.subStage = query.sub_stage || query.subStage;
    if (query.school_id || query.schoolId) where.schoolId = query.school_id || query.schoolId;
    if (query.counsellor_id || query.counsellorId) {
      where.counsellorId = query.counsellor_id || query.counsellorId;
    }
    if (query.lead_id || query.leadId) where.leadId = query.lead_id || query.leadId;

    const admissions = await this.prisma.admission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        school: true,
        lead: true,
        manager: true,
        counsellor: {
          include: { team: { include: { manager: true } } },
        },
        commissions: true,
      },
    });

    const formatted = admissions.map((a) => this.formatAdmission(a));
    return apiEnvelope(formatted, 'Applications loaded', {
      admissions: formatted,
      applications: formatted,
    });
  }

  async findOne(id: string, user?: any) {
    const adm = await this.prisma.admission.findFirst({
      where: {
        OR: [{ id }, { admissionNumber: id }, { receiptNumber: id }],
        deletedAt: null,
      },
      include: {
        school: true,
        lead: true,
        manager: true,
        counsellor: { include: { team: { include: { manager: true } } } },
        commissions: true,
      },
    });
    if (!adm) throw new NotFoundException('Application not found');

    const role = toBlueprintRole(user?.role);
    if (role === 'jr_counsellor' && adm.counsellorId !== user.id) {
      throw new ForbiddenException('Access denied to this application');
    }

    const formatted = this.formatAdmission(adm);
    return apiEnvelope(formatted, 'Application details', {
      admission: formatted,
      application: formatted,
    });
  }

  /**
   * Creates either a Multi-School Application (/applications) or an Admission record (/admissions)
   * Enforces Feature 3: commission ONLY triggers when sub_stage === 'C_formalities_done'.
   */
  async createAdmission(data: any, user?: any, defaultStage = 'applied') {
    const rawLeadId = data.leadId || data.lead_id;
    const lead = await this.prisma.lead.findFirst({
      where: {
        OR: [{ id: rawLeadId }, { leadNumber: rawLeadId }],
        deletedAt: null,
      },
      include: {
        assignedCounsellor: { include: { team: true, manager: true } },
      },
    });
    if (!lead) throw new NotFoundException('Lead not found');

    if (lead.forceExpired || lead.isMerged) {
      throw new BadRequestException(
        `Cannot create application for ${lead.forceExpired ? 'force-expired' : 'merged'} lead.`,
      );
    }

    let schoolRef = data.schoolId || data.school_id || lead.preferredSchoolId;
    let schoolRecord: any = null;
    if (schoolRef) {
      schoolRecord = await this.prisma.school.findFirst({
        where: {
          OR: [{ id: schoolRef }, { schoolCode: schoolRef }, { name: schoolRef }],
          deletedAt: null,
        },
      });
    }
    if (!schoolRecord) {
      schoolRecord = await this.prisma.school.findFirst({
        where: { status: 'active', deletedAt: null },
        orderBy: { rank: 'asc' },
      });
    }
    if (!schoolRecord) throw new NotFoundException('School not found');
    if (schoolRecord.status !== 'active') {
      throw new BadRequestException(
        `School ${schoolRecord.name} is inactive and cannot accept new applications.`,
      );
    }

    const existingSameSchool = await this.prisma.admission.findFirst({
      where: {
        leadId: lead.id,
        schoolId: schoolRecord.id,
        deletedAt: null,
        status: { not: 'Cancelled' },
        stage: { not: 'closed' },
      },
    });
    if (existingSameSchool) {
      throw new BadRequestException(
        'An active application already exists for this student at this school.',
      );
    }

    const subStage = data.subStage || data.sub_stage || 'A_waiting';
    if (!ALLOWED_SUB_STAGES.includes(subStage as any)) {
      throw new BadRequestException(
        `Invalid sub_stage. Allowed: ${ALLOWED_SUB_STAGES.join(', ')}`,
      );
    }

    const stage = data.stage || defaultStage;
    if (!ALLOWED_STAGES.includes(stage as any)) {
      throw new BadRequestException(`Invalid stage. Allowed: ${ALLOWED_STAGES.join(', ')}`);
    }

    const appCode = await this.nextAppCode();
    const randSuffix = `${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 90 + 10)}`;
    const receiptNumber = `RCP-2026-${appCode}-${randSuffix}`;
    const revenue = Number(
      data.confirmedRevenue || data.feeAgreed || data.fee_agreed || schoolRecord.minFeeAnnual || 250000,
    );
    const counsellorId = lead.assignedCounsellorId || user?.id;
    const isStageC = subStage === 'C_formalities_done';

    const admission = await this.prisma.$transaction(async (tx) => {
      const created = await tx.admission.create({
        data: {
          admissionNumber: appCode,
          receiptNumber,
          applicationNumber: data.applicationNumber || data.school_app_no || appCode,
          schoolAppNo: data.schoolAppNo || data.school_app_no || null,
          leadId: lead.id,
          schoolId: schoolRecord.id,
          counsellorId,
          managerId:
            lead.assignedManagerId ||
            lead.assignedCounsellor?.managerId ||
            lead.assignedCounsellor?.team?.managerId ||
            null,
          teamId: lead.teamId || lead.assignedCounsellor?.teamId || null,
          studentName: lead.studentName,
          parentName: lead.parentName,
          schoolName: schoolRecord.name,
          admissionClass: data.admissionClass || lead.applyingForGrade || 'Class 6',
          academicYear: data.academicYear || lead.academicYear || '2026-27',
          feeAgreed: revenue,
          proofDocument: data.proofDocument || receiptNumber,
          stage,
          status: stage === 'admission_done' ? 'Admission Confirmed' : stage,
          subStage,
          conferenceCallStatus: data.conferenceCallStatus || null,
          testDate: data.testDate ? new Date(data.testDate) : null,
          visitDate: data.visitDate ? new Date(data.visitDate) : null,
          nextFollowUpDate: data.nextFollowUpDate ? new Date(data.nextFollowUpDate) : null,
          commissionGenerated: isStageC,
        },
        include: {
          school: true,
          lead: true,
          manager: true,
          counsellor: { include: { team: { include: { manager: true } } } },
        },
      });

      const remarksJson = Array.isArray(lead.remarksJson)
        ? [...(lead.remarksJson as any[])]
        : [];
      remarksJson.push({
        author: user?.fullName || 'System',
        role: user?.role || 'manager',
        note: `Application ${appCode} created for ${schoolRecord.name} (Stage: ${stage}, Sub-Stage: ${subStage})`,
        createdAt: new Date().toISOString(),
      });

      await tx.lead.update({
        where: { id: lead.id },
        data: {
          status:
            stage === 'admission_done'
              ? LeadStatus.admission_done
              : this.stageToLeadStatus(stage, subStage),
          verificationStatus:
            stage === 'admission_done' ? VerificationStatus.APPROVED : lead.verificationStatus,
          preferredSchoolId: lead.preferredSchoolId || schoolRecord.id,
          remarksJson,
          version: { increment: 1 },
        },
      });

      let generatedCommissions: any[] = [];
      if (isStageC) {
        generatedCommissions = await this.commissionsService.generateAdmissionCommissions(
          created.id,
          user,
          tx,
        );
      }

      await tx.auditLog.create({
        data: {
          userId: user?.id || counsellorId,
          userName: user?.fullName || 'User',
          userRole: user?.role || 'manager',
          action: 'CREATE',
          module: 'application',
          entity: 'Admission',
          entityId: created.id,
          newValue: { appCode, schoolName: schoolRecord.name, stage, subStage, revenue },
          details: { message: `Application ${appCode} created` },
        },
      });

      return { created, generatedCommissions };
    });

    const formatted = this.formatAdmission(admission.created);
    return apiEnvelope(
      formatted,
      isStageC
        ? 'Application confirmed at Sub-Stage C & commission generated!'
        : `Application recorded (${stage} / ${subStage}). Commission awaits Sub-Stage C.`,
      {
        admission: formatted,
        application: formatted,
        commissions: admission.generatedCommissions,
      },
    );
  }

  async updateStage(id: string, body: any, user?: any) {
    const stage = body.stage;
    if (!ALLOWED_STAGES.includes(stage)) {
      throw new BadRequestException(`Invalid stage. Allowed: ${ALLOWED_STAGES.join(', ')}`);
    }

    const adm = await this.prisma.admission.findFirst({
      where: { OR: [{ id }, { admissionNumber: id }], deletedAt: null },
      include: { lead: true },
    });
    if (!adm) throw new NotFoundException('Application not found');

    if (body.version !== undefined && Number(body.version) !== adm.version) {
      throw new ConflictException(
        'Application was updated by another user. Please refresh and retry.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const upd = await tx.admission.updateMany({
        where: { id: adm.id, version: adm.version },
        data: {
          stage,
          status: stage === 'admission_done' ? 'Admission Confirmed' : stage,
          nextFollowUpDate: body.nextFollowUpDate ? new Date(body.nextFollowUpDate) : adm.nextFollowUpDate,
          version: { increment: 1 },
        },
      });
      if (upd.count === 0) throw new ConflictException('Concurrent modification conflict');

      await tx.lead.update({
        where: { id: adm.leadId },
        data: {
          status: this.stageToLeadStatus(stage, adm.subStage),
          version: { increment: 1 },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user?.id || null,
          userName: user?.fullName || 'User',
          userRole: user?.role || 'manager',
          action: 'UPDATE',
          module: 'application',
          entity: 'Admission',
          entityId: adm.id,
          oldValue: { stage: adm.stage },
          newValue: { stage },
        },
      });

      return tx.admission.findUnique({
        where: { id: adm.id },
        include: {
          school: true,
          lead: true,
          manager: true,
          counsellor: { include: { team: { include: { manager: true } } } },
          commissions: true,
        },
      });
    });

    const formatted = this.formatAdmission(updated);
    return apiEnvelope(formatted, `Application stage updated to ${stage}`, {
      admission: formatted,
      application: formatted,
    });
  }

  async updateSubStage(id: string, subStage: string, user?: any, version?: number) {
    if (!ALLOWED_SUB_STAGES.includes(subStage as any)) {
      throw new BadRequestException(
        `Invalid sub-stage. Allowed values: ${ALLOWED_SUB_STAGES.join(', ')}`,
      );
    }

    const admission = await this.prisma.admission.findFirst({
      where: { OR: [{ id }, { admissionNumber: id }], deletedAt: null },
      include: { commissions: true },
    });
    if (!admission) throw new NotFoundException('Application not found');

    if (version !== undefined && Number(version) !== admission.version) {
      throw new ConflictException(
        'Application was updated by another user. Please refresh and retry.',
      );
    }

    const oldSubStage = admission.subStage;
    const isTransitionToC = subStage === 'C_formalities_done';
    const hasActiveCommission = admission.commissions.some(
      (c) => !['reversed', 'REVERSED'].includes(String(c.status)),
    );
    const shouldGenerate = isTransitionToC && !hasActiveCommission;

    const txResult = await this.prisma.$transaction(async (tx) => {
      const upd = await tx.admission.updateMany({
        where: { id: admission.id, version: admission.version },
        data: {
          subStage,
          stage: isTransitionToC ? 'admission_done' : admission.stage,
          status: isTransitionToC ? 'Admission Confirmed' : admission.status,
          admissionDate: isTransitionToC ? new Date() : admission.admissionDate,
          commissionGenerated: admission.commissionGenerated || isTransitionToC,
          version: { increment: 1 },
        },
      });
      if (upd.count === 0) throw new ConflictException('Concurrent modification conflict');

      if (isTransitionToC) {
        await tx.lead.update({
          where: { id: admission.leadId },
          data: {
            status: LeadStatus.admission_done,
            verificationStatus: VerificationStatus.APPROVED,
            version: { increment: 1 },
          },
        });
      }

      let commissions: any[] = [];
      if (shouldGenerate) {
        commissions = await this.commissionsService.generateAdmissionCommissions(
          admission.id,
          user,
          tx,
        );
      }

      await tx.auditLog.create({
        data: {
          userId: user?.id || null,
          userName: user?.fullName || 'User',
          userRole: user?.role || 'manager',
          action: 'UPDATE',
          module: 'application',
          entity: 'Admission',
          entityId: admission.id,
          oldValue: { subStage: oldSubStage },
          newValue: { subStage },
          details: {
            appCode: admission.admissionNumber,
            oldSubStage,
            newSubStage: subStage,
            commissionsGenerated: shouldGenerate,
          },
        },
      });

      const refreshed = await tx.admission.findUnique({
        where: { id: admission.id },
        include: {
          school: true,
          lead: true,
          manager: true,
          counsellor: { include: { team: { include: { manager: true } } } },
          commissions: true,
        },
      });
      return { refreshed, commissions };
    }, { maxWait: 15000, timeout: 45000 });

    const formatted = this.formatAdmission(txResult.refreshed);
    return apiEnvelope(
      formatted,
      shouldGenerate
        ? 'Sub-Stage updated to C (Formalities Done) and commission generated!'
        : `Sub-stage updated from ${oldSubStage} to ${subStage}.`,
      {
        admission: formatted,
        application: formatted,
        commission: txResult.commissions?.[0] || null,
        commissions: txResult.commissions,
      },
    );
  }

  async logConferenceCall(id: string, body: any, user?: any) {
    const adm = await this.prisma.admission.findFirst({
      where: { OR: [{ id }, { admissionNumber: id }], deletedAt: null },
    });
    if (!adm) throw new NotFoundException('Application not found');

    if (body.version !== undefined && Number(body.version) !== adm.version) {
      throw new ConflictException('Concurrent modification conflict. Please refresh.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const upd = await tx.admission.update({
        where: { id: adm.id },
        data: {
          stage: 'conference_call',
          status: 'conference_call',
          conferenceCallStatus: body.status || body.conferenceCallStatus || 'done',
          conferenceCallNotes: body.notes || body.conferenceCallNotes || null,
          conferenceCallAt: body.scheduledAt ? new Date(body.scheduledAt) : new Date(),
          version: { increment: 1 },
        },
        include: {
          school: true,
          lead: true,
          manager: true,
          counsellor: { include: { team: { include: { manager: true } } } },
        },
      });

      await tx.lead.update({
        where: { id: adm.leadId },
        data: { status: LeadStatus.conference_call, version: { increment: 1 } },
      });

      await tx.auditLog.create({
        data: {
          userId: user?.id || null,
          userName: user?.fullName || 'Counsellor',
          userRole: user?.role || 'jr_counsellor',
          action: 'UPDATE',
          module: 'application',
          entity: 'Admission',
          entityId: adm.id,
          newValue: { stage: 'conference_call', conferenceCallStatus: upd.conferenceCallStatus },
        },
      });
      return upd;
    });

    const formatted = this.formatAdmission(updated);
    return apiEnvelope(formatted, 'Conference call milestone logged', {
      application: formatted,
    });
  }

  async logVisitAndRegistration(id: string, body: any, user?: any) {
    const adm = await this.prisma.admission.findFirst({
      where: { OR: [{ id }, { admissionNumber: id }], deletedAt: null },
    });
    if (!adm) throw new NotFoundException('Application not found');

    if (body.version !== undefined && Number(body.version) !== adm.version) {
      throw new ConflictException('Concurrent modification conflict. Please refresh.');
    }

    const nextStage = body.stage || (body.visitDate ? 'visit_registration' : 'test_interview');
    const updated = await this.prisma.$transaction(async (tx) => {
      const upd = await tx.admission.update({
        where: { id: adm.id },
        data: {
          stage: nextStage,
          status: nextStage,
          testDate: body.testDate ? new Date(body.testDate) : adm.testDate,
          visitDate: body.visitDate ? new Date(body.visitDate) : adm.visitDate,
          registrationNumber: body.registrationNumber || body.registration_number || adm.registrationNumber,
          schoolAppNo: body.schoolAppNo || body.school_app_no || adm.schoolAppNo,
          version: { increment: 1 },
        },
        include: {
          school: true,
          lead: true,
          manager: true,
          counsellor: { include: { team: { include: { manager: true } } } },
        },
      });

      await tx.lead.update({
        where: { id: adm.leadId },
        data: {
          status: this.stageToLeadStatus(nextStage, upd.subStage),
          version: { increment: 1 },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user?.id || null,
          userName: user?.fullName || 'Counsellor',
          userRole: user?.role || 'jr_counsellor',
          action: 'UPDATE',
          module: 'application',
          entity: 'Admission',
          entityId: adm.id,
          newValue: {
            stage: nextStage,
            registrationNumber: upd.registrationNumber,
            visitDate: upd.visitDate,
          },
        },
      });
      return upd;
    });

    const formatted = this.formatAdmission(updated);
    return apiEnvelope(formatted, 'Test / campus visit details recorded', {
      application: formatted,
    });
  }

  async logSelection(id: string, body: any, user?: any) {
    const adm = await this.prisma.admission.findFirst({
      where: { OR: [{ id }, { admissionNumber: id }], deletedAt: null },
    });
    if (!adm) throw new NotFoundException('Application not found');

    const selectionStatus = body.selectionStatus || body.selection_status || 'selected';
    const stage = selectionStatus === 'rejected' ? 'closed' : 'selected';

    const updated = await this.prisma.$transaction(async (tx) => {
      const upd = await tx.admission.update({
        where: { id: adm.id },
        data: {
          stage,
          status: stage,
          selectionStatus,
          selectedDate: body.selectedDate ? new Date(body.selectedDate) : new Date(),
          version: { increment: 1 },
        },
        include: {
          school: true,
          lead: true,
          manager: true,
          counsellor: { include: { team: { include: { manager: true } } } },
        },
      });

      await tx.lead.update({
        where: { id: adm.leadId },
        data: { status: this.stageToLeadStatus(stage, adm.subStage), version: { increment: 1 } },
      });

      await tx.auditLog.create({
        data: {
          userId: user?.id || null,
          userName: user?.fullName || 'Manager',
          userRole: user?.role || 'manager',
          action: 'UPDATE',
          module: 'application',
          entity: 'Admission',
          entityId: adm.id,
          newValue: { stage, selectionStatus },
        },
      });
      return upd;
    });

    const formatted = this.formatAdmission(updated);
    return apiEnvelope(formatted, `Selection result saved (${selectionStatus})`, {
      application: formatted,
    });
  }

  async confirmChildAdmission(id: string, body: any, user?: any) {
    const adm = await this.prisma.admission.findFirst({
      where: { OR: [{ id }, { admissionNumber: id }], deletedAt: null },
      include: { commissions: true },
    });
    if (!adm) throw new NotFoundException('Application not found');

    const subStage = body.subStage || body.sub_stage || adm.subStage || 'A_waiting';
    if (!ALLOWED_SUB_STAGES.includes(subStage as any)) {
      throw new BadRequestException(`Invalid sub-stage: ${subStage}`);
    }

    const isStageC = subStage === 'C_formalities_done';
    const txResult = await this.prisma.$transaction(async (tx) => {
      const upd = await tx.admission.update({
        where: { id: adm.id },
        data: {
          stage: 'admission_done',
          status: 'Admission Confirmed',
          subStage,
          admissionDate: body.admissionDate ? new Date(body.admissionDate) : new Date(),
          childDropDate: body.childDropDate ? new Date(body.childDropDate) : null,
          feeAgreed: Number(body.feeAgreed || body.fee_agreed || adm.feeAgreed || 250000),
          proofDocument: body.proofDocument || adm.proofDocument,
          commissionGenerated: adm.commissionGenerated || isStageC,
          version: { increment: 1 },
        },
        include: {
          school: true,
          lead: true,
          manager: true,
          counsellor: { include: { team: { include: { manager: true } } } },
        },
      });

      await tx.lead.update({
        where: { id: adm.leadId },
        data: {
          status: LeadStatus.admission_done,
          verificationStatus: VerificationStatus.APPROVED,
          version: { increment: 1 },
        },
      });

      let commissions: any[] = [];
      if (isStageC) {
        commissions = await this.commissionsService.generateAdmissionCommissions(
          adm.id,
          user,
          tx,
        );
      }

      await tx.auditLog.create({
        data: {
          userId: user?.id || null,
          userName: user?.fullName || 'Manager',
          userRole: user?.role || 'manager',
          action: 'UPDATE',
          module: 'application',
          entity: 'Admission',
          entityId: adm.id,
          newValue: {
            stage: 'admission_done',
            subStage,
            feeAgreed: upd.feeAgreed,
            commissionsGenerated: commissions.length > 0,
          },
        },
      });

      return { upd, commissions };
    });

    const formatted = this.formatAdmission(txResult.upd);
    return apiEnvelope(
      formatted,
      isStageC
        ? 'Admission confirmed at Sub-Stage C and commission generated!'
        : `Admission confirmed at Sub-Stage ${subStage}. Commission awaits Sub-Stage C.`,
      {
        admission: formatted,
        application: formatted,
        commission: txResult.commissions?.[0] || null,
        commissions: txResult.commissions,
      },
    );
  }

  async cancelAdmission(id: string, reason?: string, user?: any) {
    const admission = await this.prisma.admission.findFirst({
      where: { OR: [{ id }, { admissionNumber: id }], deletedAt: null },
      include: { commissions: true, lead: true },
    });
    if (!admission) throw new NotFoundException('Admission not found');

    const cleanReason =
      reason && reason.trim().length >= 5
        ? reason.trim()
        : 'Admission cancelled before formalities completion';

    const updated = await this.prisma.admission.update({
      where: { id: admission.id },
      data: {
        stage: 'closed',
        status: 'Cancelled',
        cancellationReason: cleanReason,
        cancelledAt: new Date(),
        version: { increment: 1 },
      },
      include: {
        school: true,
        lead: true,
        manager: true,
        counsellor: { include: { team: { include: { manager: true } } } },
      },
    });

    await this.prisma.lead.update({
      where: { id: admission.leadId },
      data: { status: LeadStatus.closed, version: { increment: 1 } },
    });

    for (const comm of admission.commissions) {
      if (!['reversed', 'REVERSED'].includes(String(comm.status)) && comm.amount > 0) {
        await this.commissionsService.reverseCommission(comm.id, cleanReason, user);
      }
    }

    await this.prisma.auditLog.create({
      data: {
        userId: user?.id || null,
        userName: user?.fullName || 'Admin',
        userRole: user?.role || 'super_admin',
        action: 'UPDATE',
        module: 'application',
        entity: 'Admission',
        entityId: admission.id,
        details: { appCode: admission.admissionNumber, reason: cleanReason },
        isSpecialFlag: true,
      },
    });

    const formatted = this.formatAdmission(updated);
    return apiEnvelope(
      formatted,
      'Admission cancelled and linked commissions reversed.',
      { admission: formatted },
    );
  }

  async generateAdmissionPdf(admissionId: string): Promise<Buffer> {
    const admission = await this.prisma.admission.findFirst({
      where: { OR: [{ id: admissionId }, { admissionNumber: admissionId }] },
      include: {
        school: true,
        lead: true,
        counsellor: true,
      },
    });

    if (!admission) throw new NotFoundException('Admission not found');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #172B4D; }
          .header { text-align: center; border-bottom: 3px solid #123B70; padding-bottom: 20px; margin-bottom: 30px; }
          .title { font-size: 24px; font-weight: bold; color: #123B70; margin: 0; }
          .subtitle { font-size: 13px; color: #64748b; margin-top: 5px; }
          .badge { display: inline-block; background: #e0f2fe; color: #0284c7; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: bold; margin-top: 10px; }
          .grid { display: flex; justify-content: space-between; margin-bottom: 25px; }
          .box { width: 48%; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; }
          .box h3 { margin: 0 0 10px 0; font-size: 14px; color: #123B70; text-transform: uppercase; }
          .field { margin-bottom: 6px; font-size: 13px; }
          .table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          .table th { background: #123B70; color: white; text-align: left; padding: 10px; font-size: 12px; }
          .table td { border-bottom: 1px solid #e2e8f0; padding: 12px 10px; font-size: 13px; }
          .footer { margin-top: 50px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="title">BOARDINGEDU ADMISSION CONFIRMATION</h1>
          <div class="subtitle">Official Boarding School Placement & Sub-Stage Verification Slip</div>
          <div class="badge">APP #: ${admission.admissionNumber} &bull; RECEIPT #: ${admission.receiptNumber}</div>
        </div>
        <div class="grid">
          <div class="box">
            <h3>Student & Parent Dossier</h3>
            <div class="field"><strong>Student Name:</strong> ${admission.lead?.studentName || admission.studentName}</div>
            <div class="field"><strong>Applying Grade:</strong> ${admission.lead?.applyingForGrade || admission.admissionClass}</div>
            <div class="field"><strong>Parent Name:</strong> ${admission.lead?.parentName || admission.parentName}</div>
            <div class="field"><strong>Contact:</strong> ${admission.lead?.parentPhone || 'N/A'}</div>
          </div>
          <div class="box">
            <h3>Institution & Placement</h3>
            <div class="field"><strong>School:</strong> ${admission.school?.name || admission.schoolName}</div>
            <div class="field"><strong>City:</strong> ${admission.school?.city || ''}, ${admission.school?.state || ''}</div>
            <div class="field"><strong>Academic Session:</strong> ${admission.academicYear}</div>
            <div class="field"><strong>Sub-Stage:</strong> ${admission.subStage}</div>
            <div class="field"><strong>Assigned Counsellor:</strong> ${admission.counsellor?.fullName || 'N/A'}</div>
          </div>
        </div>
        <table class="table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Term</th>
              <th>Status</th>
              <th style="text-align: right;">Annual Fee (INR)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Residential Tuition & Boarding Fees</td>
              <td>${admission.academicYear}</td>
              <td><span style="color: #16a34a; font-weight: bold;">${String(admission.status).toUpperCase()}</span></td>
              <td style="text-align: right; font-weight: bold;">₹${Number(admission.feeAgreed || 0).toLocaleString('en-IN')}</td>
            </tr>
          </tbody>
        </table>
        <div class="footer">
          Generated automatically by BoardingEdu CRM Enterprise Core. Valid without physical signature.
        </div>
      </body>
      </html>
    `;

    try {
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      try {
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
        });
        return Buffer.from(pdfBuffer);
      } finally {
        await browser.close();
      }
    } catch {
      // Minimal valid PDF fallback if Chromium binary is unavailable in restricted environment
      const summary = `BOARDINGEDU RECEIPT ${admission.admissionNumber} - ${admission.studentName} - INR ${admission.feeAgreed}`;
      return Buffer.from(
        `%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n4 0 obj << /Length ${summary.length + 45} >> stream\nBT /F1 12 Tf 40 720 Td (${summary.replace(/[()\\]/g, '')}) Tj ET\nendstream\nendobj\n5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\nxref\n0 6\n0000000000 65535 f \ntrailer << /Size 6 /Root 1 0 R >>\nstartxref\n0\n%%EOF`,
      );
    }
  }
}
