import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Role, CommissionStatus, LeadStatus, VerificationStatus, Priority } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class CrmCoreService {
  constructor(private prisma: PrismaService) {}

  private mapRoleToFrontend(role: Role): 'admin' | 'manager' | 'counsellor' {
    if (role === Role.SUPER_ADMIN) return 'admin';
    if (role === Role.SENIOR_MANAGER) return 'manager';
    return 'counsellor';
  }

  private mapFrontendToRole(roleStr?: string): Role {
    const r = (roleStr || '').toLowerCase();
    if (r === 'admin' || r === 'super_admin') return Role.SUPER_ADMIN;
    if (r === 'manager' || r === 'senior_manager') return Role.SENIOR_MANAGER;
    return Role.COUNSELLOR;
  }

  // ============================================================================
  // USERS MANAGEMENT
  // ============================================================================
  async getUsers() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        team: true,
        managedTeams: true,
      },
    });

    const formatted = users.map((u) => {
      const managed = u.managedTeams?.[0];
      return {
        _id: u.id,
        id: u.id,
        employeeId: u.employeeId,
        name: u.fullName,
        fullName: u.fullName,
        email: u.email,
        mobile: u.phone || '9876543210',
        phone: u.phone || '9876543210',
        role: this.mapRoleToFrontend(u.role),
        backendRole: u.role,
        status: u.status || (u.isActive ? 'Active' : 'Suspended'),
        isActive: u.isActive,
        twoFactorEnabled: u.isTwoFactorEnabled,
        teamId: u.team
          ? { _id: u.team.id, id: u.team.id, teamName: u.team.name, name: u.team.name }
          : managed
          ? { _id: managed.id, id: managed.id, teamName: managed.name, name: managed.name }
          : null,
        createdAt: u.createdAt,
      };
    });

    return {
      success: true,
      users: formatted,
      data: formatted,
    };
  }

  async createUser(body: any, actor?: any) {
    const existing = await this.prisma.user.findUnique({
      where: { email: body.email.toLowerCase().trim() },
    });
    if (existing) {
      throw new BadRequestException('A user with this email already exists');
    }

    const role = this.mapFrontendToRole(body.role);
    const count = await this.prisma.user.count();
    const prefix = role === Role.SUPER_ADMIN ? 'ADM' : role === Role.SENIOR_MANAGER ? 'MGR' : 'COU';
    const employeeId = body.employeeId || `EMP-${prefix}-${String(count + 1).padStart(3, '0')}`;
    const rawPassword = body.password || 'Password@123';
    const passwordHash = await bcrypt.hash(rawPassword, 12);

    let teamId = body.teamId || null;
    if (teamId) {
      const team = await this.prisma.team.findFirst({
        where: { OR: [{ id: teamId }, { teamCode: teamId }] },
      });
      teamId = team ? team.id : null;
    }

    const user = await this.prisma.user.create({
      data: {
        employeeId,
        email: body.email.toLowerCase().trim(),
        passwordHash,
        fullName: body.name || body.fullName || 'New Employee',
        phone: body.mobile || body.phone || '9876543210',
        role,
        status: 'Active',
        isActive: true,
        teamId: role === Role.COUNSELLOR ? teamId : null,
      },
      include: { team: true },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: actor?.id || null,
        userName: actor?.fullName || 'Super Admin',
        userRole: actor?.role || 'SUPER_ADMIN',
        action: 'CREATE_USER',
        module: 'Users',
        entity: 'User',
        entityId: user.id,
        details: { employeeId: user.employeeId, email: user.email, role: user.role },
      },
    });

    return {
      success: true,
      message: `Employee ${user.fullName} (${user.employeeId}) created successfully!`,
      user: {
        _id: user.id,
        id: user.id,
        employeeId: user.employeeId,
        name: user.fullName,
        email: user.email,
        role: this.mapRoleToFrontend(user.role),
        status: user.status,
      },
    };
  }

  async toggleUserStatus(id: string, actor?: any) {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ id }, { employeeId: id }] },
    });
    if (!user) throw new NotFoundException('User not found');

    const newActive = !user.isActive;
    const newStatus = newActive ? 'Active' : 'Suspended';

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { isActive: newActive, status: newStatus },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: actor?.id || null,
        userName: actor?.fullName || 'Super Admin',
        userRole: actor?.role || 'SUPER_ADMIN',
        action: 'TOGGLE_USER_STATUS',
        module: 'Users',
        entity: 'User',
        entityId: user.id,
        details: { employeeId: user.employeeId, newStatus },
      },
    });

    return {
      success: true,
      message: `User ${updated.fullName} status changed to ${newStatus}`,
      user: updated,
    };
  }

  async adminResetPassword(id: string, newPassword: string, actor?: any) {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ id }, { employeeId: id }] },
    });
    if (!user) throw new NotFoundException('User not found');

    const passwordHash = await bcrypt.hash(newPassword || 'Password@123', 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: actor?.id || null,
        userName: actor?.fullName || 'Super Admin',
        userRole: actor?.role || 'SUPER_ADMIN',
        action: 'ADMIN_RESET_PASSWORD',
        module: 'Users',
        entity: 'User',
        entityId: user.id,
        details: { employeeId: user.employeeId },
      },
    });

    return {
      success: true,
      message: `Password reset for ${user.fullName} (${user.employeeId})`,
    };
  }

  // ============================================================================
  // TEAMS MANAGEMENT
  // ============================================================================
  async getTeams() {
    const teams = await this.prisma.team.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        manager: true,
        members: {
          include: {
            assignedLeads: true,
            admissions: true,
            commissions: true,
          },
        },
      },
    });

    const formatted = teams.map((t) => {
      const totalLeads = t.members.reduce((sum, c) => sum + c.assignedLeads.length, 0);
      const totalAdmissions = t.members.reduce((sum, c) => sum + c.admissions.length, 0);
      const totalCommission = t.members.reduce(
        (sum, c) =>
          sum +
          c.commissions
            .filter((cm) => cm.status !== CommissionStatus.REVERSED && cm.amount > 0)
            .reduce((s, cm) => s + cm.amount, 0),
        0,
      );

      return {
        _id: t.id,
        id: t.id,
        teamId: t.teamCode,
        teamName: t.name,
        name: t.name,
        region: t.description || 'Dehradun & Mussoorie',
        targetAdmissions: t.targetAdmissions,
        status: t.status || 'Active',
        totalLeads,
        totalAdmissions,
        totalCommission,
        managerId: t.manager
          ? {
              _id: t.manager.id,
              id: t.manager.id,
              name: t.manager.fullName,
              fullName: t.manager.fullName,
              email: t.manager.email,
            }
          : null,
        counsellors: t.members.map((c) => ({
          _id: c.id,
          id: c.id,
          name: c.fullName,
          fullName: c.fullName,
          email: c.email,
          employeeId: c.employeeId,
        })),
      };
    });

    return {
      success: true,
      teams: formatted,
      data: formatted,
    };
  }

  async createTeam(body: any, actor?: any) {
    const count = await this.prisma.team.count();
    const teamCode = body.teamId || `TEAM-UK-${String(count + 1).padStart(2, '0')}`;

    let managerId = body.managerId;
    if (!managerId) {
      const mgr = await this.prisma.user.findFirst({ where: { role: Role.SENIOR_MANAGER } });
      managerId = mgr?.id;
    }

    const team = await this.prisma.team.create({
      data: {
        teamCode,
        name: body.teamName || body.name || `Uttarakhand Team ${count + 1}`,
        description: body.region || body.description || 'Dehradun & Mussoorie',
        targetAdmissions: Number(body.targetAdmissions || 50),
        status: 'Active',
        managerId,
      },
      include: { manager: true, members: true },
    });

    if (Array.isArray(body.counsellorIds) && body.counsellorIds.length > 0) {
      await this.prisma.user.updateMany({
        where: { id: { in: body.counsellorIds } },
        data: { teamId: team.id },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        userId: actor?.id || null,
        userName: actor?.fullName || 'Super Admin',
        userRole: actor?.role || 'SUPER_ADMIN',
        action: 'CREATE_TEAM',
        module: 'Teams',
        entity: 'Team',
        entityId: team.id,
        details: { teamCode, name: team.name },
      },
    });

    return {
      success: true,
      message: `Team "${team.name}" created successfully!`,
      team,
    };
  }

  async updateTeam(id: string, body: any) {
    const team = await this.prisma.team.findFirst({
      where: { OR: [{ id }, { teamCode: id }] },
    });
    if (!team) throw new NotFoundException('Team not found');

    const updated = await this.prisma.team.update({
      where: { id: team.id },
      data: {
        name: body.teamName || body.name || team.name,
        description: body.region || body.description || team.description,
        targetAdmissions: body.targetAdmissions
          ? Number(body.targetAdmissions)
          : team.targetAdmissions,
      },
    });

    return {
      success: true,
      message: 'Team updated successfully',
      team: updated,
    };
  }

  async toggleTeamStatus(id: string) {
    const team = await this.prisma.team.findFirst({
      where: { OR: [{ id }, { teamCode: id }] },
    });
    if (!team) throw new NotFoundException('Team not found');

    const newStatus = team.status === 'Active' ? 'Inactive' : 'Active';
    const updated = await this.prisma.team.update({
      where: { id: team.id },
      data: { status: newStatus },
    });

    return {
      success: true,
      message: `Team status changed to ${newStatus}`,
      team: updated,
    };
  }

  // ============================================================================
  // FOLLOW-UPS & TASKS
  // ============================================================================
  async getFollowUps(user?: any) {
    const where: any = {};
    if (user?.role === Role.COUNSELLOR) {
      where.counsellorId = user.id;
    }

    const followUps = await this.prisma.followUp.findMany({
      where,
      orderBy: { scheduledAt: 'desc' },
      include: {
        lead: {
          include: {
            student: true,
            parent: true,
          },
        },
        counsellor: true,
      },
    });

    const formatted = followUps.map((f) => ({
      _id: f.id,
      id: f.id,
      followUpId: f.followUpCode || f.id.slice(0, 10).toUpperCase(),
      callOutcome: f.outcome || 'Connected - Interested',
      status: f.status,
      scheduledDate: f.scheduledAt,
      nextFollowUpDate: f.scheduledAt,
      notes: f.notes,
      consentRecorded: f.dpdpConsentRecorded,
      leadId: f.lead
        ? {
            _id: f.lead.id,
            id: f.lead.id,
            leadId: f.lead.leadNumber,
            studentName: f.lead.studentName,
            studentId: {
              name: f.lead.student?.name || f.lead.studentName,
              admissionClass: f.lead.student?.admissionClass || f.lead.applyingForGrade,
            },
            parentId: {
              name: f.lead.parent?.name || f.lead.parentName,
              mobile: f.lead.parent?.mobile || f.lead.parentPhone,
            },
          }
        : null,
      counsellorId: f.counsellor
        ? {
            _id: f.counsellor.id,
            id: f.counsellor.id,
            name: f.counsellor.fullName,
          }
        : null,
    }));

    return {
      success: true,
      followUps: formatted,
      data: formatted,
    };
  }

  async createFollowUp(body: any, user?: any) {
    const lead = await this.prisma.lead.findFirst({
      where: { OR: [{ id: body.leadId }, { leadNumber: body.leadId }] },
    });
    if (!lead) throw new NotFoundException('Lead not found');

    const count = await this.prisma.followUp.count();
    const followUpCode = `FUP-2026-${String(count + 1).padStart(3, '0')}`;
    const nextDate = body.nextFollowUpDate
      ? new Date(body.nextFollowUpDate)
      : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    const fup = await this.prisma.followUp.create({
      data: {
        followUpCode,
        leadId: lead.id,
        counsellorId: user?.id || lead.assignedCounsellorId!,
        outcome: body.callOutcome || 'Connected - Interested',
        scheduledAt: nextDate,
        completedAt: new Date(),
        notes: body.notes || 'Parent counselled regarding Uttarakhand boarding schools.',
        status: 'Completed',
        dpdpConsentRecorded: body.consentRecorded !== false,
      },
      include: { lead: true, counsellor: true },
    });

    const remarksJson = Array.isArray(lead.remarksJson) ? [...(lead.remarksJson as any[])] : [];
    remarksJson.push({
      author: user?.fullName || 'Counsellor',
      role: user?.role || 'counsellor',
      note: `[Follow-up: ${fup.outcome}] ${fup.notes}`,
      createdAt: new Date().toISOString(),
    });

    await this.prisma.lead.update({
      where: { id: lead.id },
      data: {
        remarksJson,
        nextFollowUpDate: nextDate,
        status: lead.status === LeadStatus.NEW_LEAD ? LeadStatus.CONTACTED : lead.status,
      },
    });

    return {
      success: true,
      message: 'Follow-up call outcome logged & next reminder scheduled!',
      followUp: fup,
    };
  }

  async getTasks(user?: any) {
    const where: any = {};
    if (user?.role === Role.COUNSELLOR) {
      where.assignedToId = user.id;
    }
    const tasks = await this.prisma.task.findMany({
      where,
      orderBy: { dueDate: 'asc' },
      include: { assignedTo: true, lead: true },
    });
    return { success: true, tasks };
  }

  async createTask(body: any, user?: any) {
    const task = await this.prisma.task.create({
      data: {
        title: body.title,
        description: body.description || '',
        priority: Priority.HIGH,
        status: 'PENDING',
        dueDate: body.dueDate ? new Date(body.dueDate) : new Date(Date.now() + 86400000),
        assignedToId: body.assignedToId || user?.id,
        leadId: body.leadId || null,
      },
    });
    return { success: true, task };
  }

  // ============================================================================
  // DASHBOARD STATS & REPORTS
  // ============================================================================
  async getDashboardStats(user: any, previewRole?: string) {
    const effectiveRole = previewRole ? this.mapFrontendToRole(previewRole) : user.role;

    const [
      allLeads,
      allAdmissions,
      allCommissions,
      allUsers,
      allTeams,
      allFollowUps,
      allSchools,
    ] = await Promise.all([
      this.prisma.lead.findMany({ include: { preferredSchool: true, assignedCounsellor: true } }),
      this.prisma.admission.findMany({ include: { school: true, lead: true } }),
      this.prisma.commission.findMany(),
      this.prisma.user.findMany(),
      this.prisma.team.findMany(),
      this.prisma.followUp.findMany(),
      this.prisma.school.findMany(),
    ]);

    const confirmedAdmissions = allAdmissions.filter((a) => a.status !== 'Cancelled');
    const totalRevenue = confirmedAdmissions.reduce((s, a) => s + (a.feeAgreed || 0), 0);
    const totalCommissionLiability = allCommissions
      .filter((c) => c.amount > 0 && c.status !== CommissionStatus.REVERSED)
      .reduce((s, c) => s + c.amount, 0);
    const paidCommission = allCommissions
      .filter((c) => c.amount > 0 && c.status === CommissionStatus.PAID)
      .reduce((s, c) => s + c.amount, 0);
    const pendingCommissionPayout = allCommissions
      .filter(
        (c) =>
          c.amount > 0 &&
          (c.status === CommissionStatus.PENDING_APPROVAL ||
            c.status === CommissionStatus.PENDING ||
            c.status === CommissionStatus.APPROVED ||
            c.status === CommissionStatus.PAYABLE),
      )
      .reduce((s, c) => s + c.amount, 0);

    const schoolDistribution: Record<string, number> = {};
    for (const s of allSchools) {
      schoolDistribution[s.name] = 0;
    }
    for (const l of allLeads) {
      const sName = l.preferredSchool?.name || 'The Doon School';
      schoolDistribution[sName] = (schoolDistribution[sName] || 0) + 1;
    }

    if (effectiveRole === Role.SUPER_ADMIN) {
      return {
        success: true,
        role: 'admin',
        stats: {
          totalUsers: allUsers.length,
          activeTeams: allTeams.filter((t) => t.status === 'Active').length,
          totalLeads: allLeads.length,
          verifiedLeads: allLeads.filter((l) => l.verificationStatus === VerificationStatus.APPROVED).length,
          pendingVerification: allLeads.filter(
            (l) => l.verificationStatus === VerificationStatus.PENDING_VERIFICATION,
          ).length,
          confirmedAdmissions: confirmedAdmissions.length,
          totalRevenue,
          totalCommissionLiability,
          paidCommission,
          pendingCommissionPayout,
          conversionRate: allLeads.length
            ? `${Math.round((confirmedAdmissions.length / allLeads.length) * 100)}%`
            : '0%',
          schoolDistribution,
        },
      };
    }

    if (effectiveRole === Role.SENIOR_MANAGER) {
      const managerSharing = allCommissions
        .filter(
          (c) =>
            c.beneficiaryRole === Role.SENIOR_MANAGER &&
            c.amount > 0 &&
            c.status !== CommissionStatus.REVERSED,
        )
        .reduce((s, c) => s + c.amount, 0);
      const teamCommission = allCommissions
        .filter(
          (c) =>
            c.beneficiaryRole === Role.COUNSELLOR &&
            c.amount > 0 &&
            c.status !== CommissionStatus.REVERSED,
        )
        .reduce((s, c) => s + c.amount, 0);

      return {
        success: true,
        role: 'manager',
        stats: {
          teamSize: allUsers.filter((u) => u.role === Role.COUNSELLOR).length,
          teamLeads: allLeads.length,
          pendingVerification: allLeads.filter(
            (l) => l.verificationStatus === VerificationStatus.PENDING_VERIFICATION,
          ).length,
          verifiedLeads: allLeads.filter((l) => l.verificationStatus === VerificationStatus.APPROVED).length,
          returnedLeads: allLeads.filter((l) => l.verificationStatus === VerificationStatus.RETURNED).length,
          teamAdmissions: confirmedAdmissions.length,
          teamCommission,
          managerSharing,
          schoolDistribution,
        },
      };
    }

    const counsellorLeads =
      user.role === Role.COUNSELLOR
        ? allLeads.filter((l) => l.assignedCounsellorId === user.id)
        : allLeads;
    const counsellorAdmissions =
      user.role === Role.COUNSELLOR
        ? confirmedAdmissions.filter((a) => a.counsellorId === user.id)
        : confirmedAdmissions;
    const counsellorCommissions =
      user.role === Role.COUNSELLOR
        ? allCommissions.filter(
            (c) =>
              c.beneficiaryId === user.id &&
              c.amount > 0 &&
              c.status !== CommissionStatus.REVERSED,
          )
        : allCommissions.filter((c) => c.beneficiaryRole === Role.COUNSELLOR && c.amount > 0);

    const earnedCommission = counsellorCommissions.reduce((s, c) => s + c.amount, 0);
    const paidCounsellorComm = counsellorCommissions
      .filter((c) => c.status === CommissionStatus.PAID)
      .reduce((s, c) => s + c.amount, 0);
    const pendingCounsellorComm = earnedCommission - paidCounsellorComm;

    return {
      success: true,
      role: 'counsellor',
      stats: {
        assignedLeads: counsellorLeads.length,
        inProgressLeads: counsellorLeads.filter((l) => l.status === LeadStatus.CONTACTED).length,
        pendingVerification: counsellorLeads.filter(
          (l) => l.verificationStatus === VerificationStatus.PENDING_VERIFICATION,
        ).length,
        todayFollowUps: allFollowUps.length,
        confirmedAdmissions: counsellorAdmissions.length,
        earnedCommission,
        paidCommission: paidCounsellorComm,
        pendingCommission: pendingCounsellorComm,
        schoolDistribution,
      },
    };
  }

  // ============================================================================
  // AI INTELLIGENCE ENGINE
  // ============================================================================
  async recommendSchools(body: any) {
    const budget = Number(body.budget || 600000);
    const preferredCity = body.city || 'Any';
    const preferredBoard = body.board || 'Any';
    const gender = body.gender || 'Any';

    const schools = await this.prisma.school.findMany({ orderBy: { rank: 'asc' } });

    const scored = schools.map((s) => {
      let matchScore = 72;
      const reasons: string[] = [];

      if (budget >= s.minFeeAnnual && budget <= s.maxFeeAnnual * 1.15) {
        matchScore += 14;
        reasons.push(`Fits ₹${(budget / 100000).toFixed(1)}L annual budget`);
      } else if (budget >= s.minFeeAnnual) {
        matchScore += 8;
        reasons.push('Comfortably within parent financial capacity');
      }

      if (preferredCity === 'Any' || s.city.toLowerCase() === preferredCity.toLowerCase()) {
        matchScore += 8;
        reasons.push(`Located in preferred hub (${s.city})`);
      }

      if (preferredBoard === 'Any' || s.board.toLowerCase().includes(preferredBoard.toLowerCase())) {
        matchScore += 6;
        reasons.push(`Offers ${s.board} curriculum`);
      }

      const gType = s.genderType || s.type;
      if (
        gender === 'Any' ||
        gType.toLowerCase() === gender.toLowerCase() ||
        gType.toLowerCase().includes('co')
      ) {
        matchScore += 5;
        reasons.push(`${gType} residential campus`);
      }

      matchScore = Math.min(99, matchScore);

      return {
        _id: s.id,
        schoolId: s.schoolCode,
        name: s.name,
        city: s.city,
        board: s.board,
        genderType: gType,
        feesDisplay:
          s.feesDisplay ||
          `₹${(s.minFeeAnnual / 100000).toFixed(1)}L - ₹${(s.maxFeeAnnual / 100000).toFixed(1)}L / yr`,
        hostelQuality: s.hostelQuality,
        defaultCommission: s.defaultCommission,
        matchScore,
        reasons,
      };
    });

    scored.sort((a, b) => b.matchScore - a.matchScore);

    return {
      success: true,
      recommendations: scored.slice(0, 4),
    };
  }

  async generateMessage(body: any) {
    const parentName = body.parentName || 'Respected Parent';
    const studentName = body.studentName || 'your child';
    const schoolName = body.schoolName || 'The Doon School, Dehradun';
    const channel = body.channel || 'WhatsApp';
    const tone = body.tone || 'Warm & Professional';

    const message =
      channel === 'WhatsApp'
        ? `Namaste ${parentName} 🙏,\n\nGreetings from *Uttarakhand Boarding Schools Admission Desk*!\n\nFollowing our counselling session for *${studentName}*, we have shortlisted *${schoolName}* based on your academic and residential preferences.\n\n✅ *Next Steps:*\n1. Complete Online Registration Dossier\n2. Schedule Campus / Virtual Tour in Uttarakhand\n3. Entrance Assessment & Scholarship Review\n\nWould Saturday at 11:00 AM work for a 10-minute call with our Senior Admission Advisor?\n\nWarm regards,\n*BoardingEdu Counselling Team*\n📍 Dehradun • Mussoorie • Nainital`
        : `Subject: Official Residential School Shortlist & Admission Dossier for ${studentName} – ${schoolName}\n\nDear ${parentName},\n\nThank you for speaking with the Uttarakhand Boarding Schools Counselling Desk regarding ${studentName}'s upcoming residential admission for the 2026-27 academic session.\n\nBased on our evaluation (${tone}), we strongly recommend ${schoolName}. Attached to this email is the complete fee structure, pastoral care handbook, and scholarship eligibility guide.\n\nPlease reply with a convenient time for a campus visit or virtual interaction.\n\nWarm regards,\nUttarakhand Boarding Schools Admission Cell`;

    return {
      success: true,
      generatedMessage: message,
      message,
    };
  }

  // ============================================================================
  // COMMUNICATIONS (WHATSAPP & EMAIL)
  // ============================================================================
  async getCommunications() {
    const logs = await this.prisma.communicationLog.findMany({
      orderBy: { sentAt: 'desc' },
      take: 50,
    });
    return {
      success: true,
      logs: logs.map((l) => ({
        ...l,
        _id: l.id,
        recipientContact: l.recipient,
        message: l.content,
        sentBy: l.senderName,
        createdAt: l.sentAt,
      })),
      communications: logs,
    };
  }

  async sendCommunication(channel: 'WhatsApp' | 'Email', body: any, user?: any) {
    const log = await this.prisma.communicationLog.create({
      data: {
        channel,
        recipientName: body.recipientName || body.parentName || 'Parent',
        recipient: body.recipientMobile || body.recipientContact || body.mobile || '9811122233',
        templateName: body.templateName || 'brochure_followup_uk',
        content: body.message || 'Greetings from Uttarakhand Boarding Schools CRM.',
        status: 'Delivered',
        senderName: user?.fullName || user?.name || 'Counsellor',
      },
    });

    return {
      success: true,
      message: `${channel} message dispatched & logged!`,
      log: {
        ...log,
        _id: log.id,
        recipientContact: log.recipient,
        message: log.content,
      },
    };
  }

  // ============================================================================
  // NOTIFICATIONS, SETTINGS, ROLES & AUDIT LOGS
  // ============================================================================
  async getNotifications(userId: string) {
    const notifications = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });
    return {
      success: true,
      notifications: notifications.map((n) => ({
        ...n,
        _id: n.id,
        read: n.isRead,
      })),
    };
  }

  async markNotificationRead(id: string) {
    await this.prisma.notification.updateMany({
      where: { id },
      data: { isRead: true },
    });
    return { success: true };
  }

  async getSettings() {
    let settingRecord = await this.prisma.systemSetting.findUnique({
      where: { key: 'GLOBAL_CRM_SETTINGS' },
    });
    const defaultVal = {
      leadExpiryDays: 90,
      autoFollowUpDays: 3,
      duplicateLockDays: 60,
      dpdpConsentMandatory: true,
      whatsappAutomationEnabled: true,
      defaultCommissionPool: 10000,
    };
    if (!settingRecord) {
      settingRecord = await this.prisma.systemSetting.create({
        data: {
          key: 'GLOBAL_CRM_SETTINGS',
          value: defaultVal,
          category: 'lifecycle',
        },
      });
    }
    return {
      success: true,
      settings: (settingRecord.value as any) || defaultVal,
    };
  }

  async updateSettings(body: any, user?: any) {
    const val = {
      leadExpiryDays: Number(body.leadExpiryDays || 90),
      autoFollowUpDays: Number(body.autoFollowUpDays || 3),
      duplicateLockDays: Number(body.duplicateLockDays || 60),
      dpdpConsentMandatory: body.dpdpConsentMandatory !== false,
      whatsappAutomationEnabled: body.whatsappAutomationEnabled !== false,
      defaultCommissionPool: Number(body.defaultCommissionPool || 10000),
    };

    const settings = await this.prisma.systemSetting.upsert({
      where: { key: 'GLOBAL_CRM_SETTINGS' },
      update: { value: val },
      create: {
        key: 'GLOBAL_CRM_SETTINGS',
        value: val,
        category: 'lifecycle',
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user?.id || null,
        userName: user?.fullName || 'Super Admin',
        userRole: user?.role || 'SUPER_ADMIN',
        action: 'UPDATE_SYSTEM_SETTINGS',
        module: 'Settings',
        entity: 'SystemSetting',
        entityId: settings.id,
        details: val,
      },
    });

    return {
      success: true,
      message: 'System Lifecycle & DPDP Compliance settings saved!',
      settings: val,
    };
  }

  async getAuditLogs() {
    const logs = await this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 60,
      include: {
        user: { select: { fullName: true, employeeId: true, role: true } },
      },
    });
    return {
      success: true,
      auditLogs: logs.map((l) => ({
        ...l,
        _id: l.id,
        timestamp: l.createdAt,
        actorName: l.user?.fullName || l.userName || 'System',
        actorRole: l.user?.role || l.userRole || 'SYSTEM',
        entityType: l.entity,
      })),
    };
  }

  async getRolesAndPermissions() {
    const roles = await this.prisma.roleDefinition.findMany({
      include: { permissions: true },
    });
    return {
      success: true,
      roles,
    };
  }
}
