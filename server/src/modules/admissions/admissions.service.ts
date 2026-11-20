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
        installments: {
          orderBy: { installmentNumber: 'asc' },
        },
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
        installments: {
          orderBy: { installmentNumber: 'asc' },
        },
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
    const parentInterested = body.parentInterested !== false && body.parent_interested !== false;

    let rejectionOutcome: 'continue' | 'reopened' | 'expired' | null = null;
    if (selectionStatus === 'rejected') {
      const otherActiveCount = await this.prisma.admission.count({
        where: {
          leadId: adm.leadId,
          id: { not: adm.id },
          deletedAt: null,
          stage: { notIn: ['closed'] },
          OR: [{ selectionStatus: null }, { selectionStatus: { not: 'rejected' } }],
        },
      });
      if (otherActiveCount > 0) {
        rejectionOutcome = 'continue';
      } else {
        rejectionOutcome = parentInterested ? 'reopened' : 'expired';
      }
    }

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

      if (rejectionOutcome === 'reopened') {
        await tx.lead.update({
          where: { id: adm.leadId },
          data: { status: 'reopened', expiryStatus: 'ACTIVE', version: { increment: 1 } },
        });
        await tx.leadRemark.create({
          data: {
            leadId: adm.leadId,
            userId: user?.id || null,
            userName: user?.fullName || 'Manager',
            userRole: user?.role || 'manager',
            content: `Reopened on ${new Date().toLocaleDateString('en-IN')} — School rejected (${upd.school?.name || 'School'}), parent interested in alternative schools.`,
          },
        });
      } else if (rejectionOutcome === 'expired') {
        await tx.lead.update({
          where: { id: adm.leadId },
          data: { status: 'expired', expiryStatus: 'EXPIRED', version: { increment: 1 } },
        });
      } else if (rejectionOutcome !== 'continue') {
        await tx.lead.update({
          where: { id: adm.leadId },
          data: { status: this.stageToLeadStatus(stage, adm.subStage), version: { increment: 1 } },
        });
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
          newValue: { stage, selectionStatus, rejectionOutcome },
        },
      });
      return upd;
    });

    if (rejectionOutcome === 'reopened') {
      await this.notifications
        ?.notifyRoles(['manager', 'super_admin', 'SENIOR_MANAGER', 'SUPER_ADMIN'], {
          type: 'lead_reopened',
          title: `Lead [${updated.lead?.leadNumber || updated.leadId}] — School Rejected, Reopened`,
          message: `Lead [${updated.lead?.leadNumber || updated.leadId}] – school rejected (${updated.school?.name || 'School'}), parent interested, reopened.`,
          relatedEntityId: updated.leadId,
          relatedEntityType: 'lead',
          link: `/leads/${updated.leadId}`,
        })
        .catch(() => {});
    }

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

  // =========================================================================
  // VIRTUAL ZOOM TOURS & CAMPUS VISITS
  // =========================================================================

  async getUpcomingTours(actor: any) {
    return this.prisma.schoolTour.findMany({
      include: {
        lead: {
          select: {
            id: true,
            leadNumber: true,
            studentName: true,
            parentName: true,
            parentPhone: true,
            city: true,
            annualBudget: true,
            budgetMax: true,
          },
        },
        school: {
          select: {
            id: true,
            name: true,
            city: true,
            feesDisplay: true,
          },
        },
      },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  async scheduleTour(body: any, actor: any) {
    const leadRef = body.leadId || body.lead_id;
    if (!leadRef) throw new BadRequestException('leadId is required');

    const lead = await this.prisma.lead.findFirst({
      where: { OR: [{ id: leadRef }, { leadNumber: leadRef }] },
    });
    if (!lead) throw new NotFoundException('Lead not found');

    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : new Date(Date.now() + 86400000);
    const tourType = body.tourType || 'ONLINE_ZOOM';
    const zoomMeetingUrl =
      body.zoomMeetingUrl || 'https://zoom.us/j/8492041924?pwd=boardingedu';

    let schoolName = body.schoolName || null;
    let schoolId = body.schoolId || null;

    if (!schoolName && schoolId) {
      const s = await this.prisma.school.findUnique({ where: { id: schoolId } });
      schoolName = s?.name || null;
    }

    const tour = await this.prisma.schoolTour.create({
      data: {
        leadId: lead.id,
        schoolId,
        schoolName,
        tourType,
        scheduledAt,
        zoomMeetingUrl,
        status: 'SCHEDULED',
      },
      include: { lead: true, school: true },
    });

    try {
      await this.prisma.leadRemark.create({
        data: {
          leadId: lead.id,
          userId: actor?.id || null,
          userName: actor?.fullName || 'System',
          userRole: actor?.role || 'SYSTEM',
          content: `📅 ${tourType === 'ONLINE_ZOOM' ? 'Virtual Zoom Tour' : 'Campus Visit'} Scheduled for ${scheduledAt.toLocaleString('en-IN')} (${schoolName || 'School'}). Zoom URL: ${zoomMeetingUrl}`,
        },
      });
    } catch {}

    try {
      await this.notifications?.notifyRoles(['manager', 'super_admin', 'SENIOR_MANAGER', 'SUPER_ADMIN'], {
        type: 'tour_scheduled',
        title: `📅 New Tour Scheduled: ${lead.studentName}`,
        message: `${tourType === 'ONLINE_ZOOM' ? 'Virtual Zoom Tour' : 'Campus Visit'} booked for ${lead.studentName} (${schoolName || 'School'}) on ${scheduledAt.toLocaleString('en-IN')}`,
        relatedEntityId: tour.id,
        relatedEntityType: 'tour',
        link: `/tours`,
      });
    } catch {}

    return tour;
  }

  async completeTour(tourId: string, body: any, actor: any) {
    const tour = await this.prisma.schoolTour.findUnique({
      where: { id: tourId },
      include: { lead: true, school: true },
    });
    if (!tour) throw new NotFoundException('Tour not found');

    const proceedAdmission = Boolean(body.proceedAdmission ?? body.proceed_admission);
    const postTourFeedback = body.feedback || body.notes || body.postTourFeedback || '';

    const updatedTour = await this.prisma.schoolTour.update({
      where: { id: tourId },
      data: {
        status: 'COMPLETED',
        proceedAdmission,
        postTourFeedback,
      },
    });

    let admissionRecord: any = null;

    // If parent agreed to proceed with admission -> auto-generate Admission and 3-Tier Fee Installments!
    if (proceedAdmission && tour.lead) {
      const totalFee = Number(
        body.totalFee ||
        body.agreedFee ||
        tour.school?.minFeeAnnual ||
        tour.lead.budgetMax ||
        400000,
      );

      // Check if admission exists or create new
      admissionRecord = await this.prisma.admission.findFirst({
        where: {
          leadId: tour.leadId,
          ...(tour.schoolId ? { schoolId: tour.schoolId } : {}),
        },
      });

      if (!admissionRecord) {
        const targetSchoolId = tour.schoolId || (await this.prisma.school.findFirst())?.id;
        if (targetSchoolId) {
          const appCode = await this.nextAppCode();
          const fallbackUser = await this.prisma.user.findFirst({ where: { deletedAt: null } });
          const finalCounsellorId = tour.lead.assignedCounsellorId || actor?.id || fallbackUser?.id;
          const finalManagerId = tour.lead.assignedManagerId || actor?.id || fallbackUser?.id;
          admissionRecord = await this.prisma.admission.create({
            data: {
              admissionNumber: appCode,
              receiptNumber: `REC-${appCode}`,
              leadId: tour.leadId,
              schoolId: targetSchoolId,
              counsellorId: finalCounsellorId,
              managerId: finalManagerId,
              studentName: tour.lead.studentName,
              parentName: tour.lead.parentName,
              schoolName: tour.schoolName || tour.school?.name || 'Partner School',
              admissionClass: String(tour.lead.applyingForGrade || tour.lead.classGrade || '6'),
              academicYear: tour.lead.academicYear || '2026-27',
              feeAgreed: totalFee,
              stage: 'selected',
              status: 'selected',
            },
          });
        }
      }

      // Auto-generate 3-tier milestone installment plan (30%, 50%, 20%)
      if (admissionRecord) {
        await this.setupDefaultInstallments(admissionRecord.id, totalFee);
      }
    }

    try {
      await this.prisma.leadRemark.create({
        data: {
          leadId: tour.leadId,
          userId: actor.id,
          userName: actor.fullName,
          userRole: actor.role,
          content: `✅ Virtual Tour Completed! Proceed with Admission: [${proceedAdmission ? 'YES' : 'NO'}]. Feedback: ${postTourFeedback}`,
        },
      });
    } catch {}

    try {
      await this.notifications?.notifyRoles(['manager', 'super_admin', 'SENIOR_MANAGER', 'SUPER_ADMIN'], {
        type: 'tour_completed',
        title: `✅ Tour Completed: ${tour.lead?.studentName} - ${proceedAdmission ? 'ADMISSION PROCEEDING! 🎉' : 'Parent Considering'}`,
        message: `${actor.fullName} completed tour for ${tour.lead?.studentName}. Decision: ${proceedAdmission ? 'YES (Proceed to Admission & Fee Plan)' : 'NO / Not Ready'}. Feedback: ${postTourFeedback}`,
        relatedEntityId: tour.id,
        relatedEntityType: 'tour',
        link: proceedAdmission && admissionRecord ? `/admissions/${admissionRecord.id}` : `/tours`,
      });
    } catch {}

    return {
      success: true,
      tour: updatedTour,
      admission: admissionRecord,
      message: proceedAdmission
        ? 'Tour marked completed. Admission record and 3-Tier Fee Installment plan generated!'
        : 'Tour feedback recorded.',
    };
  }

  // =========================================================================
  // 3-TIER MILESTONE FEE INSTALLMENT TRACKING (MANAGER & ADMIN ONLY)
  // =========================================================================

  private async setupDefaultInstallments(admissionId: string, totalFee: number) {
    // Delete existing pending installments if any
    await this.prisma.admissionInstallment.deleteMany({
      where: { admissionId, status: 'PENDING' },
    });

    const now = new Date();
    const dateM2 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000); // 2 months
    const dateM3 = new Date(now.getTime() + 120 * 24 * 60 * 60 * 1000); // 4 months

    const inst1Amount = Math.round(totalFee * 0.3); // 30%
    const inst2Amount = Math.round(totalFee * 0.5); // 50%
    const inst3Amount = totalFee - inst1Amount - inst2Amount; // 20% remaining

    await this.prisma.admissionInstallment.createMany({
      data: [
        {
          admissionId,
          installmentNumber: 1,
          title: 'Milestone 1: 30% Token & Admission Fee',
          percentage: 30,
          amount: inst1Amount,
          dueDate: now,
          status: 'PENDING',
        },
        {
          admissionId,
          installmentNumber: 2,
          title: 'Milestone 2: 50% 2nd Term (After 2 Months)',
          percentage: 50,
          amount: inst2Amount,
          dueDate: dateM2,
          status: 'PENDING',
        },
        {
          admissionId,
          installmentNumber: 3,
          title: 'Milestone 3: 20% Final Clearance',
          percentage: 20,
          amount: inst3Amount,
          dueDate: dateM3,
          status: 'PENDING',
        },
      ],
    });
  }

  async getInstallments(admissionId: string, actor: any) {
    const admission = await this.prisma.admission.findUnique({
      where: { id: admissionId },
      include: {
        lead: {
          select: {
            id: true,
            studentName: true,
            parentName: true,
            parentPhone: true,
            leadNumber: true,
          },
        },
        school: {
          select: {
            id: true,
            name: true,
            feesDisplay: true,
          },
        },
        installments: {
          orderBy: { installmentNumber: 'asc' },
        },
      },
    });
    if (!admission) throw new NotFoundException('Admission record not found');

    const totalAgreed = Number(admission.feeAgreed || 0);
    const paidAmount = admission.installments
      .filter((i) => i.status === 'PAID')
      .reduce((sum, i) => sum + i.amount, 0);
    const pendingAmount = totalAgreed - paidAmount;
    const progressPercent = totalAgreed > 0 ? Math.round((paidAmount / totalAgreed) * 100) : 0;

    return {
      admission,
      summary: {
        totalAgreed,
        paidAmount,
        pendingAmount,
        progressPercent,
      },
    };
  }

  async setupInstallmentPlan(admissionId: string, body: any, actor: any) {
    const admission = await this.prisma.admission.findUnique({
      where: { id: admissionId },
    });
    if (!admission) throw new NotFoundException('Admission record not found');

    const totalFee = Number(body.totalFee || admission.feeAgreed || 400000);
    await this.prisma.admission.update({
      where: { id: admissionId },
      data: { feeAgreed: totalFee },
    });

    if (body.customInstallments && Array.isArray(body.customInstallments)) {
      await this.prisma.admissionInstallment.deleteMany({
        where: { admissionId, status: 'PENDING' },
      });
      await this.prisma.admissionInstallment.createMany({
        data: body.customInstallments.map((inst: any, idx: number) => ({
          admissionId,
          installmentNumber: idx + 1,
          title: inst.title || `Milestone ${idx + 1}`,
          percentage: Number(inst.percentage || 0),
          amount: Number(inst.amount || 0),
          dueDate: inst.dueDate ? new Date(inst.dueDate) : new Date(),
          status: 'PENDING',
        })),
      });
    } else {
      await this.setupDefaultInstallments(admissionId, totalFee);
    }

    return this.getInstallments(admissionId, actor);
  }

  private async finalizeIfFullyPaid(admissionId: string, paidDate: Date, actor: any) {
    const admission = await this.prisma.admission.findUnique({
      where: { id: admissionId },
      include: { installments: true },
    });
    if (!admission) return;

    const remainingPending = admission.installments.filter((i) => i.status !== 'PAID').length;
    const totalPaid = admission.installments
      .filter((i) => i.status === 'PAID')
      .reduce((sum, i) => sum + Number(i.amount || 0), 0);
    const feeAgreed = Number(admission.feeAgreed || 0);
    const isFullyPaid =
      (admission.installments.length > 0 && remainingPending === 0) ||
      (feeAgreed > 0 && totalPaid >= feeAgreed);

    if (!isFullyPaid) return;

    await this.prisma.admission.update({
      where: { id: admissionId },
      data: {
        stage: 'admission_done',
        status: 'admitted',
        subStage: 'C_formalities_done',
        admissionDate: admission.admissionDate || paidDate,
        version: { increment: 1 },
      },
    });

    if (admission.leadId) {
      await this.prisma.lead.update({
        where: { id: admission.leadId },
        data: {
          status: LeadStatus.admission_done,
          verificationStatus: VerificationStatus.APPROVED,
          version: { increment: 1 },
        },
      });
    }

    if (!admission.commissionGenerated) {
      try {
        await this.commissionsService.generateAdmissionCommissions(admissionId, actor);
      } catch {}
    }
  }

  async addCustomInstallmentPayment(admissionId: string, body: any, actor: any) {
    const admission = await this.prisma.admission.findUnique({
      where: { id: admissionId },
      include: { installments: true },
    });
    if (!admission) throw new NotFoundException('Admission record not found');

    const amount = Number(body.amount || 0);
    if (!amount || amount <= 0) {
      throw new BadRequestException('Payment amount must be greater than 0');
    }

    const nextNum =
      admission.installments.reduce((m, i) => Math.max(m, i.installmentNumber || 0), 0) + 1;
    const feeAgreed = Number(admission.feeAgreed || amount);
    const percentage = feeAgreed > 0 ? Math.min(100, Math.round((amount / feeAgreed) * 100)) : 0;
    const actorRole = String(actor?.role || '').toLowerCase();
    const isFinancialApprover =
      actorRole.includes('admin') || actorRole.includes('manager');
    const requestedStatus = String(body.status || 'PAID').toUpperCase();
    const status =
      requestedStatus === 'PENDING'
        ? 'PENDING'
        : isFinancialApprover
        ? 'PAID'
        : 'PENDING_VERIFICATION';
    const paidAtDate = body.paidAt ? new Date(body.paidAt) : new Date();
    const dueDate = body.dueDate ? new Date(body.dueDate) : paidAtDate;
    const utr =
      status !== 'PENDING'
        ? String(body.utrNumber || body.utr_number || `UTR-${Date.now().toString().slice(-8)}`).trim()
        : null;
    const mode = body.paymentMode || body.payment_mode || 'NEFT / RTGS / IMPS';
    const rawNotes = String(body.notes || '').trim();
    const recorderTag = `Recorded by ${actor?.fullName || 'Staff'} (${actor?.role || 'user'})${
      status === 'PENDING_VERIFICATION' ? ' • Awaiting Manager/Admin Verification' : ' • Verified'
    }`;
    const notes = rawNotes ? `${rawNotes} • ${recorderTag}` : recorderTag;
    const title = String(body.title || '').trim() || `Installment #${nextNum}`;

    const created = await this.prisma.admissionInstallment.create({
      data: {
        admissionId,
        installmentNumber: nextNum,
        title,
        percentage,
        amount,
        dueDate,
        status,
        paidAt: status === 'PAID' ? paidAtDate : null,
        utrNumber: utr,
        paymentMode: status !== 'PENDING' ? mode : null,
        notes,
      },
    });

    if (status === 'PENDING_VERIFICATION') {
      try {
        await this.notifications?.notifyRoles(['manager', 'super_admin', 'SENIOR_MANAGER', 'SUPER_ADMIN'], {
          type: 'payment_verification_required',
          title: `Payment Verification Required: ₹${amount.toLocaleString('en-IN')}`,
          message: `${actor?.fullName || 'Counsellor'} submitted ${title} (₹${amount.toLocaleString('en-IN')}, UTR: ${utr}) for ${admission.studentName}. Manager/Admin verification required before receipt & commission.`,
          relatedEntityId: admissionId,
          relatedEntityType: 'admission',
          link: `/admissions/${admissionId}`,
        });
      } catch {}
    }

    if (status === 'PAID') {
      await this.finalizeIfFullyPaid(admissionId, paidAtDate, actor);

      try {
        await this.prisma.auditLog.create({
          data: {
            userId: actor?.id || null,
            userName: actor?.fullName || 'Staff',
            userRole: actor?.role || 'user',
            action: 'CREATE',
            module: 'admissions',
            entity: 'AdmissionInstallment',
            entityId: created.id,
            details: {
              admissionId,
              admissionNumber: admission.admissionNumber,
              studentName: admission.studentName,
              title,
              amount,
              utrNumber: utr,
              paymentMode: mode,
              paidAt: paidAtDate.toISOString(),
            },
          },
        });
      } catch {}

      try {
        await this.prisma.leadRemark.create({
          data: {
            leadId: admission.leadId,
            userId: actor?.id,
            userName: actor?.fullName,
            userRole: actor?.role,
            content: `💰 Fee Installment Paid: ${title} - ₹${amount.toLocaleString('en-IN')} (UTR: ${utr}, Mode: ${mode}) recorded by ${actor?.fullName}.`,
          },
        });
      } catch {}

      try {
        await this.notifications?.notifyRoles(['manager', 'super_admin', 'SENIOR_MANAGER', 'SUPER_ADMIN'], {
          type: 'payment_received',
          title: `💰 Fee Payment Received: ₹${amount.toLocaleString('en-IN')}`,
          message: `${title} of ₹${amount.toLocaleString('en-IN')} paid for ${admission.studentName} (${admission.schoolName}) via ${mode}. UTR: ${utr} • Recorded by ${actor?.fullName}`,
          relatedEntityId: admissionId,
          relatedEntityType: 'admission',
          link: `/admissions/${admissionId}`,
        });
      } catch {}
    }

    return this.getInstallments(admissionId, actor);
  }

  async recordInstallmentPayment(
    admissionId: string,
    instId: string,
    body: any,
    actor: any,
  ) {
    const inst = await this.prisma.admissionInstallment.findFirst({
      where: { id: instId, admissionId },
    });
    if (!inst) throw new NotFoundException('Installment milestone not found');

    const actorRole = String(actor?.role || '').toLowerCase();
    const isFinancialApprover =
      actorRole.includes('admin') || actorRole.includes('manager');
    const paidAtDate = body.paidAt ? new Date(body.paidAt) : new Date();
    const paidAmount = body.amount && Number(body.amount) > 0 ? Number(body.amount) : inst.amount;
    const rawNotes = String(body.notes || '').trim();
    const nextStatus = isFinancialApprover ? 'PAID' : 'PENDING_VERIFICATION';
    const recorderTag = `Recorded by ${actor?.fullName || 'Staff'} (${actor?.role || 'user'})${
      isFinancialApprover ? ' • Verified' : ' • Awaiting Manager/Admin Verification'
    }`;
    const notes = rawNotes ? `${rawNotes} • ${recorderTag}` : recorderTag;

    const updated = await this.prisma.admissionInstallment.update({
      where: { id: instId },
      data: {
        status: nextStatus,
        amount: paidAmount,
        paidAt: isFinancialApprover ? paidAtDate : null,
        utrNumber: body.utrNumber || body.utr_number || `UTR-${Date.now().toString().slice(-8)}`,
        paymentMode: body.paymentMode || body.payment_mode || 'NetBanking',
        notes,
      },
    });

    if (isFinancialApprover) {
      await this.finalizeIfFullyPaid(admissionId, paidAtDate, actor);
    }

    const admission = await this.prisma.admission.findUnique({
      where: { id: admissionId },
    });

    try {
      await this.prisma.auditLog.create({
        data: {
          userId: actor?.id || null,
          userName: actor?.fullName || 'Staff',
          userRole: actor?.role || 'user',
          action: 'UPDATE',
          module: 'admissions',
          entity: 'AdmissionInstallment',
          entityId: instId,
          details: {
            admissionId,
            admissionNumber: admission?.admissionNumber,
            studentName: admission?.studentName,
            title: inst.title,
            amount: paidAmount,
            status: nextStatus,
            utrNumber: updated.utrNumber,
            paymentMode: updated.paymentMode,
            paidAt: paidAtDate.toISOString(),
          },
        },
      });
    } catch {}

    try {
      await this.prisma.leadRemark.create({
        data: {
          leadId: admission!.leadId,
          userId: actor.id,
          userName: actor.fullName,
          userRole: actor.role,
          content: `💰 Installment Payment ${isFinancialApprover ? 'Verified' : 'Submitted for Verification'}: ${inst.title} - ₹${paidAmount.toLocaleString('en-IN')} (UTR: ${updated.utrNumber}, Mode: ${updated.paymentMode}) by ${actor.fullName}. Status: ${nextStatus}`,
        },
      });
    } catch {}

    try {
      await this.notifications?.notifyRoles(['manager', 'super_admin', 'SENIOR_MANAGER', 'SUPER_ADMIN'], {
        type: isFinancialApprover ? 'payment_received' : 'payment_verification_required',
        title: isFinancialApprover
          ? `💰 Payment Verified: ₹${paidAmount.toLocaleString('en-IN')}`
          : `⏳ Payment Pending Verification: ₹${paidAmount.toLocaleString('en-IN')}`,
        message: `${inst.title} of ₹${paidAmount.toLocaleString('en-IN')} ${
          isFinancialApprover ? 'verified' : 'submitted for verification'
        } for ${admission?.studentName} by ${actor.fullName}. UTR: ${updated.utrNumber}`,
        relatedEntityId: admissionId,
        relatedEntityType: 'admission',
        link: `/admissions/${admissionId}`,
      });
    } catch {}

    return this.getInstallments(admissionId, actor);
  }

  async verifyInstallmentPayment(admissionId: string, instId: string, actor: any) {
    const inst = await this.prisma.admissionInstallment.findFirst({
      where: { id: instId, admissionId },
    });
    if (!inst) throw new NotFoundException('Installment milestone not found');

    const verifiedAt = new Date();
    const updated = await this.prisma.admissionInstallment.update({
      where: { id: instId },
      data: {
        status: 'PAID',
        paidAt: inst.paidAt || verifiedAt,
        notes: `${inst.notes || ''} • Verified by ${actor?.fullName || 'Manager'} (${actor?.role || 'manager'}) on ${verifiedAt.toLocaleDateString('en-IN')}`.trim(),
      },
    });

    await this.finalizeIfFullyPaid(admissionId, verifiedAt, actor);

    const admission = await this.prisma.admission.findUnique({ where: { id: admissionId } });
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: actor?.id || null,
          userName: actor?.fullName || 'Manager',
          userRole: actor?.role || 'manager',
          action: 'VERIFY_PAYMENT',
          module: 'admissions',
          entity: 'AdmissionInstallment',
          entityId: instId,
          details: {
            admissionId,
            studentName: admission?.studentName,
            amount: updated.amount,
            utrNumber: updated.utrNumber,
            verifiedAt: verifiedAt.toISOString(),
          },
        },
      });
    } catch {}

    if (admission?.counsellorId) {
      await this.notifications
        ?.notifyUser({
          userId: admission.counsellorId,
          type: 'payment_verified',
          title: `✅ Payment Verified: ₹${Number(updated.amount || 0).toLocaleString('en-IN')}`,
          message: `${inst.title} for ${admission.studentName} has been verified by ${actor?.fullName || 'Manager'}. PDF Receipt is now authorized.`,
          relatedEntityId: admissionId,
          relatedEntityType: 'admission',
          link: `/admissions/${admissionId}`,
        })
        .catch(() => {});
    }

    return this.getInstallments(admissionId, actor);
  }
}
