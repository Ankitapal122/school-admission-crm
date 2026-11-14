import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { matchingRoleVariants, normalizeCanonicalRole } from '../../common/utils/crm.utils';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getPendingConfirmations(user: any) {
    const canon = normalizeCanonicalRole(user.role);
    const where: any = { status: { in: ['pending', 'escalated'] } };
    if (canon === 'COUNSELLOR') {
      where.userId = user.id;
    } else if (canon === 'SENIOR_MANAGER') {
      const teamUsers = await this.prisma.user.findMany({
        where: { OR: [{ id: user.id }, { managerId: user.id }] },
        select: { id: true },
      });
      where.userId = { in: teamUsers.map((u) => u.id) };
    }

    const items = await this.prisma.pendingLoggingQueue.findMany({ where });
    let wa = 0;
    let calls = 0;
    let under1h = 0;
    let h1to4 = 0;
    let over4h = 0;
    let over24h = 0;
    const now = Date.now();

    for (const item of items) {
      if (item.actionType === 'whatsapp_sent') wa++;
      else calls++;
      const hrs = (now - new Date(item.createdAt).getTime()) / (1000 * 60 * 60);
      if (hrs >= 24) over24h++;
      else if (hrs >= 4) over4h++;
      else if (hrs >= 1) h1to4++;
      else under1h++;
    }

    return {
      whatsapp_pending: wa,
      call_pending: calls,
      total_pending: items.length,
      aging: {
        under_1h: under1h,
        '1h_to_4h': h1to4,
        over_4h: over4h,
        over_24h: over24h,
      },
    };
  }

  async getJrDashboard(user: any) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 86_400_000);

    const [
      myLeadsCount,
      todayFollowUps,
      overdueFollowUps,
      waLogsCount,
      callLogsCount,
      myCommissions,
      recentLeads,
      pendingConfirmations,
    ] = await Promise.all([
      this.prisma.lead.count({
        where: {
          deletedAt: null,
          OR: [{ assignedCounsellorId: user.id }, { createdById: user.id }],
        },
      }),
      this.prisma.lead.count({
        where: {
          deletedAt: null,
          OR: [{ assignedCounsellorId: user.id }, { createdById: user.id }],
          nextFollowUpDate: { gte: startOfToday, lt: endOfToday },
        },
      }),
      this.prisma.lead.count({
        where: {
          deletedAt: null,
          OR: [{ assignedCounsellorId: user.id }, { createdById: user.id }],
          nextFollowUpDate: { lt: startOfToday },
          status: { notIn: ['closed', 'merged', 'expired', 'disqualified', 'LOST', 'MERGED'] },
        },
      }),
      this.prisma.whatsappLog.count({ where: { sentBy: user.id } }),
      this.prisma.callLog.count({ where: { calledBy: user.id } }),
      this.prisma.commission.findMany({
        where: { beneficiaryId: user.id, deletedAt: null },
      }),
      this.prisma.lead.findMany({
        where: {
          deletedAt: null,
          OR: [{ assignedCounsellorId: user.id }, { createdById: user.id }],
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.getPendingConfirmations(user),
    ]);

    const earned = myCommissions
      .filter((c) => !['reversed', 'REVERSED', 'CANCELLED'].includes(c.status))
      .reduce((acc, c) => acc + Number(c.jrAmount || c.amount || 0), 0);

    return {
      totalLeads: myLeadsCount,
      todayFollowUps,
      overdueFollowUps,
      waSentCount: waLogsCount,
      callsMadeCount: callLogsCount,
      earnedCommission: earned,
      pendingConfirmations,
      recentLeads,
    };
  }

  async getSrDashboard(user: any) {
    const teamMembers = await this.prisma.user.findMany({
      where: { managerId: user.id, deletedAt: null },
      select: { id: true, fullName: true, email: true, role: true },
    });
    const memberIds = [user.id, ...teamMembers.map((m) => m.id)];
    const canon = normalizeCanonicalRole(user.role);
    const leadScope: any =
      canon === 'SUPER_ADMIN'
        ? { deletedAt: null }
        : {
            deletedAt: null,
            OR: [
              { assignedManagerId: user.id },
              { assignedCounsellorId: { in: memberIds } },
              { assignedCounsellorId: null },
            ],
          };

    const [
      totalTeamLeads,
      pipelineByStatus,
      appsCount,
      pendingQueue,
      expiredCount,
      duplicateLeadsCount,
      pendingConfirmations,
    ] = await Promise.all([
      this.prisma.lead.count({ where: leadScope }),
      this.prisma.lead.groupBy({ by: ['status'], where: leadScope, _count: { id: true } }),
      this.prisma.admission.count({
        where: canon === 'SUPER_ADMIN' ? { deletedAt: null } : { deletedAt: null, managerId: user.id },
      }),
      this.prisma.pendingLoggingQueue.findMany({
        where: { userId: { in: memberIds }, status: { in: ['pending', 'escalated'] } },
        take: 10,
        include: {
          lead: { select: { leadNumber: true, studentName: true } },
          user: { select: { fullName: true } },
        },
      }),
      this.prisma.lead.count({ where: { ...leadScope, status: 'expired' } }),
      this.prisma.lead.count({ where: { ...leadScope, status: { in: ['merged', 'MERGED'] } } }),
      this.getPendingConfirmations(user),
    ]);

    return {
      totalLeads: totalTeamLeads,
      teamSize: teamMembers.length,
      teamMembers,
      applicationsCount: appsCount,
      expiredCount,
      duplicateLeadsCount,
      pipelineBreakdown: pipelineByStatus.map((g) => ({ status: g.status, count: g._count.id })),
      pendingQueueAlerts: pendingQueue,
      pendingConfirmations,
    };
  }

  async getAdminDashboard(user: any) {
    const [
      totalLeads,
      totalSchools,
      totalAdmissions,
      commissions,
      managersCount,
      counsellorsCount,
      pendingVerifications,
      liveUsers,
      activeSessions,
      pipelineGrouped,
      pendingConfirmations,
    ] = await Promise.all([
      this.prisma.lead.count({ where: { deletedAt: null } }),
      this.prisma.school.count({ where: { deletedAt: null, status: 'active' } }),
      this.prisma.admission.count({ where: { deletedAt: null } }),
      this.prisma.commission.findMany({ where: { deletedAt: null } }),
      this.prisma.user.count({
        where: { role: { in: matchingRoleVariants('SENIOR_MANAGER') as any }, deletedAt: null, isActive: true },
      }),
      this.prisma.user.count({
        where: { role: { in: matchingRoleVariants('COUNSELLOR') as any }, deletedAt: null, isActive: true },
      }),
      this.prisma.lead.count({
        where: { deletedAt: null, verificationStatus: 'PENDING_VERIFICATION' },
      }),
      this.prisma.user.findMany({
        where: { deletedAt: null, isActive: true },
        select: {
          id: true,
          fullName: true,
          employeeId: true,
          role: true,
          status: true,
          lastLoginAt: true,
          manager: { select: { fullName: true } },
          team: { select: { name: true } },
        },
        orderBy: { lastLoginAt: 'desc' },
        take: 25,
      }),
      this.prisma.refreshTokenSession.count({
        where: { isActive: true, isRevoked: false, expiresAt: { gt: new Date() } },
      }),
      this.prisma.lead.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: { id: true },
      }),
      this.getPendingConfirmations(user),
    ]);

    const totalRevenue = commissions
      .filter((c) => !c.isReversal && !['reversed', 'REVERSED', 'CANCELLED'].includes(c.status))
      .reduce((acc, c) => acc + Number(c.amount || 0), 0);
    const realizedRevenue = commissions
      .filter((c) => ['received', 'paid_out', 'PAID', 'APPROVED'].includes(c.status))
      .reduce((acc, c) => acc + Number(c.amount || 0), 0);
    const reversedAmount = commissions
      .filter((c) => c.isReversal || ['reversed', 'REVERSED'].includes(c.status))
      .reduce((acc, c) => acc + Number(c.originalAmount || c.amount || 0), 0);

    return {
      totalLeads,
      totalSchools,
      totalAdmissions,
      managersCount,
      counsellorsCount,
      pendingVerifications,
      activeSessions,
      totalCommission: totalRevenue,
      realizedCommission: realizedRevenue,
      reversedCommission: reversedAmount,
      pipelineBreakdown: pipelineGrouped.map((p) => ({ status: p.status, count: p._count.id })),
      presenceMonitor: liveUsers,
      pendingConfirmations,
    };
  }
}
