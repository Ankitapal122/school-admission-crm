import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { CommissionStatus, LeadStatus, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  apiEnvelope,
  toBlueprintRole,
} from '../../common/utils/crm.utils';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class CommissionsService {
  constructor(
    private prisma: PrismaService,
    @Optional() private notifications?: NotificationsService,
  ) {}

  private async nextCommissionCode(tx: any = this.prisma): Promise<string> {
    try {
      const seq: any[] = await tx.$queryRawUnsafe(
        `SELECT nextval('seq_commission_id') AS val`,
      );
      const val = Number(seq?.[0]?.val || 1);
      return `CM${String(val).padStart(3, '0')}`;
    } catch {
      const count = await tx.commission.count();
      return `CM${String(count + 1).padStart(3, '0')}-${Date.now().toString().slice(-4)}`;
    }
  }

  private async getTaxConfig() {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key: 'gst_tds' },
    });
    const val = (row?.value as any) || {};
    return {
      gstRate: Number(val.gstRate ?? 18),
      tdsRate: Number(val.tdsRate ?? 5),
      tdsThreshold: Number(val.tdsThreshold ?? 15000),
    };
  }

  formatCommission(c: any) {
    const schoolName =
      c.schoolName || c.school?.name || c.admission?.school?.name || 'Partner School';
    const studentName =
      c.studentName || c.lead?.studentName || c.admission?.lead?.studentName || 'Student';
    const parentName =
      c.parentName || c.lead?.parentName || c.admission?.lead?.parentName || 'Parent';
    const counsellorName =
      c.jrName || c.beneficiary?.fullName || c.admission?.counsellor?.fullName || 'Counsellor';
    const managerName =
      c.srName ||
      c.admission?.manager?.fullName ||
      c.admission?.counsellor?.team?.manager?.fullName ||
      'Manager';

    return {
      ...c,
      _id: c.id,
      applicationId: c.admissionId,
      commissionId: c.commissionCode,
      commissionCode: c.commissionCode,
      appCode: c.admission?.admissionNumber || c.admissionId,
      leadNumber: c.lead?.leadNumber || c.admission?.lead?.leadNumber,
      schoolName,
      studentName,
      parentName,
      counsellorName,
      managerName,
      companyAmount: Number(c.amount ?? 0),
      originalAmount: Number(c.originalAmount ?? c.amount ?? 0),
      jrAmount: Number(c.jrAmount ?? 0),
      srAmount: Number(c.srAmount ?? 0),
      netProfit: Number(c.netProfit ?? 0),
      rawStatus: c.status,
      hasAdjustments: Array.isArray(c.adjustmentEntries) && c.adjustmentEntries.length > 0,
      beneficiaryDisplay: c.beneficiary
        ? `${c.beneficiary.fullName} (${c.beneficiary.employeeId})`
        : c.beneficiaryName,
    };
  }

  private assertCanViewAll(user: any) {
    const role = toBlueprintRole(user?.role);
    if (role === 'jr_counsellor') {
      return { isJr: true, isManager: false, isAdmin: false };
    }
    if (role === 'manager') {
      return { isJr: false, isManager: true, isAdmin: false };
    }
    return { isJr: false, isManager: false, isAdmin: true };
  }

  /**
   * Blueprint Trigger Rule (Feature 3):
   * Generates ONE canonical unified commission_ledger row strictly when
   * applications.sub_stage === 'C_formalities_done'.
   */
  async generateAdmissionCommissions(
    admissionId: string,
    actor?: any,
    txClient?: any,
  ) {
    const db = txClient || this.prisma;
    const admission = await db.admission.findUnique({
      where: { id: admissionId },
      include: {
        school: true,
        lead: true,
        counsellor: {
          include: {
            manager: true,
            team: { include: { manager: true } },
          },
        },
        manager: true,
      },
    });

    if (!admission) {
      throw new NotFoundException('Application / Admission not found');
    }

    if (admission.subStage !== 'C_formalities_done') {
      return [];
    }

    // Idempotency guard: do not create duplicates unless previous entry was reversed
    const existing = await db.commission.findFirst({
      where: {
        admissionId: admission.id,
        deletedAt: null,
        parentCommissionId: null,
        status: {
          notIn: [CommissionStatus.reversed, CommissionStatus.REVERSED],
        },
      },
      include: {
        beneficiary: true,
        school: true,
        lead: true,
        admission: { include: { school: true, lead: true, counsellor: true, manager: true } },
      },
    });
    if (existing) {
      return [this.formatCommission(existing)];
    }

    // Lookup school slabs -> fallback to CommissionRule -> fallback defaults
    const rule = await db.commissionRule.findFirst({
      where: { isActive: true },
      orderBy: { version: 'desc' },
    });

    const companyAmount = Number(
      admission.school?.defaultCommission || rule?.totalCommissionAmount || 35000,
    );
    const jrAmount = Number(
      admission.school?.jrCommission || rule?.counsellorShare || 5000,
    );
    const srAmount = Number(
      admission.school?.srCommission || rule?.managerShare || 7000,
    );
    const netProfit = Math.max(0, companyAmount - jrAmount - srAmount);

    const jrName = admission.counsellor?.fullName || 'Jr. Counsellor';
    const srManager =
      admission.manager ||
      admission.counsellor?.manager ||
      admission.counsellor?.team?.manager ||
      null;
    const srName = srManager?.fullName || 'Senior Manager';
    const commissionCode = await this.nextCommissionCode(db);

    const created = await db.commission.create({
      data: {
        commissionCode,
        admissionId: admission.id,
        leadId: admission.leadId,
        schoolId: admission.schoolId,
        schoolName: admission.school?.name || admission.schoolName || 'Partner School',
        studentName: admission.lead?.studentName || admission.studentName || 'Student',
        parentName: admission.lead?.parentName || admission.parentName || 'Parent',
        beneficiaryId: admission.counsellorId,
        beneficiaryName: jrName,
        beneficiaryType: 'THREE_WAY_SPLIT',
        beneficiaryRole: admission.counsellor?.role || Role.jr_counsellor,
        teamId: admission.teamId || admission.counsellor?.teamId || null,
        originalAmount: companyAmount,
        amount: companyAmount,
        jrAmount,
        jrName,
        srAmount,
        srName,
        netProfit,
        status: CommissionStatus.pending,
        ruleVersion: rule?.version || 1,
        fnfPeriodDays: 90,
      },
      include: {
        beneficiary: true,
        school: true,
        lead: true,
        admission: { include: { school: true, lead: true, counsellor: true, manager: true } },
      },
    });

    await db.auditLog.create({
      data: {
        userId: actor?.id || admission.counsellorId,
        userName: actor?.fullName || 'System',
        userRole: actor?.role || 'super_admin',
        action: 'CREATE',
        module: 'commission',
        entity: 'Commission',
        entityId: created.id,
        newValue: {
          commissionCode,
          appId: admission.admissionNumber,
          companyAmount,
          jrAmount,
          srAmount,
          netProfit,
          subStage: admission.subStage,
        },
        details: {
          message: `Commission ${commissionCode} generated automatically on Sub-Stage C`,
        },
      },
    });

    if (this.notifications) {
      await this.notifications
        .notifyUser({
          userId: admission.counsellorId,
          type: 'commission_generated',
          title: 'Sub-Stage C Commission Accrued',
          message: `${commissionCode} accrued for ${created.studentName} (${created.schoolName}): Jr Share ₹${jrAmount.toLocaleString('en-IN')}.`,
          relatedEntityId: created.id,
          relatedEntityType: 'Commission',
          link: '/commissions',
        })
        .catch(() => undefined);
    }

    return [this.formatCommission(created)];
  }

  async getLedger(user?: any, query: any = {}) {
    const scope = this.assertCanViewAll(user);
    const where: any = { deletedAt: null };

    if (scope.isJr && user?.id) {
      where.OR = [
        { beneficiaryId: user.id },
        { admission: { counsellorId: user.id } },
      ];
    } else if (scope.isManager && user?.id) {
      const teamMembers = await this.prisma.user.findMany({
        where: { OR: [{ managerId: user.id }, { id: user.id }], deletedAt: null },
        select: { id: true },
      });
      const memberIds = teamMembers.map((m) => m.id);
      where.OR = [
        { beneficiaryId: { in: memberIds } },
        { admission: { managerId: user.id } },
        { admission: { counsellorId: { in: memberIds } } },
      ];
    }

    if (query.status) {
      where.status = query.status;
    }
    if (query.school_id || query.schoolId) {
      where.schoolId = query.school_id || query.schoolId;
    }
    if (query.lead_id || query.leadId) {
      where.leadId = query.lead_id || query.leadId;
    }
    if (query.counsellor_id || query.counsellorId) {
      where.beneficiaryId = query.counsellor_id || query.counsellorId;
    }
    if (query.date_from || query.date_to) {
      where.createdAt = {};
      if (query.date_from) where.createdAt.gte = new Date(query.date_from);
      if (query.date_to) where.createdAt.lte = new Date(query.date_to);
    }

    const rawCommissions = await this.prisma.commission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        beneficiary: { select: { id: true, fullName: true, employeeId: true, role: true, fnfDate: true, status: true } },
        school: { select: { id: true, schoolCode: true, name: true, city: true, paymentTermsDays: true } },
        lead: { select: { id: true, leadNumber: true, studentName: true, parentName: true } },
        admission: {
          include: {
            school: { select: { id: true, name: true, city: true } },
            lead: { select: { id: true, studentName: true, parentName: true, leadNumber: true } },
            counsellor: {
              select: {
                id: true,
                fullName: true,
                employeeId: true,
                team: { include: { manager: { select: { id: true, fullName: true } } } },
              },
            },
            manager: { select: { id: true, fullName: true } },
          },
        },
        adjustmentEntries: true,
        payments: true,
      },
    });

    const formatted = rawCommissions.map((c) => this.formatCommission(c));
    const positiveRows = formatted.filter((c) => c.parentCommissionId == null);

    const totalGenerated = positiveRows
      .filter((c) => !['reversed', 'REVERSED'].includes(String(c.rawStatus)))
      .reduce((sum, c) => sum + Number(c.amount || 0), 0);
    const totalPaid = formatted
      .filter((c) => ['paid_out', 'PAID'].includes(String(c.rawStatus)) && c.amount > 0)
      .reduce((sum, c) => sum + Number(c.jrAmount || 0) + Number(c.srAmount || 0), 0);
    const totalReceived = formatted
      .filter((c) => ['received'].includes(String(c.rawStatus)) && c.amount > 0)
      .reduce((sum, c) => sum + Number(c.amount || 0), 0);
    const totalPending = formatted
      .filter((c) =>
        ['pending', 'PENDING', 'PENDING_APPROVAL', 'APPROVED', 'PAYABLE'].includes(String(c.rawStatus)),
      )
      .reduce((sum, c) => sum + Number(c.amount || 0), 0);
    const totalReversed = formatted
      .filter((c) => ['reversed', 'REVERSED', 'adjusted'].includes(String(c.rawStatus)))
      .reduce((sum, c) => sum + Math.abs(Number(c.originalAmount || c.amount || 0)), 0);

    const netProfit = positiveRows
      .filter((c) => !['reversed', 'REVERSED'].includes(String(c.rawStatus)))
      .reduce((sum, c) => sum + Number(c.netProfit || 0), 0);

    return apiEnvelope(
      formatted,
      'Commission ledger loaded',
      {
        commissions: formatted,
        metrics: {
          totalGenerated,
          totalReceived,
          totalPaid,
          totalPending,
          totalReversed,
          netProfit,
        },
      },
    );
  }

  async getSummary(query: any = {}, user?: any) {
    const scope = this.assertCanViewAll(user);
    if (scope.isJr) {
      throw new ForbiddenException('Jr. Counsellors can only view their own commission summary');
    }

    const month = query.month ? Number(query.month) : null;
    const year = query.year ? Number(query.year) : null;
    const where: any = { deletedAt: null };
    if (year) {
      const start = new Date(year, month ? month - 1 : 0, 1);
      const end = month
        ? new Date(year, month, 0, 23, 59, 59, 999)
        : new Date(year, 11, 31, 23, 59, 59, 999);
      where.createdAt = { gte: start, lte: end };
    }

    const rows = await this.prisma.commission.findMany({ where });
    const tax = await this.getTaxConfig();

    const accruedCompany = rows
      .filter((r) => !r.isReversal)
      .reduce((s, r) => s + Number(r.amount || 0), 0);
    const receivedFromSchools = rows
      .filter((r) => ['received', 'paid_out', 'PAID'].includes(String(r.status)))
      .reduce((s, r) => s + Number(r.amount || 0), 0);
    const jrPayoutTotal = rows
      .filter((r) => !['reversed', 'REVERSED'].includes(String(r.status)))
      .reduce((s, r) => s + Number(r.jrAmount || 0), 0);
    const srPayoutTotal = rows
      .filter((r) => !['reversed', 'REVERSED'].includes(String(r.status)))
      .reduce((s, r) => s + Number(r.srAmount || 0), 0);
    const reversedAmount = rows
      .filter((r) => r.isReversal || ['reversed', 'REVERSED'].includes(String(r.status)))
      .reduce((s, r) => s + Math.abs(Number(r.originalAmount || r.amount || 0)), 0);

    const netBeforeTax = accruedCompany - jrPayoutTotal - srPayoutTotal;
    const gstAmount = Math.round((accruedCompany * tax.gstRate) / 100);
    const tdsOnPayouts =
      jrPayoutTotal + srPayoutTotal >= tax.tdsThreshold
        ? Math.round(((jrPayoutTotal + srPayoutTotal) * tax.tdsRate) / 100)
        : 0;

    return apiEnvelope(
      {
        period: { year: year || 'ALL', month: month || 'ALL' },
        count: rows.length,
        accruedCompany,
        receivedFromSchools,
        pendingFromSchools: Math.max(0, accruedCompany - receivedFromSchools),
        jrPayoutTotal,
        srPayoutTotal,
        totalTeamPayout: jrPayoutTotal + srPayoutTotal,
        reversedAmount,
        netCompanyProfit: netBeforeTax,
        taxSummary: {
          gstRate: tax.gstRate,
          gstEstimated: gstAmount,
          tdsRate: tax.tdsRate,
          tdsThreshold: tax.tdsThreshold,
          tdsEstimated: tdsOnPayouts,
        },
      },
      'Commission summary calculated',
    );
  }

  async getPendingPayouts(user?: any) {
    const scope = this.assertCanViewAll(user);
    const where: any = {
      deletedAt: null,
      status: {
        in: [
          CommissionStatus.pending,
          CommissionStatus.received,
          CommissionStatus.PENDING,
          CommissionStatus.PENDING_APPROVAL,
          CommissionStatus.APPROVED,
          CommissionStatus.PAYABLE,
        ],
      },
    };
    if (scope.isJr && user?.id) where.beneficiaryId = user.id;

    const rows = await this.prisma.commission.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        school: { select: { id: true, name: true, city: true, paymentTermsDays: true } },
        lead: { select: { id: true, leadNumber: true, studentName: true } },
        beneficiary: { select: { id: true, fullName: true, employeeId: true } },
        admission: { include: { school: true, lead: true, counsellor: true } },
      },
    });
    const formatted = rows.map((r) => this.formatCommission(r));
    return apiEnvelope(formatted, 'Pending commissions fetched', {
      commissions: formatted,
    });
  }

  async getSchoolWiseSummary() {
    const rows = await this.prisma.commission.findMany({
      where: { deletedAt: null },
      include: { school: { select: { id: true, schoolCode: true, name: true, city: true } } },
    });

    const grouped = new Map<string, any>();
    for (const r of rows) {
      const key = r.schoolId || r.schoolName || 'unknown';
      const entry = grouped.get(key) || {
        schoolId: r.schoolId,
        schoolCode: r.school?.schoolCode || null,
        schoolName: r.school?.name || r.schoolName || 'Partner School',
        city: r.school?.city || '',
        totalAdmissions: 0,
        totalCompanyAmount: 0,
        totalJrAmount: 0,
        totalSrAmount: 0,
        netProfit: 0,
        reversedCount: 0,
      };
      if (['reversed', 'REVERSED'].includes(String(r.status))) {
        entry.reversedCount += 1;
      } else {
        entry.totalAdmissions += 1;
        entry.totalCompanyAmount += Number(r.amount || 0);
        entry.totalJrAmount += Number(r.jrAmount || 0);
        entry.totalSrAmount += Number(r.srAmount || 0);
        entry.netProfit += Number(r.netProfit || 0);
      }
      grouped.set(key, entry);
    }

    const result = Array.from(grouped.values()).sort(
      (a, b) => b.totalCompanyAmount - a.totalCompanyAmount,
    );
    return apiEnvelope(result, 'School-wise commission breakdown generated');
  }

  async getUserCommissions(targetUserId: string, kind: 'jr' | 'sr', actor: any) {
    const role = toBlueprintRole(actor?.role);
    if (role === 'jr_counsellor' && actor.id !== targetUserId) {
      throw new ForbiddenException('You can only view your own commissions');
    }

    const where: any = {
      deletedAt: null,
      OR:
        kind === 'jr'
          ? [{ beneficiaryId: targetUserId }, { admission: { counsellorId: targetUserId } }]
          : [{ admission: { managerId: targetUserId } }, { beneficiaryId: targetUserId }],
    };

    const rows = await this.prisma.commission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        school: true,
        lead: true,
        beneficiary: true,
        admission: { include: { school: true, lead: true, counsellor: true } },
      },
    });
    const formatted = rows.map((r) => this.formatCommission(r));
    return apiEnvelope(formatted, `${kind.toUpperCase()} commission history fetched`, {
      commissions: formatted,
    });
  }

  async markAsReceived(id: string, body: any = {}, user?: any) {
    const comm = await this.prisma.commission.findFirst({
      where: { OR: [{ id }, { commissionCode: id }], deletedAt: null },
      include: { lead: true, admission: true },
    });
    if (!comm) throw new NotFoundException('Commission not found');

    if (body.version !== undefined && Number(body.version) !== comm.version) {
      throw new ConflictException(
        'Commission record was updated by another user. Please refresh and retry.',
      );
    }

    const receivedOn = body.received_on || body.receivedOn ? new Date(body.received_on || body.receivedOn) : new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedRows = await tx.commission.updateMany({
        where: { id: comm.id, version: comm.version },
        data: {
          status: CommissionStatus.received,
          receivedOn,
          paymentReference: body.reference || body.utr || comm.paymentReference,
          approvedById: user?.id || comm.approvedById,
          approvedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (updatedRows.count === 0) {
        throw new ConflictException('Concurrent commission update conflict');
      }

      if (comm.leadId) {
        await tx.lead.update({
          where: { id: comm.leadId },
          data: {
            status: LeadStatus.commission_received,
            version: { increment: 1 },
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: user?.id || null,
          userName: user?.fullName || 'Super Admin',
          userRole: user?.role || 'super_admin',
          action: 'UPDATE',
          module: 'commission',
          entity: 'Commission',
          entityId: comm.id,
          oldValue: { status: comm.status },
          newValue: { status: 'received', receivedOn },
          details: { commissionCode: comm.commissionCode },
        },
      });

      return tx.commission.findUnique({
        where: { id: comm.id },
        include: { beneficiary: true, school: true, lead: true, admission: { include: { school: true, lead: true } } },
      });
    });

    if (comm.beneficiaryId && this.notifications) {
      await this.notifications
        .notifyUser({
          userId: comm.beneficiaryId,
          type: 'commission_received',
          title: 'School Commission Received',
          message: `School cleared commission ${comm.commissionCode}. Eligible for payout settlement.`,
          relatedEntityId: comm.id,
          relatedEntityType: 'Commission',
          link: '/commissions',
        })
        .catch(() => undefined);
    }

    const formatted = this.formatCommission(updated);
    return apiEnvelope(formatted, 'Commission marked as received from school', {
      commission: formatted,
    });
  }

  async approveCommission(id: string, user?: any) {
    const comm = await this.prisma.commission.findFirst({
      where: { OR: [{ id }, { commissionCode: id }], deletedAt: null },
    });
    if (!comm) throw new NotFoundException('Commission not found');

    const updated = await this.prisma.commission.update({
      where: { id: comm.id },
      data: {
        status: CommissionStatus.APPROVED,
        approvedById: user?.id || null,
        approvedAt: new Date(),
        version: { increment: 1 },
      },
      include: { beneficiary: true, school: true, lead: true, admission: { include: { school: true, lead: true } } },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user?.id || null,
        userName: user?.fullName || 'Admin',
        userRole: user?.role || 'super_admin',
        action: 'UPDATE',
        module: 'commission',
        entity: 'Commission',
        entityId: comm.id,
        details: { commissionCode: comm.commissionCode, amount: comm.amount, approved: true },
      },
    });

    const formatted = this.formatCommission(updated);
    return apiEnvelope(formatted, 'Commission approved for payout', {
      commission: formatted,
    });
  }

  async markAsPaid(
    id: string,
    paymentReference?: string,
    paymentMode = 'NEFT/RTGS/IMPS',
    user?: any,
    extra: any = {},
  ) {
    const comm = await this.prisma.commission.findFirst({
      where: { OR: [{ id }, { commissionCode: id }], deletedAt: null },
      include: { beneficiary: true },
    });
    if (!comm) throw new NotFoundException('Commission not found');

    if (extra.version !== undefined && Number(extra.version) !== comm.version) {
      throw new ConflictException(
        'Commission record modified by another user. Please refresh and retry.',
      );
    }

    const ref =
      paymentReference ||
      extra.payment_reference ||
      extra.utr ||
      `UTR-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
    const paidOn = extra.paid_on || extra.paidOn ? new Date(extra.paid_on || extra.paidOn) : new Date();
    const payoutTotal =
      Number(comm.jrAmount || 0) + Number(comm.srAmount || 0) || Number(comm.amount || 0);

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedRows = await tx.commission.updateMany({
        where: { id: comm.id, version: comm.version },
        data: {
          status: CommissionStatus.paid_out,
          paymentReference: ref,
          paymentMode,
          paidOn,
          paidAt: paidOn,
          version: { increment: 1 },
        },
      });
      if (updatedRows.count === 0) {
        throw new ConflictException('Concurrent payout update conflict');
      }

      const payCount = await tx.payment.count();
      await tx.payment.create({
        data: {
          paymentCode: `PAY-2026-${String(payCount + 1).padStart(4, '0')}`,
          commissionId: comm.id,
          amount: payoutTotal,
          utrNumber: ref,
          paymentMode,
          recordedById: user?.id || null,
          paidAt: paidOn,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user?.id || null,
          userName: user?.fullName || 'Super Admin',
          userRole: user?.role || 'super_admin',
          action: 'UPDATE',
          module: 'commission',
          entity: 'Commission',
          entityId: comm.id,
          oldValue: { status: comm.status },
          newValue: { status: 'paid_out', utrNumber: ref, payoutTotal },
          details: { commissionCode: comm.commissionCode, utrNumber: ref },
        },
      });

      return tx.commission.findUnique({
        where: { id: comm.id },
        include: { beneficiary: true, school: true, lead: true, admission: { include: { school: true, lead: true } } },
      });
    });

    if (comm.beneficiaryId && this.notifications) {
      await this.notifications
        .notifyUser({
          userId: comm.beneficiaryId,
          type: 'commission_paid',
          title: 'Commission Payout Settled',
          message: `Commission ${comm.commissionCode} payout settled (UTR: ${ref}).`,
          relatedEntityId: comm.id,
          relatedEntityType: 'Commission',
          link: '/commissions',
        })
        .catch(() => undefined);
    }

    const formatted = this.formatCommission(updated);
    return apiEnvelope(formatted, 'Commission payout recorded successfully', {
      commission: formatted,
    });
  }

  /**
   * Commission Reversal + Self-Relating Adjustment Ledger + 90-Day FNF Clawback Rule
   */
  async reverseCommission(
    id: string,
    reason?: string,
    user?: any,
    alreadyPaidOverride?: boolean,
  ) {
    const cleanReason = String(reason || '').trim();
    if (cleanReason.length < 5) {
      throw new BadRequestException(
        'Reversal reason is mandatory and must be at least 5 characters.',
      );
    }

    const comm = await this.prisma.commission.findFirst({
      where: { OR: [{ id }, { commissionCode: id }], deletedAt: null },
      include: { beneficiary: true, admission: true },
    });
    if (!comm) throw new NotFoundException('Commission not found');

    if (['reversed', 'REVERSED'].includes(String(comm.status))) {
      throw new BadRequestException('Commission has already been reversed');
    }

    const originalAmount = Number(comm.originalAmount || comm.amount || 0);
    const jrOriginal = Number(comm.jrAmount || 0);
    const srOriginal = Number(comm.srAmount || 0);

    const wasPaid =
      alreadyPaidOverride === true ||
      Boolean(comm.paidOn || comm.paidAt) ||
      ['paid_out', 'PAID'].includes(String(comm.status));

    // Check 90-day FNF window on resigned/suspended beneficiary
    let fnfFlag = wasPaid ? 'deduct_next_payout' : 'cancelled_before_payout';
    let fnfStatus = wasPaid ? 'pending_deduction' : 'closed_zero';
    if (comm.beneficiary && (comm.beneficiary.status === 'suspended' || comm.beneficiary.fnfDate)) {
      const daysSinceResign = comm.beneficiary.fnfDate
        ? Math.floor((Date.now() - new Date(comm.beneficiary.fnfDate).getTime()) / 86400000)
        : 0;
      fnfFlag = daysSinceResign <= (comm.fnfPeriodDays || 90)
        ? 'clawback_fnf_within_90d'
        : 'fnf_period_expired_writeoff';
      fnfStatus = daysSinceResign <= (comm.fnfPeriodDays || 90) ? 'fnf_hold' : 'writeoff';
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedCount = await tx.commission.updateMany({
        where: { id: comm.id, version: comm.version },
        data: {
          status: CommissionStatus.reversed,
          originalAmount,
          amount: 0,
          netProfit: 0,
          isReversal: true,
          reversalReason: cleanReason,
          reversedById: user?.id || null,
          reversedAt: new Date(),
          fnfFlag,
          fnfStatus,
          version: { increment: 1 },
        },
      });
      if (updatedCount.count === 0) {
        throw new ConflictException('Concurrent commission modification conflict');
      }

      const updatedOriginal = await tx.commission.findUnique({
        where: { id: comm.id },
        include: { beneficiary: true, school: true, lead: true, admission: { include: { school: true, lead: true } } },
      });

      let adjustmentEntry: any = null;
      if (wasPaid) {
        const adjCode = await this.nextCommissionCode(tx);
        const totalClawback = jrOriginal + srOriginal > 0 ? jrOriginal + srOriginal : originalAmount;
        adjustmentEntry = await tx.commission.create({
          data: {
            commissionCode: adjCode,
            admissionId: comm.admissionId,
            leadId: comm.leadId,
            schoolId: comm.schoolId,
            parentCommissionId: comm.id,
            schoolName: comm.schoolName,
            studentName: comm.studentName,
            parentName: comm.parentName,
            beneficiaryId: comm.beneficiaryId,
            beneficiaryName: comm.beneficiaryName,
            beneficiaryType: 'REVERSAL_ADJUSTMENT',
            beneficiaryRole: comm.beneficiaryRole,
            teamId: comm.teamId,
            originalAmount,
            amount: -Math.abs(totalClawback),
            jrAmount: -Math.abs(jrOriginal),
            jrName: comm.jrName,
            srAmount: -Math.abs(srOriginal),
            srName: comm.srName,
            netProfit: -Math.abs(totalClawback),
            status: CommissionStatus.adjusted,
            isReversal: true,
            reversalReason: `Clawback Adjustment (${comm.commissionCode}): ${cleanReason}`,
            reversedById: user?.id || null,
            reversedAt: new Date(),
            fnfFlag,
            fnfPeriodDays: comm.fnfPeriodDays || 90,
            fnfStatus,
          },
          include: { beneficiary: true, school: true, lead: true },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: user?.id || null,
          userName: user?.fullName || 'Super Admin',
          userRole: user?.role || 'super_admin',
          action: 'REVERSE',
          module: 'commission',
          entity: 'Commission',
          entityId: comm.id,
          oldValue: {
            commissionCode: comm.commissionCode,
            status: comm.status,
            amount: originalAmount,
          },
          newValue: {
            status: 'reversed',
            amount: 0,
            wasPaid,
            fnfFlag,
            adjustmentId: adjustmentEntry?.commissionCode || null,
          },
          details: {
            commissionCode: comm.commissionCode,
            originalAmount,
            reason: cleanReason,
          },
          isSpecialFlag: true,
        },
      });

      return { updatedOriginal, adjustmentEntry };
    }, { maxWait: 15000, timeout: 45000 });

    if (comm.beneficiaryId && this.notifications) {
      await this.notifications
        .notifyUser({
          userId: comm.beneficiaryId,
          type: 'commission_reversed',
          title: 'Commission Reversal Notice',
          message: `Commission ${comm.commissionCode} (₹${originalAmount.toLocaleString('en-IN')}) reversed. Reason: ${cleanReason}`,
          relatedEntityId: comm.id,
          relatedEntityType: 'Commission',
          link: '/commissions',
        })
        .catch(() => undefined);
    }

    const formattedOrig = this.formatCommission(result.updatedOriginal);
    const formattedAdj = result.adjustmentEntry
      ? this.formatCommission(result.adjustmentEntry)
      : null;

    return apiEnvelope(
      {
        commission: formattedOrig,
        adjustmentEntry: formattedAdj,
        wasPaid,
        fnfFlag,
      },
      wasPaid
        ? 'Commission reversed and negative FNF adjustment entry created.'
        : 'Commission reversed cleanly and zeroed in ledger.',
      {
        commission: formattedOrig,
        adjustmentEntry: formattedAdj,
      },
    );
  }

  async createAdjustment(id: string, body: any, user?: any) {
    const parent = await this.prisma.commission.findFirst({
      where: { OR: [{ id }, { commissionCode: id }], deletedAt: null },
    });
    if (!parent) throw new NotFoundException('Parent commission not found');

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount === 0) {
      throw new BadRequestException('Adjustment amount must be non-zero');
    }
    const reason = String(body.reason || 'Manual commission adjustment').trim();

    const code = await this.nextCommissionCode();
    const created = await this.prisma.commission.create({
      data: {
        commissionCode: code,
        admissionId: parent.admissionId,
        leadId: parent.leadId,
        schoolId: parent.schoolId,
        parentCommissionId: parent.id,
        schoolName: parent.schoolName,
        studentName: parent.studentName,
        parentName: parent.parentName,
        beneficiaryId: parent.beneficiaryId,
        beneficiaryName: parent.beneficiaryName,
        beneficiaryType: 'MANUAL_ADJUSTMENT',
        beneficiaryRole: parent.beneficiaryRole,
        teamId: parent.teamId,
        originalAmount: Math.abs(amount),
        amount,
        jrAmount: Number(body.jrAmount ?? 0),
        jrName: parent.jrName,
        srAmount: Number(body.srAmount ?? 0),
        srName: parent.srName,
        netProfit: amount - Number(body.jrAmount ?? 0) - Number(body.srAmount ?? 0),
        status: CommissionStatus.adjusted,
        isReversal: amount < 0,
        reversalReason: reason,
        reversedById: user?.id || null,
        reversedAt: new Date(),
        fnfFlag: body.fnfFlag || body.fnf_flag || 'manual_adjustment',
      },
      include: { beneficiary: true, school: true, lead: true, admission: true },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user?.id || null,
        userName: user?.fullName || 'Super Admin',
        userRole: user?.role || 'super_admin',
        action: 'CREATE',
        module: 'commission',
        entity: 'Commission',
        entityId: created.id,
        details: {
          parentCommissionId: parent.id,
          parentCode: parent.commissionCode,
          adjustmentCode: code,
          amount,
          reason,
        },
        isSpecialFlag: true,
      },
    });

    const formatted = this.formatCommission(created);
    return apiEnvelope(formatted, 'Commission adjustment recorded', {
      commission: formatted,
    });
  }
}
