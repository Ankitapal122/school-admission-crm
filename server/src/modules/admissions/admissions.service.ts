import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { LeadStatus, VerificationStatus } from '@prisma/client';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
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

  private sanitizeFilenamePart(str?: string | null, fallback = 'Student'): string {
    const cleaned = String(str || fallback)
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return cleaned || fallback;
  }

  private formatIndianDate(d?: Date | string | null, includeTime = false): string {
    if (!d) return '—';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '—';
    return dt.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      ...(includeTime ? { hour: '2-digit', minute: '2-digit', hour12: true } : {}),
    });
  }

  private async loadAdmissionForReceipt(admissionId: string) {
    const admission = await this.prisma.admission.findFirst({
      where: { OR: [{ id: admissionId }, { admissionNumber: admissionId }] },
      include: {
        school: true,
        lead: true,
        manager: true,
        counsellor: {
          include: { team: { include: { manager: true } } },
        },
        installments: {
          orderBy: { installmentNumber: 'asc' },
        },
      },
    });
    if (!admission) throw new NotFoundException('Admission not found');
    return admission;
  }

  /**
   * Lightweight pure-Node PDFKit receipt generator (~2 MB RAM, <15 ms).
   * Replaces Puppeteer/Chromium which OOM-crashed Render 512MB instances into 502/503.
   */
  async generateAdmissionPdf(admissionId: string): Promise<{ buffer: Buffer; filename: string }> {
    const admission = await this.loadAdmissionForReceipt(admissionId);
    const studentName = admission.lead?.studentName || admission.studentName || 'Student';
    const parentName = admission.lead?.parentName || admission.parentName || 'Parent';
    const parentPhone = admission.lead?.parentPhone || 'N/A';
    const grade = admission.lead?.applyingForGrade || admission.admissionClass || 'N/A';
    const schoolName = admission.school?.name || admission.schoolName || 'Partner School';
    const schoolLoc = [admission.school?.city, admission.school?.state].filter(Boolean).join(', ') || 'India';
    const managerName =
      admission.manager?.fullName || (admission.counsellor as any)?.team?.manager?.fullName || 'N/A';
    const counsellorName = admission.counsellor?.fullName || 'N/A';
    const appNo = admission.admissionNumber || admission.id.slice(0, 8);
    const receiptNo = admission.receiptNumber || `REC-${appNo}`;

    const installments = admission.installments || [];
    const totalFee = Number(admission.feeAgreed || 0);
    const paidAmount = installments
      .filter((i) => i.status === 'PAID')
      .reduce((s, i) => s + Number(i.amount || 0), 0);
    const balance = Math.max(0, totalFee - paidAmount);
    const pctPaid = totalFee > 0 ? Math.min(100, Math.round((paidAmount / totalFee) * 100)) : 0;

    const safeStudent = this.sanitizeFilenamePart(studentName, 'Student');
    const safeApp = this.sanitizeFilenamePart(appNo, 'APP');
    const filename = `BoardingEdu_Receipt_${safeStudent}_${safeApp}.pdf`;

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(Buffer.from(c)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Navy Header Banner
      doc.rect(40, 36, 515, 74).fill('#123B70');
      doc
        .fillColor('#FFFFFF')
        .font('Helvetica-Bold')
        .fontSize(17)
        .text('BOARDINGEDU ENTERPRISE CRM', 55, 48, { align: 'center', width: 485 });
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#DBEAFE')
        .text('Official Admission & Fee Payment Receipt', 55, 70, { align: 'center', width: 485 });
      doc
        .font('Helvetica-Bold')
        .fontSize(9.5)
        .fillColor('#FDE047')
        .text(
          `APP #: ${appNo}   |   RECEIPT #: ${receiptNo}   |   DATE: ${this.formatIndianDate(new Date())}`,
          55,
          88,
          { align: 'center', width: 485 },
        );

      // Two-Column Info Cards
      const boxY = 124;
      doc.roundedRect(40, boxY, 250, 108, 6).fillAndStroke('#F8FAFC', '#CBD5E1');
      doc.roundedRect(305, boxY, 250, 108, 6).fillAndStroke('#F8FAFC', '#CBD5E1');

      doc.fillColor('#123B70').font('Helvetica-Bold').fontSize(10).text('STUDENT & PARENT DETAILS', 52, boxY + 10);
      doc.fillColor('#0F172A').font('Helvetica').fontSize(9.5);
      doc.text(`Student Name: ${studentName}`, 52, boxY + 28, { width: 226 });
      doc.text(`Class / Grade: ${grade}`, 52, boxY + 46, { width: 226 });
      doc.text(`Parent Name: ${parentName}`, 52, boxY + 64, { width: 226 });
      doc.text(`Parent Contact: ${parentPhone}`, 52, boxY + 82, { width: 226 });

      doc.fillColor('#123B70').font('Helvetica-Bold').fontSize(10).text('INSTITUTION & STAFF', 317, boxY + 10);
      doc.fillColor('#0F172A').font('Helvetica').fontSize(9.5);
      doc.text(`School: ${schoolName}`, 317, boxY + 28, { width: 226 });
      doc.text(`Location / Year: ${schoolLoc} (${admission.academicYear || '2026-27'})`, 317, boxY + 46, { width: 226 });
      doc.text(`Reporting Manager: ${managerName}`, 317, boxY + 64, { width: 226 });
      doc.text(`Assigned Counsellor: ${counsellorName}`, 317, boxY + 82, { width: 226 });

      // Fee Summary Strip
      const sumY = 246;
      doc.roundedRect(40, sumY, 515, 52, 6).fillAndStroke('#EFF6FF', '#BFDBFE');
      doc.fillColor('#475569').font('Helvetica-Bold').fontSize(8.5);
      doc.text('TOTAL AGREED FEE', 55, sumY + 10);
      doc.text('TOTAL PAID', 195, sumY + 10);
      doc.text('PENDING BALANCE', 330, sumY + 10);
      doc.text('PROGRESS', 465, sumY + 10);

      doc.font('Helvetica-Bold').fontSize(12.5);
      doc.fillColor('#0F172A').text(`Rs. ${totalFee.toLocaleString('en-IN')}`, 55, sumY + 26);
      doc.fillColor('#15803D').text(`Rs. ${paidAmount.toLocaleString('en-IN')}`, 195, sumY + 26);
      doc.fillColor(balance > 0 ? '#B45309' : '#15803D').text(`Rs. ${balance.toLocaleString('en-IN')}`, 330, sumY + 26);
      doc.fillColor('#1D4ED8').text(`${pctPaid}% Paid`, 465, sumY + 26);

      // Installments Table
      let tableY = 316;
      doc.fillColor('#123B70').font('Helvetica-Bold').fontSize(11).text('INSTALLMENT PAYMENT LOG', 40, tableY);
      tableY += 18;

      // Table Header
      doc.rect(40, tableY, 515, 22).fill('#123B70');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8.5);
      doc.text('#', 46, tableY + 7, { width: 20 });
      doc.text('Installment Title', 68, tableY + 7, { width: 135 });
      doc.text('Date', 206, tableY + 7, { width: 68 });
      doc.text('Mode & UTR / Ref', 278, tableY + 7, { width: 118 });
      doc.text('Status', 398, tableY + 7, { width: 68 });
      doc.text('Amount (INR)', 468, tableY + 7, { width: 82, align: 'right' });
      tableY += 22;

      if (installments.length === 0) {
        doc.rect(40, tableY, 515, 26).fill('#F8FAFC');
        doc.fillColor('#334155').font('Helvetica').fontSize(9);
        doc.text('1', 46, tableY + 8, { width: 20 });
        doc.text('Residential Tuition & Boarding Fee', 68, tableY + 8, { width: 200 });
        doc.text(this.formatIndianDate(admission.createdAt), 206, tableY + 8, { width: 68 });
        doc.text('—', 278, tableY + 8, { width: 118 });
        doc.text(String(admission.status || 'APPLIED').toUpperCase(), 398, tableY + 8, { width: 68 });
        doc.font('Helvetica-Bold').text(`Rs. ${totalFee.toLocaleString('en-IN')}`, 468, tableY + 8, { width: 82, align: 'right' });
        tableY += 26;
      } else {
        installments.forEach((ins, idx) => {
          if (tableY > 730) {
            doc.addPage();
            tableY = 45;
          }
          const isPaid = ins.status === 'PAID';
          const bg = isPaid ? '#F0FDF4' : idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
          doc.rect(40, tableY, 515, 28).fillAndStroke(bg, '#E2E8F0');
          doc.fillColor('#0F172A').font('Helvetica').fontSize(8.5);
          doc.text(String(ins.installmentNumber || idx + 1), 46, tableY + 9, { width: 20 });
          doc.font('Helvetica-Bold').text(ins.title || `Installment ${idx + 1}`, 68, tableY + 9, { width: 135 });
          doc.font('Helvetica').text(
            this.formatIndianDate(isPaid && ins.paidAt ? ins.paidAt : ins.dueDate),
            206,
            tableY + 9,
            { width: 68 },
          );
          const modeUtr = [ins.paymentMode || '', ins.utrNumber || ''].filter(Boolean).join(' / ') || 'Pending';
          doc.text(modeUtr, 278, tableY + 9, { width: 118 });
          doc
            .font('Helvetica-Bold')
            .fillColor(isPaid ? '#15803D' : '#B45309')
            .text(isPaid ? 'PAID' : String(ins.status || 'PENDING'), 398, tableY + 9, { width: 68 });
          doc
            .fillColor('#0F172A')
            .text(`Rs. ${Number(ins.amount || 0).toLocaleString('en-IN')}`, 468, tableY + 9, {
              width: 82,
              align: 'right',
            });
          tableY += 28;
        });
      }

      // Footer
      const footerY = Math.min(770, Math.max(tableY + 32, 680));
      doc
        .moveTo(40, footerY)
        .lineTo(555, footerY)
        .strokeColor('#CBD5E1')
        .stroke();
      doc
        .fillColor('#64748B')
        .font('Helvetica')
        .fontSize(8.5)
        .text(
          'Generated automatically by BoardingEdu Enterprise CRM. This is an authenticated computer-generated receipt and is valid without physical signature.',
          40,
          footerY + 10,
          { align: 'center', width: 515 },
        );

      doc.end();
    });

    return { buffer, filename };
  }

  /**
   * Properly formatted Excel (.xlsx) Receipt for a single student admission,
   * with Student Name in the filename and styled summary + installment tables.
   */
  async generateAdmissionReceiptExcel(admissionId: string): Promise<{ buffer: Buffer; filename: string }> {
    const admission = await this.loadAdmissionForReceipt(admissionId);
    const studentName = admission.lead?.studentName || admission.studentName || 'Student';
    const parentName = admission.lead?.parentName || admission.parentName || 'Parent';
    const parentPhone = admission.lead?.parentPhone || 'N/A';
    const grade = admission.lead?.applyingForGrade || admission.admissionClass || 'N/A';
    const schoolName = admission.school?.name || admission.schoolName || 'Partner School';
    const schoolLoc = [admission.school?.city, admission.school?.state].filter(Boolean).join(', ') || 'India';
    const managerName =
      admission.manager?.fullName || (admission.counsellor as any)?.team?.manager?.fullName || 'N/A';
    const counsellorName = admission.counsellor?.fullName || 'N/A';
    const appNo = admission.admissionNumber || admission.id.slice(0, 8);
    const receiptNo = admission.receiptNumber || `REC-${appNo}`;

    const installments = admission.installments || [];
    const totalFee = Number(admission.feeAgreed || 0);
    const paidAmount = installments
      .filter((i) => i.status === 'PAID')
      .reduce((s, i) => s + Number(i.amount || 0), 0);
    const balance = Math.max(0, totalFee - paidAmount);
    const pctPaid = totalFee > 0 ? Math.min(100, Math.round((paidAmount / totalFee) * 100)) : 0;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'BoardingEdu Enterprise CRM';
    wb.created = new Date();

    const ws = wb.addWorksheet('Fee Receipt', {
      views: [{ showGridLines: true }],
    });

    ws.columns = [
      { width: 12 }, // A: Inst # / Label
      { width: 28 }, // B: Installment Title / Value
      { width: 18 }, // C: Due Date
      { width: 22 }, // D: Paid Date
      { width: 20 }, // E: Amount / Label
      { width: 22 }, // F: Payment Mode / Value
      { width: 24 }, // G: UTR / Ref
      { width: 28 }, // H: Status & Notes
    ];

    const thinBorder: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };

    // Title Banner
    ws.mergeCells('A1:H1');
    const titleCell = ws.getCell('A1');
    titleCell.value = 'BOARDINGEDU ENTERPRISE CRM — OFFICIAL FEE RECEIPT';
    titleCell.font = { name: 'Calibri', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF123B70' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 32;

    ws.mergeCells('A2:H2');
    const subCell = ws.getCell('A2');
    subCell.value = `App #: ${appNo}   |   Receipt #: ${receiptNo}   |   Student: ${studentName}   |   Generated: ${this.formatIndianDate(new Date(), true)}`;
    subCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1E3A8A' } };
    subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
    subCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(2).height = 22;

    ws.getRow(3).height = 8;

    // Student & School Section Headers
    ws.mergeCells('A4:D4');
    ws.getCell('A4').value = 'STUDENT & PARENT DETAILS';
    ws.getCell('A4').font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getCell('A4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    ws.getCell('A4').alignment = { vertical: 'middle', indent: 1 };

    ws.mergeCells('E4:H4');
    ws.getCell('E4').value = 'SCHOOL & COUNSELLING TEAM DETAILS';
    ws.getCell('E4').font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getCell('E4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    ws.getCell('E4').alignment = { vertical: 'middle', indent: 1 };
    ws.getRow(4).height = 24;

    const infoPairs: Array<[string, string, string, string]> = [
      ['Student Name', studentName, 'School Name', schoolName],
      ['Parent Name', parentName, 'Location / Session', `${schoolLoc} (${admission.academicYear || '2026-27'})`],
      ['Parent Contact', parentPhone, 'Reporting Manager', managerName],
      ['Class / Grade', String(grade), 'Assigned Counsellor', counsellorName],
    ];

    infoPairs.forEach(([l1, v1, l2, v2], i) => {
      const rIdx = 5 + i;
      ws.mergeCells(`B${rIdx}:D${rIdx}`);
      ws.mergeCells(`F${rIdx}:H${rIdx}`);
      const row = ws.getRow(rIdx);
      row.height = 21;

      ws.getCell(`A${rIdx}`).value = l1;
      ws.getCell(`A${rIdx}`).font = { bold: true, size: 10, color: { argb: 'FF334155' } };
      ws.getCell(`A${rIdx}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };

      ws.getCell(`B${rIdx}`).value = v1;
      ws.getCell(`B${rIdx}`).font = { bold: i === 0, size: 10.5, color: { argb: 'FF0F172A' } };

      ws.getCell(`E${rIdx}`).value = l2;
      ws.getCell(`E${rIdx}`).font = { bold: true, size: 10, color: { argb: 'FF334155' } };
      ws.getCell(`E${rIdx}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };

      ws.getCell(`F${rIdx}`).value = v2;
      ws.getCell(`F${rIdx}`).font = { bold: i === 0, size: 10.5, color: { argb: 'FF0F172A' } };

      for (let c = 1; c <= 8; c++) {
        const cell = row.getCell(c);
        cell.border = thinBorder;
        cell.alignment = { vertical: 'middle', indent: 1 };
      }
    });

    ws.getRow(9).height = 10;

    // Fee Summary Section
    ws.mergeCells('A10:H10');
    ws.getCell('A10').value = 'FEE COLLECTION SUMMARY';
    ws.getCell('A10').font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getCell('A10').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    ws.getCell('A10').alignment = { vertical: 'middle', indent: 1 };
    ws.getRow(10).height = 24;

    ws.mergeCells('A11:B11');
    ws.mergeCells('C11:D11');
    ws.mergeCells('E11:F11');
    ws.mergeCells('G11:H11');
    ws.getCell('A11').value = 'Total Agreed Fee (INR)';
    ws.getCell('C11').value = 'Total Paid (INR)';
    ws.getCell('E11').value = 'Pending Balance (INR)';
    ws.getCell('G11').value = 'Payment Status & Progress';
    const sumHeaderRow = ws.getRow(11);
    sumHeaderRow.height = 20;
    for (let c = 1; c <= 8; c++) {
      const cell = sumHeaderRow.getCell(c);
      cell.font = { bold: true, size: 10, color: { argb: 'FF334155' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
    }

    ws.mergeCells('A12:B12');
    ws.mergeCells('C12:D12');
    ws.mergeCells('E12:F12');
    ws.mergeCells('G12:H12');
    ws.getCell('A12').value = totalFee;
    ws.getCell('A12').numFmt = '"₹"#,##0';
    ws.getCell('C12').value = paidAmount;
    ws.getCell('C12').numFmt = '"₹"#,##0';
    ws.getCell('E12').value = balance;
    ws.getCell('E12').numFmt = '"₹"#,##0';
    ws.getCell('G12').value = `${pctPaid}% Completed (${balance === 0 ? 'FULL PAID' : 'PARTIAL / PENDING'})`;
    const sumValRow = ws.getRow(12);
    sumValRow.height = 26;
    ws.getCell('A12').font = { bold: true, size: 12, color: { argb: 'FF0F172A' } };
    ws.getCell('C12').font = { bold: true, size: 12, color: { argb: 'FF15803D' } };
    ws.getCell('C12').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };
    ws.getCell('E12').font = { bold: true, size: 12, color: { argb: balance > 0 ? 'FFB45309' : 'FF15803D' } };
    ws.getCell('E12').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: balance > 0 ? 'FFFFFBEB' : 'FFF0FDF4' } };
    ws.getCell('G12').font = { bold: true, size: 11, color: { argb: 'FF1D4ED8' } };
    for (let c = 1; c <= 8; c++) {
      sumValRow.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' };
      sumValRow.getCell(c).border = thinBorder;
    }

    ws.getRow(13).height = 10;

    // Installments Table
    ws.mergeCells('A14:H14');
    ws.getCell('A14').value = 'INSTALLMENT PAYMENT HISTORY';
    ws.getCell('A14').font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getCell('A14').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF123B70' } };
    ws.getCell('A14').alignment = { vertical: 'middle', indent: 1 };
    ws.getRow(14).height = 24;

    const tblHeaders = [
      'Inst #',
      'Installment Title',
      'Due Date',
      'Paid Date',
      'Amount (INR)',
      'Payment Mode',
      'UTR / Reference',
      'Status & Notes',
    ];
    const thRow = ws.getRow(15);
    thRow.height = 24;
    tblHeaders.forEach((h, idx) => {
      const cell = thRow.getCell(idx + 1);
      cell.value = h;
      cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
      cell.alignment = { horizontal: idx === 4 ? 'right' : 'center', vertical: 'middle' };
      cell.border = thinBorder;
    });

    let curRow = 16;
    if (installments.length === 0) {
      const row = ws.getRow(curRow);
      row.height = 22;
      row.values = [
        1,
        'Annual Tuition & Boarding Fee',
        this.formatIndianDate(admission.createdAt),
        '—',
        totalFee,
        '—',
        '—',
        `${String(admission.status || 'APPLIED').toUpperCase()} (No installments recorded yet)`,
      ];
      row.getCell(5).numFmt = '"₹"#,##0';
      for (let c = 1; c <= 8; c++) {
        row.getCell(c).border = thinBorder;
        row.getCell(c).alignment = { horizontal: c === 5 ? 'right' : c === 1 ? 'center' : 'left', vertical: 'middle' };
      }
      curRow++;
    } else {
      installments.forEach((ins, idx) => {
        const isPaid = ins.status === 'PAID';
        const row = ws.getRow(curRow);
        row.height = 22;
        row.values = [
          ins.installmentNumber || idx + 1,
          ins.title || `Installment ${idx + 1}`,
          this.formatIndianDate(ins.dueDate),
          isPaid && ins.paidAt ? this.formatIndianDate(ins.paidAt, true) : '—',
          Number(ins.amount || 0),
          ins.paymentMode || (isPaid ? 'Bank Transfer' : '—'),
          ins.utrNumber || '—',
          `${isPaid ? 'PAID (VERIFIED)' : ins.status || 'PENDING'}${ins.notes ? ` — ${ins.notes}` : ''}`,
        ];
        row.getCell(5).numFmt = '"₹"#,##0';
        const bgArgb = isPaid ? 'FFF0FDF4' : idx % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC';
        for (let c = 1; c <= 8; c++) {
          const cell = row.getCell(c);
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } };
          cell.border = thinBorder;
          cell.font = {
            size: 10,
            bold: c === 5 || c === 8,
            color: { argb: c === 8 ? (isPaid ? 'FF15803D' : 'FFB45309') : 'FF0F172A' },
          };
          cell.alignment = {
            horizontal: c === 5 ? 'right' : c === 1 || c === 3 ? 'center' : 'left',
            vertical: 'middle',
            wrapText: true,
          };
        }
        curRow++;
      });
    }

    // Total Row
    const totalRow = ws.getRow(curRow);
    totalRow.height = 25;
    ws.mergeCells(`A${curRow}:D${curRow}`);
    ws.getCell(`A${curRow}`).value = `TOTAL PAID (Verified)   |   Pending Balance: ₹${balance.toLocaleString('en-IN')}`;
    ws.getCell(`E${curRow}`).value = paidAmount;
    ws.getCell(`E${curRow}`).numFmt = '"₹"#,##0';
    ws.mergeCells(`F${curRow}:H${curRow}`);
    ws.getCell(`F${curRow}`).value = `Total Agreed Fee: ₹${totalFee.toLocaleString('en-IN')} (${pctPaid}% Paid)`;
    for (let c = 1; c <= 8; c++) {
      const cell = totalRow.getCell(c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      cell.font = { bold: true, size: 10.5, color: { argb: 'FF0F172A' } };
      cell.border = thinBorder;
      cell.alignment = { horizontal: c === 5 ? 'right' : 'left', vertical: 'middle', indent: c === 5 ? 0 : 1 };
    }

    // Footer Note
    curRow += 2;
    ws.mergeCells(`A${curRow}:H${curRow}`);
    const ftCell = ws.getCell(`A${curRow}`);
    ftCell.value = 'Computer-generated official fee receipt by BoardingEdu Enterprise CRM. Valid without physical signature.';
    ftCell.font = { italic: true, size: 9, color: { argb: 'FF64748B' } };
    ftCell.alignment = { horizontal: 'center' };

    const safeStudent = this.sanitizeFilenamePart(studentName, 'Student');
    const safeApp = this.sanitizeFilenamePart(appNo, 'APP');
    const filename = `BoardingEdu_Receipt_${safeStudent}_${safeApp}.xlsx`;
    const outBuf = await wb.xlsx.writeBuffer();
    return { buffer: Buffer.from(outBuf as ArrayBuffer), filename };
  }

  /**
   * Properly formatted multi-sheet Excel (.xlsx) Export for the entire Fee Installments Register.
   * Replaces plain/empty CSV export with styled Ledger + Student Summary sheets.
   */
  async exportFeeInstallmentsExcel(user?: any, query: any = {}): Promise<{ buffer: Buffer; filename: string }> {
    const res: any = await this.findAll(user, query);
    const allAdmissions: any[] = res?.admissions || res?.data?.admissions || (Array.isArray(res?.data) ? res.data : []);

    const search = String(query?.search || '').trim().toLowerCase();
    const statusFilter = String(query?.status || 'ALL').toUpperCase();

    const filteredAdmissions = allAdmissions.filter((a) => {
      if (!search) return true;
      const hay = [
        a.studentName || a.lead?.studentName,
        a.parentName || a.lead?.parentName,
        a.schoolName || a.school?.name,
        a.admissionNumber || a.appId,
        a.assignedManager?.fullName || a.manager?.fullName,
        a.assignedCounsellor?.fullName || a.counsellor?.fullName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(search);
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'BoardingEdu Enterprise CRM';
    wb.created = new Date();

    const thinBorder: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };

    // Compute totals & ledger rows
    let grandAgreed = 0;
    let grandPaid = 0;
    const ledgerRows: any[] = [];

    filteredAdmissions.forEach((adm) => {
      const studentName = adm.studentName || adm.lead?.studentName || 'Student';
      const parentName = adm.parentName || adm.lead?.parentName || 'Parent';
      const schoolName = adm.schoolName || adm.school?.name || 'School';
      const appNo = adm.admissionNumber || adm.appId || adm.id?.slice(0, 8) || 'APP';
      const managerName = adm.assignedManager?.fullName || adm.manager?.fullName || '—';
      const counsellorName = adm.assignedCounsellor?.fullName || adm.counsellor?.fullName || '—';
      const fee = Number(adm.feeAgreed || adm.confirmedRevenue || 0);
      grandAgreed += fee;

      const insts: any[] = Array.isArray(adm.installments) ? adm.installments : [];
      if (insts.length === 0) {
        if (statusFilter !== 'PAID') {
          ledgerRows.push({
            date: this.formatIndianDate(adm.createdAt),
            status: 'SCHEDULE PENDING',
            appNo,
            studentName,
            parentName,
            schoolName,
            managerName,
            counsellorName,
            title: 'Total Agreed Fee (Schedule Pending)',
            amount: fee,
            mode: '—',
            utr: '—',
            notes: 'No installments scheduled yet',
            isPaid: false,
          });
        }
      } else {
        insts.forEach((ins) => {
          const isPaid = ins.status === 'PAID';
          if (isPaid) grandPaid += Number(ins.amount || 0);
          if (statusFilter === 'PAID' && !isPaid) return;
          if (statusFilter === 'PENDING' && isPaid) return;
          ledgerRows.push({
            date: isPaid && ins.paidAt ? this.formatIndianDate(ins.paidAt, true) : this.formatIndianDate(ins.dueDate),
            status: isPaid ? 'PAID (VERIFIED)' : ins.status || 'PENDING',
            appNo,
            studentName,
            parentName,
            schoolName,
            managerName,
            counsellorName,
            title: `#${ins.installmentNumber || 1}: ${ins.title || 'Installment'}`,
            amount: Number(ins.amount || 0),
            mode: ins.paymentMode || (isPaid ? 'Bank Transfer' : '—'),
            utr: ins.utrNumber || '—',
            notes: ins.notes || '',
            isPaid,
          });
        });
      }
    });

    // SHEET 1: Fee Payment Ledger
    const ws1 = wb.addWorksheet('Fee Payment Ledger', {
      views: [{ state: 'frozen', ySplit: 4 }],
    });

    ws1.columns = [
      { width: 22 }, // Date
      { width: 18 }, // Status
      { width: 16 }, // App Number
      { width: 22 }, // Student Name
      { width: 22 }, // Parent Name
      { width: 26 }, // School Name
      { width: 18 }, // Manager
      { width: 18 }, // Counsellor
      { width: 28 }, // Installment Title
      { width: 18 }, // Amount (INR)
      { width: 18 }, // Payment Mode
      { width: 22 }, // UTR / Ref
      { width: 28 }, // Notes
    ];

    ws1.mergeCells('A1:M1');
    ws1.getCell('A1').value = 'BOARDINGEDU ENTERPRISE CRM — FEE INSTALLMENTS & PAYMENT LEDGER';
    ws1.getCell('A1').font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    ws1.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF123B70' } };
    ws1.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    ws1.getRow(1).height = 30;

    ws1.mergeCells('A2:M2');
    ws1.getCell('A2').value = `Generated: ${this.formatIndianDate(new Date(), true)}   |   Students: ${filteredAdmissions.length}   |   Total Agreed: ₹${grandAgreed.toLocaleString('en-IN')}   |   Total Collected: ₹${grandPaid.toLocaleString('en-IN')}   |   Pending: ₹${Math.max(0, grandAgreed - grandPaid).toLocaleString('en-IN')}`;
    ws1.getCell('A2').font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1E3A8A' } };
    ws1.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
    ws1.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };
    ws1.getRow(2).height = 22;

    ws1.getRow(3).height = 6;

    const ledgerHeaders = [
      'Date',
      'Status',
      'App Number',
      'Student Name',
      'Parent Name',
      'School Name',
      'Manager',
      'Counsellor',
      'Installment Title',
      'Amount (INR)',
      'Payment Mode',
      'UTR / Reference',
      'Notes',
    ];
    const hRow1 = ws1.getRow(4);
    hRow1.height = 24;
    ledgerHeaders.forEach((h, i) => {
      const cell = hRow1.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
      cell.alignment = { horizontal: i === 9 ? 'right' : 'center', vertical: 'middle' };
      cell.border = thinBorder;
    });
    ws1.autoFilter = 'A4:M4';

    let rowIdx = 5;
    let totalRowsAmount = 0;
    ledgerRows.forEach((r, idx) => {
      totalRowsAmount += Number(r.amount || 0);
      const row = ws1.getRow(rowIdx);
      row.height = 21;
      row.values = [
        r.date,
        r.status,
        r.appNo,
        r.studentName,
        r.parentName,
        r.schoolName,
        r.managerName,
        r.counsellorName,
        r.title,
        r.amount,
        r.mode,
        r.utr,
        r.notes,
      ];
      row.getCell(10).numFmt = '"₹"#,##0';
      const bg = r.isPaid ? 'FFF0FDF4' : idx % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC';
      for (let c = 1; c <= 13; c++) {
        const cell = row.getCell(c);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.border = thinBorder;
        cell.font = {
          size: 10,
          bold: c === 2 || c === 4 || c === 10,
          color: { argb: c === 2 ? (r.isPaid ? 'FF15803D' : 'FFB45309') : 'FF0F172A' },
        };
        cell.alignment = { horizontal: c === 10 ? 'right' : c === 2 || c === 3 ? 'center' : 'left', vertical: 'middle' };
      }
      rowIdx++;
    });

    // Grand Total Row on Sheet 1
    const gtRow = ws1.getRow(rowIdx);
    gtRow.height = 25;
    ws1.mergeCells(`A${rowIdx}:I${rowIdx}`);
    ws1.getCell(`A${rowIdx}`).value = `GRAND TOTAL (${ledgerRows.length} Records)`;
    ws1.getCell(`J${rowIdx}`).value = totalRowsAmount;
    ws1.getCell(`J${rowIdx}`).numFmt = '"₹"#,##0';
    ws1.mergeCells(`K${rowIdx}:M${rowIdx}`);
    ws1.getCell(`K${rowIdx}`).value = `Verified Collected: ₹${grandPaid.toLocaleString('en-IN')}`;
    for (let c = 1; c <= 13; c++) {
      const cell = gtRow.getCell(c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      cell.font = { bold: true, size: 10.5, color: { argb: 'FF0F172A' } };
      cell.border = thinBorder;
      cell.alignment = { horizontal: c === 10 ? 'right' : 'left', vertical: 'middle', indent: c === 10 ? 0 : 1 };
    }

    // SHEET 2: Student Fee Summary
    const ws2 = wb.addWorksheet('Student Fee Summary', {
      views: [{ state: 'frozen', ySplit: 3 }],
    });
    ws2.columns = [
      { width: 16 }, // App #
      { width: 22 }, // Student Name
      { width: 22 }, // Parent Name
      { width: 16 }, // Contact
      { width: 12 }, // Class
      { width: 26 }, // School
      { width: 18 }, // Manager
      { width: 18 }, // Counsellor
      { width: 18 }, // Total Agreed
      { width: 18 }, // Total Paid
      { width: 18 }, // Pending Balance
      { width: 14 }, // Collection %
    ];
    ws2.mergeCells('A1:L1');
    ws2.getCell('A1').value = 'STUDENT-WISE FEE COLLECTION SUMMARY';
    ws2.getCell('A1').font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
    ws2.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    ws2.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    ws2.getRow(1).height = 28;

    const sumHeaders = [
      'App Number',
      'Student Name',
      'Parent Name',
      'Parent Phone',
      'Class',
      'School Name',
      'Manager',
      'Counsellor',
      'Total Agreed (INR)',
      'Total Paid (INR)',
      'Balance Due (INR)',
      'Paid %',
    ];
    const hRow2 = ws2.getRow(3);
    hRow2.height = 23;
    sumHeaders.forEach((h, i) => {
      const cell = hRow2.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF123B70' } };
      cell.alignment = { horizontal: i >= 8 && i <= 10 ? 'right' : 'center', vertical: 'middle' };
      cell.border = thinBorder;
    });

    let sIdx = 4;
    filteredAdmissions.forEach((adm, idx) => {
      const fee = Number(adm.feeAgreed || adm.confirmedRevenue || 0);
      const insts: any[] = Array.isArray(adm.installments) ? adm.installments : [];
      const paid = insts.filter((i) => i.status === 'PAID').reduce((s, i) => s + Number(i.amount || 0), 0);
      const bal = Math.max(0, fee - paid);
      const pct = fee > 0 ? Math.min(100, Math.round((paid / fee) * 100)) : 0;

      const row = ws2.getRow(sIdx);
      row.height = 21;
      row.values = [
        adm.admissionNumber || adm.appId || 'APP',
        adm.studentName || adm.lead?.studentName || 'Student',
        adm.parentName || adm.lead?.parentName || 'Parent',
        adm.lead?.parentPhone || 'N/A',
        adm.admissionClass || adm.lead?.applyingForGrade || '—',
        adm.schoolName || adm.school?.name || 'School',
        adm.assignedManager?.fullName || adm.manager?.fullName || '—',
        adm.assignedCounsellor?.fullName || adm.counsellor?.fullName || '—',
        fee,
        paid,
        bal,
        `${pct}%`,
      ];
      row.getCell(9).numFmt = '"₹"#,##0';
      row.getCell(10).numFmt = '"₹"#,##0';
      row.getCell(11).numFmt = '"₹"#,##0';
      const bg = bal === 0 && fee > 0 ? 'FFF0FDF4' : idx % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC';
      for (let c = 1; c <= 12; c++) {
        const cell = row.getCell(c);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.border = thinBorder;
        cell.font = { size: 10, bold: c === 2 || c === 10 || c === 11 };
        cell.alignment = { horizontal: c >= 9 && c <= 11 ? 'right' : c === 1 || c === 5 || c === 12 ? 'center' : 'left', vertical: 'middle' };
      }
      sIdx++;
    });

    const today = new Date().toISOString().slice(0, 10);
    const filename =
      filteredAdmissions.length === 1
        ? `BoardingEdu_Fee_Receipt_${this.sanitizeFilenamePart(filteredAdmissions[0].studentName || filteredAdmissions[0].lead?.studentName)}_${today}.xlsx`
        : `BoardingEdu_Fee_Installments_Ledger_${today}.xlsx`;

    const outBuf = await wb.xlsx.writeBuffer();
    return { buffer: Buffer.from(outBuf as ArrayBuffer), filename };
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

      const paymentStatus = String(body.paymentStatus || body.payment_status || 'INSTALLMENTS').toUpperCase();
      const paymentMode = body.paymentMode || body.payment_mode || 'UPI';
      const transactionRef = body.transactionRef || body.transaction_ref || `TXN-${Date.now().toString().slice(-6)}`;

      // Auto-generate 3-tier milestone installment plan (30%, 50%, 20%) or record full/token payment
      if (admissionRecord) {
        if (paymentStatus === 'FULL_PAID') {
          await this.prisma.admissionInstallment.deleteMany({
            where: { admissionId: admissionRecord.id },
          });
          await this.prisma.admissionInstallment.create({
            data: {
              admissionId: admissionRecord.id,
              installmentNumber: 1,
              title: 'Full Annual Fee Payment (100% Paid)',
              percentage: 100,
              amount: totalFee,
              dueDate: new Date(),
              paidAt: new Date(),
              status: 'PAID',
              paymentMode,
              utrNumber: transactionRef,
              notes: 'Full fee paid upfront during post-tour completion',
            },
          });
          await this.prisma.admission.update({
            where: { id: admissionRecord.id },
            data: {
              stage: 'admission_done',
              status: 'confirmed',
              feeAgreed: totalFee,
              subStage: 'C_formalities_done',
              admissionDate: new Date(),
            },
          });
          await this.prisma.lead.update({
            where: { id: tour.leadId },
            data: { status: 'admission_done' },
          }).catch(() => null);
          await this.commissionsService.generateAdmissionCommissions(admissionRecord.id, actor).catch(() => null);
        } else if (paymentStatus === 'TOKEN_PAID') {
          await this.prisma.admissionInstallment.deleteMany({
            where: { admissionId: admissionRecord.id },
          });
          const now = new Date();
          const dateM2 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
          const dateM3 = new Date(now.getTime() + 120 * 24 * 60 * 60 * 1000);
          const inst1Amount = Math.round(totalFee * 0.3);
          const inst2Amount = Math.round(totalFee * 0.5);
          const inst3Amount = totalFee - inst1Amount - inst2Amount;
          await this.prisma.admissionInstallment.createMany({
            data: [
              {
                admissionId: admissionRecord.id,
                installmentNumber: 1,
                title: 'Milestone 1: 30% Token & Admission Fee',
                percentage: 30,
                amount: inst1Amount,
                dueDate: now,
                paidAt: now,
                status: 'PAID',
                paymentMode,
                utrNumber: transactionRef,
                notes: 'Token fee paid during post-tour completion',
              },
              {
                admissionId: admissionRecord.id,
                installmentNumber: 2,
                title: 'Milestone 2: 50% Term 2 Fee',
                percentage: 50,
                amount: inst2Amount,
                dueDate: dateM2,
                status: 'PENDING',
              },
              {
                admissionId: admissionRecord.id,
                installmentNumber: 3,
                title: 'Milestone 3: 20% Final Clearance',
                percentage: 20,
                amount: inst3Amount,
                dueDate: dateM3,
                status: 'PENDING',
              },
            ],
          });
          await this.prisma.admission.update({
            where: { id: admissionRecord.id },
            data: {
              stage: 'selected',
              feeAgreed: totalFee,
              subStage: 'B_documents_pending',
              selectedDate: new Date(),
            },
          });
          await this.commissionsService.generateAdmissionCommissions(admissionRecord.id, actor).catch(() => null);
        } else {
          await this.setupDefaultInstallments(admissionRecord.id, totalFee);
        }
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
