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
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);

    const leadOwnerScope = {
      deletedAt: null,
      OR: [{ assignedCounsellorId: user.id }, { createdById: user.id }],
    };

    const [
      myLeadsCount,
      todayNewLeads,
      todayFollowUps,
      overdueFollowUps,
      upcomingFollowUps,
      interestedParents,
      notInterestedParents,
      admissionInProgress,
      admissionConfirmed,
      todayCalls,
      waLogsCount,
      callLogsCount,
      myCommissions,
      recentLeads,
      todayFollowUpList,
      overdueFollowUpList,
      pendingManagerApprovals,
      returnedLeads,
      upcomingVisits,
      recentCalls,
      recentWa,
      myAdmissions,
      weeklyPendingQueueCount,
      pendingConfirmations,
    ] = await Promise.all([
      this.prisma.lead.count({ where: leadOwnerScope }),
      this.prisma.lead.count({ where: { ...leadOwnerScope, createdAt: { gte: startOfToday, lt: endOfToday } } }),
      this.prisma.lead.count({
        where: { ...leadOwnerScope, nextFollowUpDate: { gte: startOfToday, lt: endOfToday } },
      }),
      this.prisma.lead.count({
        where: {
          ...leadOwnerScope,
          nextFollowUpDate: { lt: startOfToday },
          status: { notIn: ['closed', 'merged', 'expired', 'disqualified', 'admission_done', 'LOST', 'MERGED'] },
        },
      }),
      this.prisma.lead.count({
        where: {
          ...leadOwnerScope,
          nextFollowUpDate: { gte: endOfToday },
          status: { notIn: ['closed', 'merged', 'expired', 'disqualified', 'admission_done', 'LOST', 'MERGED'] },
        },
      }),
      this.prisma.lead.count({
        where: {
          ...leadOwnerScope,
          status: { in: ['qualified', 'shortlisted', 'visit_registration', 'applied', 'selected', 'conference_call', 'test_interview'] },
        },
      }),
      this.prisma.lead.count({
        where: { ...leadOwnerScope, status: { in: ['disqualified', 'LOST', 'closed'] } },
      }),
      this.prisma.admission.count({
        where: {
          deletedAt: null,
          counsellorId: user.id,
          stage: { notIn: ['admission_done', 'closed', 'commission_received'] },
        },
      }),
      this.prisma.admission.count({
        where: {
          deletedAt: null,
          counsellorId: user.id,
          stage: { in: ['admission_done', 'commission_received'] },
        },
      }),
      this.prisma.callLog.count({ where: { calledBy: user.id, createdAt: { gte: startOfToday, lt: endOfToday } } }),
      this.prisma.whatsappLog.count({ where: { sentBy: user.id } }),
      this.prisma.callLog.count({ where: { calledBy: user.id } }),
      this.prisma.commission.findMany({ where: { beneficiaryId: user.id, deletedAt: null } }),
      this.prisma.lead.findMany({
        where: leadOwnerScope,
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.lead.findMany({
        where: { ...leadOwnerScope, nextFollowUpDate: { gte: startOfToday, lt: endOfToday } },
        orderBy: { nextFollowUpDate: 'asc' },
        take: 10,
      }),
      this.prisma.lead.findMany({
        where: {
          ...leadOwnerScope,
          nextFollowUpDate: { lt: startOfToday },
          status: { notIn: ['closed', 'merged', 'expired', 'disqualified', 'admission_done', 'LOST', 'MERGED'] },
        },
        orderBy: { nextFollowUpDate: 'asc' },
        take: 10,
      }),
      this.prisma.lead.findMany({
        where: { ...leadOwnerScope, verificationStatus: 'PENDING_VERIFICATION' },
        orderBy: { updatedAt: 'desc' },
        take: 8,
      }),
      this.prisma.lead.findMany({
        where: { ...leadOwnerScope, verificationStatus: 'RETURNED' },
        orderBy: { updatedAt: 'desc' },
        take: 8,
      }),
      this.prisma.schoolTour.findMany({
        where: {
          lead: { OR: [{ assignedCounsellorId: user.id }, { createdById: user.id }] },
          scheduledAt: { gte: startOfToday },
          status: { in: ['SCHEDULED', 'RESCHEDULED', 'CONFIRMED'] },
        },
        include: {
          lead: { select: { id: true, leadNumber: true, studentName: true } },
          school: { select: { id: true, name: true, city: true } },
        },
        orderBy: { scheduledAt: 'asc' },
        take: 8,
      }),
      this.prisma.callLog.findMany({
        where: { calledBy: user.id },
        include: { lead: { select: { leadNumber: true, studentName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
      this.prisma.whatsappLog.findMany({
        where: { sentBy: user.id },
        include: { lead: { select: { leadNumber: true, studentName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
      this.prisma.admission.findMany({
        where: { deletedAt: null, counsellorId: user.id },
        include: {
          school: { select: { name: true } },
          installments: { where: { status: { in: ['PENDING', 'PENDING_VERIFICATION', 'OVERDUE'] } } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),
      this.prisma.pendingLoggingQueue.count({
        where: { userId: user.id, createdAt: { gte: sevenDaysAgo }, status: { in: ['pending', 'escalated'] } },
      }),
      this.getPendingConfirmations(user),
    ]);

    const activeComms = myCommissions.filter(
      (c) => !c.isReversal && !['reversed', 'REVERSED', 'CANCELLED'].includes(c.status),
    );
    const earned = activeComms.reduce((acc, c) => acc + Number(c.jrAmount || c.amount || 0), 0);
    const paidCommission = activeComms
      .filter((c) => ['paid_out', 'PAID'].includes(c.status))
      .reduce((acc, c) => acc + Number(c.jrAmount || c.amount || 0), 0);
    const pendingCommission = Math.max(0, earned - paidCommission);

    const recentActivity = [
      ...recentCalls.map((c) => ({
        id: c.id,
        channel: 'call',
        leadNumber: c.lead?.leadNumber || '',
        studentName: c.lead?.studentName || 'Parent',
        summary: c.outcome || 'Call logged',
        createdAt: c.createdAt,
      })),
      ...recentWa.map((w: any) => ({
        id: w.id,
        channel: 'whatsapp',
        leadNumber: w.lead?.leadNumber || '',
        studentName: w.lead?.studentName || 'Parent',
        summary: String(w.notes || w.status || 'WhatsApp message').slice(0, 80),
        createdAt: w.createdAt,
      })),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 8);

    const pendingInstallments = myAdmissions.flatMap((adm) =>
      (adm.installments || []).map((inst) => ({
        id: inst.id,
        admissionId: adm.id,
        admissionNumber: adm.admissionNumber,
        studentName: adm.studentName,
        schoolName: adm.school?.name || adm.schoolName,
        title: inst.title,
        amount: inst.amount,
        dueDate: inst.dueDate,
        status: inst.status,
      })),
    );

    const totalWeeklyComms = callLogsCount + waLogsCount;
    const weeklyCompliancePct =
      totalWeeklyComms + weeklyPendingQueueCount > 0
        ? Math.round((totalWeeklyComms / (totalWeeklyComms + weeklyPendingQueueCount)) * 100)
        : 100;

    return {
      totalLeads: myLeadsCount,
      todayNewLeads,
      todayFollowUps,
      overdueFollowUps,
      upcomingFollowUps,
      interestedParents,
      notInterestedParents,
      admissionInProgress,
      admissionConfirmed,
      todayCalls,
      waSentCount: waLogsCount,
      callsMadeCount: callLogsCount,
      earnedCommission: earned,
      pendingCommission,
      paidCommission,
      weeklyCompliancePct,
      pendingConfirmations,
      recentLeads,
      todayFollowUpList,
      overdueFollowUpList,
      pendingManagerApprovals,
      returnedLeads,
      upcomingVisits,
      recentActivity,
      admissionProgressList: myAdmissions.slice(0, 8),
      pendingInstallments: pendingInstallments.slice(0, 8),
    };
  }

  async getSrDashboard(user: any) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 86_400_000);
    const canon = normalizeCanonicalRole(user.role);

    const [rawTeamMembers, activeSessionRows] = await Promise.all([
      this.prisma.user.findMany({
        where:
          canon === 'SUPER_ADMIN'
            ? { role: { in: matchingRoleVariants('COUNSELLOR') as any }, deletedAt: null, isActive: true }
            : {
                deletedAt: null,
                id: { not: user.id },
                OR: [{ managerId: user.id }, { team: { managerId: user.id } }],
              },
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          lastLoginAt: true,
          lastLogoutAt: true,
          team: { select: { id: true, name: true } },
        },
      }),
      this.prisma.refreshTokenSession.findMany({
        where: { isActive: true, isRevoked: false, expiresAt: { gt: new Date() } },
        select: { userId: true },
      }),
    ]);
    const activeUserIds = new Set(activeSessionRows.map((s) => s.userId));
    const teamMembers = rawTeamMembers.map((m) => {
      const isOnline =
        activeUserIds.has(m.id) &&
        Boolean(m.lastLoginAt) &&
        (!m.lastLogoutAt ||
          new Date(m.lastLoginAt).getTime() >= new Date(m.lastLogoutAt).getTime());
      return {
        ...m,
        isOnline,
        presenceStatus: isOnline ? 'online' : 'offline',
      };
    });
    const memberIds = [user.id, ...teamMembers.map((m) => m.id)];
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

    const admScope: any =
      canon === 'SUPER_ADMIN'
        ? { deletedAt: null }
        : {
            deletedAt: null,
            OR: [{ managerId: user.id }, { counsellorId: { in: memberIds } }],
          };

    const [
      totalTeamLeads,
      newLeadsToday,
      pendingVerification,
      approvedLeads,
      returnedLeads,
      shortlistedLeads,
      followUpsToday,
      overdueFollowUps,
      pipelineByStatus,
      appsCount,
      activeApplications,
      admissionCompleted,
      pendingQueue,
      expiredCount,
      suspendedCount,
      duplicateLeadsCount,
      teamCommissions,
      highScoreLeads,
      expiryCycleAlerts,
      pendingConfirmations,
    ] = await Promise.all([
      this.prisma.lead.count({ where: leadScope }),
      this.prisma.lead.count({ where: { ...leadScope, createdAt: { gte: startOfToday, lt: endOfToday } } }),
      this.prisma.lead.count({ where: { ...leadScope, verificationStatus: 'PENDING_VERIFICATION' } }),
      this.prisma.lead.count({ where: { ...leadScope, verificationStatus: 'APPROVED' } }),
      this.prisma.lead.count({ where: { ...leadScope, verificationStatus: 'RETURNED' } }),
      this.prisma.lead.count({ where: { ...leadScope, status: 'shortlisted' } }),
      this.prisma.lead.count({ where: { ...leadScope, nextFollowUpDate: { gte: startOfToday, lt: endOfToday } } }),
      this.prisma.lead.count({
        where: {
          ...leadScope,
          nextFollowUpDate: { lt: startOfToday },
          status: { notIn: ['closed', 'merged', 'expired', 'disqualified', 'admission_done', 'LOST', 'MERGED'] },
        },
      }),
      this.prisma.lead.groupBy({ by: ['status'], where: leadScope, _count: { id: true } }),
      this.prisma.admission.count({ where: admScope }),
      this.prisma.admission.count({
        where: { ...admScope, stage: { notIn: ['admission_done', 'commission_received', 'closed'] } },
      }),
      this.prisma.admission.count({
        where: { ...admScope, stage: { in: ['admission_done', 'commission_received'] } },
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
      this.prisma.lead.count({ where: { ...leadScope, status: 'suspended' } }),
      this.prisma.lead.count({ where: { ...leadScope, status: { in: ['merged', 'MERGED'] } } }),
      this.prisma.commission.findMany({
        where: {
          deletedAt: null,
          isReversal: false,
          status: { notIn: ['reversed', 'REVERSED', 'CANCELLED'] },
          ...(canon === 'SUPER_ADMIN' ? {} : { beneficiaryId: { in: memberIds } }),
        },
        select: { amount: true, jrAmount: true, srAmount: true },
      }),
      this.prisma.lead.findMany({
        where: { ...leadScope, score: { gte: 71 } },
        select: { id: true, leadNumber: true, studentName: true, score: true, status: true, assignedCounsellor: { select: { fullName: true } } },
        orderBy: { score: 'desc' },
        take: 6,
      }),
      this.prisma.lead.findMany({
        where: { ...leadScope, expiryStatus: 'DAY_90_PENDING_REVIEW' },
        select: { id: true, leadNumber: true, studentName: true, updatedAt: true, status: true },
        orderBy: { updatedAt: 'asc' },
        take: 6,
      }),
      this.getPendingConfirmations(user),
    ]);

    const totalCommission = teamCommissions.reduce(
      (acc, c) => acc + Number(c.srAmount || c.amount || 0),
      0,
    );

    // Real per-counsellor Team Performance breakdown
    const teamPerformance = await Promise.all(
      teamMembers.map(async (m) => {
        const [assigned, newL, qualified, shortlisted, apps, adms, calls, wa] = await Promise.all([
          this.prisma.lead.count({ where: { assignedCounsellorId: m.id, deletedAt: null } }),
          this.prisma.lead.count({ where: { assignedCounsellorId: m.id, deletedAt: null, status: 'new' } }),
          this.prisma.lead.count({ where: { assignedCounsellorId: m.id, deletedAt: null, status: 'qualified' } }),
          this.prisma.lead.count({ where: { assignedCounsellorId: m.id, deletedAt: null, status: 'shortlisted' } }),
          this.prisma.admission.count({ where: { counsellorId: m.id, deletedAt: null } }),
          this.prisma.admission.count({ where: { counsellorId: m.id, deletedAt: null, stage: { in: ['admission_done', 'commission_received'] } } }),
          this.prisma.callLog.count({ where: { calledBy: m.id } }),
          this.prisma.whatsappLog.count({ where: { sentBy: m.id } }),
        ]);
        const conversionPct = assigned > 0 ? Math.round((adms / assigned) * 100) : 0;
        return {
          id: m.id,
          fullName: m.fullName,
          teamName: m.team?.name || '—',
          isOnline: m.isOnline,
          assignedLeads: assigned,
          newLeads: newL,
          qualifiedLeads: qualified,
          shortlistedLeads: shortlisted,
          applications: apps,
          admissionsCompleted: adms,
          conversionPct,
          callsCount: calls,
          whatsappCount: wa,
        };
      }),
    );

    return {
      totalLeads: totalTeamLeads,
      newLeadsToday,
      pendingVerification,
      approvedLeads,
      returnedLeads,
      shortlistedLeads,
      followUpsToday,
      overdueFollowUps,
      activeApplications,
      admissionsCount: admissionCompleted,
      admissionCompleted,
      teamSize: teamMembers.length,
      teamMembers,
      teamPerformance,
      applicationsCount: appsCount,
      expiredCount,
      suspendedCount,
      duplicateLeadsCount,
      totalCommission,
      highScoreLeads,
      expiryCycleAlerts,
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
      activeStaff,
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
          email: true,
          employeeId: true,
          phone: true,
          role: true,
          status: true,
          lastLoginAt: true,
          lastLogoutAt: true,
          manager: { select: { id: true, fullName: true } },
          team: {
            select: {
              id: true,
              name: true,
              teamCode: true,
              manager: { select: { id: true, fullName: true } },
              members: {
                where: { deletedAt: null },
                select: { id: true, fullName: true, role: true, email: true },
              },
            },
          },
          managedTeams: {
            select: {
              id: true,
              name: true,
              teamCode: true,
              members: {
                where: { deletedAt: null },
                select: { id: true, fullName: true, role: true, email: true },
              },
            },
          },
        },
        orderBy: { lastLoginAt: 'desc' },
        take: 25,
      }),
      this.prisma.refreshTokenSession.findMany({
        where: { isActive: true, isRevoked: false, expiresAt: { gt: new Date() } },
        select: { userId: true },
      }),
      this.prisma.lead.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: { id: true },
      }),
      this.getPendingConfirmations(user),
      // Active staff with aggregated counts for real top performers rankings
      this.prisma.user.findMany({
        where: {
          deletedAt: null,
          isActive: true,
          role: { in: ['SENIOR_MANAGER', 'COUNSELLOR', 'manager', 'jr_counsellor'] as any },
        },
        select: {
          id: true,
          fullName: true,
          role: true,
          team: { select: { name: true } },
          managedTeams: { select: { name: true } },
          _count: {
            select: {
              assignedLeads: { where: { deletedAt: null } },
              admissionsCreated: { where: { deletedAt: null } },
              admissionsManaged: { where: { deletedAt: null } },
            },
          },
          commissionsBeneficiary: {
            where: {
              deletedAt: null,
              isReversal: false,
              status: { notIn: ['reversed', 'REVERSED', 'CANCELLED'] },
            },
            select: { amount: true, jrAmount: true, srAmount: true },
          },
        },
      }),
    ]);

    const activeUserIds = new Set((activeSessions as any[]).map((s) => s.userId));
    const presenceUsers = liveUsers.map((u: any) => {
      const resolvedTeam = u.team || u.managedTeams?.[0] || null;
      const teamName = resolvedTeam?.name || null;
      const teamCode = resolvedTeam?.teamCode || null;
      const managerName = u.manager?.fullName || u.team?.manager?.fullName || null;
      const teamMembers = (resolvedTeam?.members || []).map((m: any) => ({
        id: m.id,
        fullName: m.fullName,
        role: m.role,
        email: m.email,
      }));
      const isOnline =
        activeUserIds.has(u.id) &&
        Boolean(u.lastLoginAt) &&
        (!u.lastLogoutAt ||
          new Date(u.lastLoginAt).getTime() >= new Date(u.lastLogoutAt).getTime());
      return {
        ...u,
        teamName,
        teamCode,
        managerName,
        teamMembers,
        isOnline,
        presenceStatus: isOnline ? 'online' : 'offline',
      };
    });

    const activeComms = commissions.filter(
      (c) => !c.isReversal && !['reversed', 'REVERSED', 'CANCELLED'].includes(c.status),
    );
    const totalRevenue = activeComms.reduce((acc, c) => acc + Number(c.amount || 0), 0);
    const realizedRevenue = activeComms
      .filter((c) => ['received', 'paid_out', 'PAID', 'APPROVED'].includes(c.status))
      .reduce((acc, c) => acc + Number(c.amount || 0), 0);
    const pendingPayments = Math.max(0, totalRevenue - realizedRevenue);
    const jrCommissionPending = activeComms
      .filter((c) => !['paid_out', 'PAID'].includes(c.status))
      .reduce((acc, c) => acc + Number(c.jrAmount || 0), 0);
    const srCommissionPending = activeComms
      .filter((c) => !['paid_out', 'PAID'].includes(c.status))
      .reduce((acc, c) => acc + Number(c.srAmount || 0), 0);
    const totalStaffShare = activeComms.reduce(
      (acc, c) => acc + Number(c.jrAmount || 0) + Number(c.srAmount || 0),
      0,
    );
    const reversedAmount = commissions
      .filter((c) => c.isReversal || ['reversed', 'REVERSED'].includes(c.status))
      .reduce((acc, c) => acc + Number(c.originalAmount || c.amount || 0), 0);
    const netProfit = Math.max(0, totalRevenue - totalStaffShare - reversedAmount);

    // Build real top performers data sorted dynamically
    const topLeads = (activeStaff || [])
      .map((u: any) => ({
        id: u.id,
        name: u.fullName,
        role: u.role,
        teamName: u.team?.name || u.managedTeams?.[0]?.name || '—',
        count: u._count?.assignedLeads || 0,
        label: `${u._count?.assignedLeads || 0} Leads`,
      }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const topAdmissions = (activeStaff || [])
      .map((u: any) => {
        const totalAdms = (u._count?.admissionsCreated || 0) + (u._count?.admissionsManaged || 0);
        return {
          id: u.id,
          name: u.fullName,
          role: u.role,
          teamName: u.team?.name || u.managedTeams?.[0]?.name || '—',
          count: totalAdms,
          label: `${totalAdms} Admissions`,
        };
      })
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const topCommission = (activeStaff || [])
      .map((u: any) => {
        const total = (u.commissionsBeneficiary || []).reduce(
          (acc, c) => acc + Number(c.amount || c.jrAmount || c.srAmount || 0),
          0,
        );
        return {
          id: u.id,
          name: u.fullName,
          role: u.role,
          teamName: u.team?.name || u.managedTeams?.[0]?.name || '—',
          count: total,
          label: `₹${total.toLocaleString('en-IN')}`,
        };
      })
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalLeads,
      totalActiveUsers: liveUsers.length,
      totalSchools,
      totalAdmissions,
      managersCount,
      counsellorsCount,
      pendingVerifications,
      activeSessions: activeUserIds.size,
      totalCommission: totalRevenue,
      realizedCommission: realizedRevenue,
      pendingPayments,
      jrCommissionPending,
      srCommissionPending,
      netProfit,
      reversedCommission: reversedAmount,
      pipelineBreakdown: pipelineGrouped.map((p) => ({ status: p.status, count: p._count.id })),
      presenceMonitor: presenceUsers,
      pendingConfirmations,
      topPerformers: {
        leads: topLeads,
        admissions: topAdmissions,
        commission: topCommission,
      },
    };
  }
}
