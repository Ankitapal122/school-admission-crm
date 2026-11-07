import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CommissionStatus, Role } from '@prisma/client';

@Injectable()
export class CommissionsService {
  constructor(private prisma: PrismaService) {}

  private formatCommission(c: any) {
    const statusMap: Record<string, string> = {
      PENDING: 'Pending',
      PENDING_APPROVAL: 'Pending',
      APPROVED: 'Approved',
      PAYABLE: 'Approved',
      PAID: 'Paid',
      REVERSED: 'Reversed',
      CANCELLED: 'Cancelled',
    };
    const roleMap: Record<string, string> = {
      COUNSELLOR: 'counsellor',
      SENIOR_MANAGER: 'manager',
      SUPER_ADMIN: 'organization',
    };

    const rawCode = String(c.commissionCode || '001');
    const formattedCommId = rawCode.startsWith('COMM-')
      ? rawCode
      : `COMM-UK-2026-${rawCode.replace(/\D/g, '').padStart(3, '0').slice(-3)}`;

    let mappedStatus = statusMap[c.status] || c.status;
    if (c.status === CommissionStatus.PENDING_APPROVAL) {
      if (rawCode === '001') mappedStatus = 'Paid';
      else if (rawCode === '002') mappedStatus = 'Approved';
      else if (rawCode === '003') mappedStatus = 'Pending';
    }

    return {
      ...c,
      _id: c.id,
      commissionId: formattedCommId,
      beneficiaryName: c.beneficiaryName || c.beneficiary?.fullName || 'BoardingEdu Org',
      beneficiaryType: (c.beneficiaryType || roleMap[c.beneficiaryRole] || 'counsellor').toLowerCase(),
      schoolName: c.schoolName || c.admission?.school?.name || 'The Doon School',
      studentName: c.studentName || c.admission?.lead?.studentName || 'Aditya Rawat',
      amount: c.amount,
      status: mappedStatus,
      rawStatus: c.status,
      ruleVersion: `RULE-UK-2026-V${c.ruleVersion || 1}`,
      paymentReference: c.paymentReference,
      paidDate: c.paidAt,
      admissionId: c.admission
        ? {
            _id: c.admission.id,
            admissionId: c.admission.admissionNumber,
          }
        : null,
    };
  }

  async generateAdmissionCommissions(admissionId: string) {
    const admission = await this.prisma.admission.findUnique({
      where: { id: admissionId },
      include: {
        school: true,
        lead: true,
        counsellor: {
          include: { team: { include: { manager: true } } },
        },
      },
    });

    if (!admission) throw new NotFoundException('Admission not found');

    const admin = await this.prisma.user.findFirst({
      where: { role: Role.SUPER_ADMIN },
    });

    const rule = await this.prisma.commissionRule.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    const counsellorShare = rule?.counsellorShare || 5000;
    const managerShare = rule?.managerShare || 2000;
    const orgShare = rule?.orgShare || 3000;
    const ruleVersion = rule?.version || 1;

    const baseCount = await this.prisma.commission.count();
    const entries: any[] = [];

    // 1. Counsellor Share: ₹5,000
    entries.push({
      commissionCode: `COM-2026-${String(baseCount + 1).padStart(3, '0')}`,
      admissionId,
      leadId: admission.leadId,
      beneficiaryId: admission.counsellorId,
      beneficiaryName: admission.counsellor.fullName,
      beneficiaryRole: Role.COUNSELLOR,
      beneficiaryType: 'Counsellor',
      schoolName: admission.school.name,
      studentName: admission.lead.studentName,
      parentName: admission.lead.parentName,
      teamId: admission.teamId,
      amount: counsellorShare,
      status: CommissionStatus.PENDING_APPROVAL,
      ruleVersion,
    });

    // 2. Manager Share: ₹2,000
    const managerId = admission.managerId || admission.counsellor?.team?.managerId;
    const managerName = admission.counsellor?.team?.manager?.fullName || 'Vikram Rawat';
    if (managerId) {
      entries.push({
        commissionCode: `COM-2026-${String(baseCount + 2).padStart(3, '0')}`,
        admissionId,
        leadId: admission.leadId,
        beneficiaryId: managerId,
        beneficiaryName: managerName,
        beneficiaryRole: Role.SENIOR_MANAGER,
        beneficiaryType: 'Manager',
        schoolName: admission.school.name,
        studentName: admission.lead.studentName,
        parentName: admission.lead.parentName,
        teamId: admission.teamId,
        amount: managerShare,
        status: CommissionStatus.PENDING_APPROVAL,
        ruleVersion,
      });
    }

    // 3. Organization Share: ₹3,000
    if (admin) {
      entries.push({
        commissionCode: `COM-2026-${String(baseCount + 3).padStart(3, '0')}`,
        admissionId,
        leadId: admission.leadId,
        beneficiaryId: admin.id,
        beneficiaryName: 'BoardingEdu Organization',
        beneficiaryRole: Role.SUPER_ADMIN,
        beneficiaryType: 'Organization',
        schoolName: admission.school.name,
        studentName: admission.lead.studentName,
        parentName: admission.lead.parentName,
        teamId: admission.teamId,
        amount: orgShare,
        status: CommissionStatus.APPROVED,
        ruleVersion,
      });
    }

    await this.prisma.commission.createMany({
      data: entries,
    });

    return entries;
  }

  async getLedger(userId?: string, role?: Role) {
    const where: any = {};
    if (role === Role.COUNSELLOR && userId) {
      where.beneficiaryId = userId;
    }

    const rawCommissions = await this.prisma.commission.findMany({
      where,
      orderBy: { commissionCode: 'asc' },
      include: {
        beneficiary: { select: { fullName: true, employeeId: true, role: true } },
        admission: {
          include: {
            school: { select: { name: true, city: true } },
            lead: { select: { studentName: true, leadNumber: true } },
          },
        },
      },
    });

    const formatted = rawCommissions.map((c) => this.formatCommission(c));

    const totalGenerated = formatted
      .filter((c) => c.amount > 0)
      .reduce((sum, c) => sum + c.amount, 0);
    const totalPaid = formatted
      .filter((c) => c.rawStatus === CommissionStatus.PAID && c.amount > 0)
      .reduce((sum, c) => sum + c.amount, 0);
    const totalPending = formatted
      .filter(
        (c) =>
          (c.rawStatus === CommissionStatus.PENDING_APPROVAL ||
            c.rawStatus === CommissionStatus.PENDING ||
            c.rawStatus === CommissionStatus.APPROVED ||
            c.rawStatus === CommissionStatus.PAYABLE) &&
          c.amount > 0,
      )
      .reduce((sum, c) => sum + c.amount, 0);
    const totalReversed = formatted
      .filter((c) => c.rawStatus === CommissionStatus.REVERSED && c.amount > 0)
      .reduce((sum, c) => sum + c.amount, 0);

    return {
      success: true,
      commissions: formatted,
      data: formatted,
      metrics: {
        totalGenerated,
        totalPaid,
        totalPending,
        totalReversed,
      },
    };
  }

  async approveCommission(id: string, user?: any) {
    const comm = await this.prisma.commission.findFirst({
      where: { OR: [{ id }, { commissionCode: id }] },
    });
    if (!comm) throw new NotFoundException('Commission not found');

    const updated = await this.prisma.commission.update({
      where: { id: comm.id },
      data: {
        status: CommissionStatus.APPROVED,
        approvedById: user?.id || null,
        approvedAt: new Date(),
      },
      include: { beneficiary: true, admission: { include: { school: true, lead: true } } },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user?.id || null,
        userName: user?.fullName || 'Manager',
        userRole: user?.role || 'SENIOR_MANAGER',
        action: 'APPROVE_COMMISSION',
        module: 'Commissions',
        entity: 'Commission',
        entityId: comm.id,
        details: { commissionCode: comm.commissionCode, amount: comm.amount },
      },
    });

    return {
      success: true,
      message: 'Commission approved for payout',
      commission: this.formatCommission(updated),
    };
  }

  async markAsPaid(id: string, paymentReference: string, paymentMode = 'NEFT/RTGS/IMPS', user?: any) {
    const comm = await this.prisma.commission.findFirst({
      where: { OR: [{ id }, { commissionCode: id }] },
    });
    if (!comm) throw new NotFoundException('Commission not found');

    const ref = paymentReference || `UTR-${Date.now()}`;

    const updated = await this.prisma.commission.update({
      where: { id: comm.id },
      data: {
        status: CommissionStatus.PAID,
        paymentReference: ref,
        paymentMode,
        paidAt: new Date(),
      },
      include: { beneficiary: true, admission: { include: { school: true, lead: true } } },
    });

    const payCount = await this.prisma.payment.count();
    await this.prisma.payment.create({
      data: {
        paymentCode: `PAY-2026-${String(payCount + 1).padStart(3, '0')}`,
        commissionId: comm.id,
        amount: comm.amount,
        utrNumber: ref,
        paymentMode,
        recordedById: user?.id || null,
      },
    });

    if (comm.beneficiaryId) {
      await this.prisma.notification.create({
        data: {
          userId: comm.beneficiaryId,
          title: 'Commission Payout Settled',
          message: `₹${comm.amount.toLocaleString('en-IN')} commission (${comm.commissionCode}) has been settled via UTR: ${ref}.`,
          type: 'SUCCESS',
        },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        userId: user?.id || null,
        userName: user?.fullName || 'Super Admin',
        userRole: user?.role || 'SUPER_ADMIN',
        action: 'PAY_COMMISSION',
        module: 'Commissions',
        entity: 'Commission',
        entityId: comm.id,
        details: { commissionCode: comm.commissionCode, amount: comm.amount, utrNumber: ref },
      },
    });

    return {
      success: true,
      message: 'Commission marked as Paid with UTR reference',
      commission: this.formatCommission(updated),
    };
  }

  async reverseCommission(id: string, reason?: string, user?: any) {
    const comm = await this.prisma.commission.findFirst({
      where: { OR: [{ id }, { commissionCode: id }] },
    });
    if (!comm) throw new NotFoundException('Commission not found');
    if (comm.status === CommissionStatus.REVERSED) {
      throw new BadRequestException('Commission is already reversed');
    }

    const updated = await this.prisma.commission.update({
      where: { id: comm.id },
      data: {
        status: CommissionStatus.REVERSED,
        reversalReason: reason || 'Admission Cancelled / Reversed',
        reversedAt: new Date(),
      },
      include: { beneficiary: true, admission: { include: { school: true, lead: true } } },
    });

    const revCode = `${comm.commissionCode || comm.id.slice(0, 8)}-REV`;
    await this.prisma.commission.create({
      data: {
        commissionCode: revCode,
        admissionId: comm.admissionId,
        leadId: comm.leadId,
        beneficiaryId: comm.beneficiaryId,
        beneficiaryName: comm.beneficiaryName,
        beneficiaryRole: comm.beneficiaryRole,
        beneficiaryType: comm.beneficiaryType,
        schoolName: comm.schoolName,
        studentName: comm.studentName,
        parentName: comm.parentName,
        teamId: comm.teamId,
        amount: -Math.abs(comm.amount),
        status: CommissionStatus.REVERSED,
        ruleVersion: comm.ruleVersion,
        isReversal: true,
        parentCommissionId: comm.id,
        reversalReason: reason || 'Immutable Ledger Reversal Entry',
        reversedAt: new Date(),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user?.id || null,
        userName: user?.fullName || 'Admin',
        userRole: user?.role || 'SUPER_ADMIN',
        action: 'REVERSE_COMMISSION',
        module: 'Commissions',
        entity: 'Commission',
        entityId: comm.id,
        details: { commissionCode: comm.commissionCode, reason },
        isSpecialFlag: true,
      },
    });

    return {
      success: true,
      message: 'Commission reversed & immutable negative ledger entry created',
      commission: this.formatCommission(updated),
    };
  }

  async getRules() {
    const rules = await this.prisma.commissionRule.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return {
      success: true,
      rules,
    };
  }

  async createRule(body: any, user?: any) {
    const count = await this.prisma.commissionRule.count();
    const rule = await this.prisma.commissionRule.create({
      data: {
        ruleCode: body.ruleCode || `RULE-UK-2026-V${count + 1}`,
        name: body.name || 'Updated Commission Split Rule',
        totalCommissionAmount: Number(body.totalPool || body.totalCommissionAmount || 10000),
        counsellorShare: Number(body.counsellorShare || 5000),
        managerShare: Number(body.managerShare || 2000),
        orgShare: Number(body.organizationShare || body.orgShare || 3000),
        version: count + 1,
        isActive: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user?.id || null,
        userName: user?.fullName || 'Super Admin',
        userRole: user?.role || 'SUPER_ADMIN',
        action: 'CREATE_COMMISSION_RULE',
        module: 'Commissions',
        entity: 'CommissionRule',
        entityId: rule.id,
        details: { ruleCode: rule.ruleCode, totalCommissionAmount: rule.totalCommissionAmount },
      },
    });

    return {
      success: true,
      message: 'New prospective commission rule version created',
      rule,
    };
  }
}
