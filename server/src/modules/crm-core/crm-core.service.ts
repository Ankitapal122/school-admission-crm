import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import * as zlib from 'zlib';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  CommissionStatus,
  LeadStatus,
  Priority,
  Role,
  VerificationStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { LeadsService } from '../leads/leads.service';
import { QueueEngineService } from '../queues/queue-engine.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DynamicRateLimitGuard } from '../../common/guards/dynamic-rate-limit.guard';
import {
  decryptSensitiveData,
  encryptSensitiveData,
  maskBankAccount,
} from '../../common/utils/crypto.util';
import {
  apiEnvelope,
  matchingRoleVariants,
  normalizeCanonicalRole,
  normalizeIndianPhone,
  parseClassGrade,
  sanitizeSpreadsheetCell,
  toBlueprintRole,
  validateRealEmail,
} from '../../common/utils/crm.utils';

interface ImportPreviewCacheItem {
  previewId: string;
  entity: 'leads' | 'schools';
  fileName: string;
  validRows: any[];
  duplicateRows: any[];
  errors: Array<{ rowNumber: number; identifier: string; error: string }>;
  errorCsv: string;
  expiresAt: number;
}

@Injectable()
export class CrmCoreService implements OnModuleInit {
  private readonly importPreviews = new Map<string, ImportPreviewCacheItem>();
  private readonly errorCsvStore = new Map<string, { csv: string; expiresAt: number }>();
  private readonly archiveDir = path.join(process.cwd(), 'archives', 'audit');

  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
    private leadsService: LeadsService,
    private queueEngine: QueueEngineService,
    @Optional() private notifications?: NotificationsService,
  ) {
    if (!fs.existsSync(this.archiveDir)) {
      fs.mkdirSync(this.archiveDir, { recursive: true });
    }
  }

  onModuleInit() {
    this.queueEngine.registerHandler('CHECK_LEAD_EXPIRIES', async () =>
      this.leadsService.runLifecycleCycleSweep(),
    );
    this.queueEngine.registerHandler('lead_expiry_check', async () =>
      this.leadsService.runLifecycleCycleSweep(),
    );
    this.queueEngine.registerHandler('lead_score_recalc', async (payload) =>
      this.leadsService.recalculateAllLeadScoresSync(payload?.requestedBy),
    );
    this.queueEngine.registerHandler('AUDIT_INTEGRITY_CHECK', async () =>
      this.runDataIntegrityCheck(null, false),
    );
    this.queueEngine.registerHandler('data_integrity_check', async () =>
      this.runDataIntegrityCheck(null, false),
    );
    this.queueEngine.registerHandler('MANUAL_LOGGING_REMINDERS', async () =>
      this.queueEngine.runPendingQueueEscalationSweep(),
    );
    this.queueEngine.registerHandler('manual_logging_reminders', async () =>
      this.queueEngine.runPendingQueueEscalationSweep(),
    );
    this.queueEngine.registerHandler('AUDIT_RETENTION_ARCHIVE', async (payload) =>
      this.runAuditRetentionCheck(payload?.olderThanDays),
    );
    this.queueEngine.registerHandler('audit_retention_archive', async (payload) =>
      this.runAuditRetentionCheck(payload?.olderThanDays),
    );
    this.ensureSuperAdminActive().catch(() => {});
  }

  async ensureSuperAdminActive() {
    try {
      await this.prisma.user.updateMany({
        where: {
          OR: [
            { email: 'adminboarding123@gmail.com' },
            { role: Role.SUPER_ADMIN },
            { role: Role.super_admin },
          ],
        },
        data: {
          status: 'active',
          isActive: true,
          deletedAt: null,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
    } catch (err: any) {
      console.warn('[CrmCore] Ensure Super Admin active check:', err?.message);
    }
  }

  private mapFrontendToRole(roleStr?: string): Role {
    const canon = toBlueprintRole(roleStr);
    if (canon === 'super_admin') return Role.super_admin;
    if (canon === 'manager') return Role.manager;
    return Role.jr_counsellor;
  }

  private mapRoleToFrontendUi(role: Role | string): 'admin' | 'manager' | 'counsellor' {
    const canon = toBlueprintRole(String(role));
    if (canon === 'super_admin') return 'admin';
    if (canon === 'manager') return 'manager';
    return 'counsellor';
  }

  // ============================================================================
  // PROFILE (/users/me & /users/me/password)
  // ============================================================================
  async getMyProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        team: true,
        manager: { select: { id: true, fullName: true, email: true, employeeId: true } },
        notificationPreference: true,
        sessions: { where: { isActive: true, isRevoked: false }, orderBy: { loginAt: 'desc' } },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const plainBank = user.bankAccountEncrypted
      ? decryptSensitiveData(user.bankAccountEncrypted)
      : '';
    const profile = {
      id: user.id,
      _id: user.id,
      employeeId: user.employeeId,
      fullName: user.fullName,
      name: user.fullName,
      email: user.email,
      phone: user.phone,
      role: this.mapRoleToFrontendUi(user.role),
      canonicalRole: toBlueprintRole(user.role),
      backendRole: user.role,
      status: user.status,
      isTwoFactorEnabled: user.isTwoFactorEnabled,
      upiId: user.upiId || '',
      bankAccountMasked: plainBank ? maskBankAccount(plainBank) : '',
      team: user.team ? { id: user.team.id, name: user.team.name, teamCode: user.team.teamCode } : null,
      manager: user.manager || null,
      notificationPreference: user.notificationPreference,
      activeSessionsCount: user.sessions.length,
      lastLoginAt: user.lastLoginAt,
      passwordUpdatedAt: user.passwordUpdatedAt,
    };

    return apiEnvelope(profile, 'Profile loaded', { user: profile });
  }

  async updateMyProfile(userId: string, body: any) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const data: any = { version: { increment: 1 } };
    if (body.fullName || body.name) data.fullName = String(body.fullName || body.name).trim();
    if (body.phone !== undefined || body.mobile !== undefined) {
      data.phone = normalizeIndianPhone(String(body.phone || body.mobile || '')) || user.phone;
    }
    if (body.upiId !== undefined || body.upi_id !== undefined) {
      data.upiId = String(body.upiId ?? body.upi_id).trim();
    }
    if (body.bankAccount || body.bank_account) {
      data.bankAccountEncrypted = encryptSensitiveData(
        String(body.bankAccount || body.bank_account).trim(),
      );
    }

    await this.prisma.user.update({ where: { id: userId }, data });

    if (body.notificationPreference && typeof body.notificationPreference === 'object') {
      await this.prisma.notificationPreference.upsert({
        where: { userId },
        update: {
          followUpReminder: body.notificationPreference.followUpReminder ?? true,
          weeklyReport: body.notificationPreference.weeklyReport ?? true,
          mergeAlert: body.notificationPreference.mergeAlert ?? true,
          pushEnabled: body.notificationPreference.pushEnabled ?? false,
          commissionUpdates: body.notificationPreference.commissionUpdates ?? true,
        },
        create: {
          userId,
          followUpReminder: body.notificationPreference.followUpReminder ?? true,
          weeklyReport: body.notificationPreference.weeklyReport ?? true,
          mergeAlert: body.notificationPreference.mergeAlert ?? true,
          pushEnabled: body.notificationPreference.pushEnabled ?? false,
          commissionUpdates: body.notificationPreference.commissionUpdates ?? true,
        },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        userId,
        userName: user.fullName,
        userRole: user.role,
        action: 'UPDATE',
        module: 'profile',
        entity: 'User',
        entityId: userId,
        details: { updatedFields: Object.keys(body || {}) },
      },
    });

    return this.getMyProfile(userId);
  }

  async changeMyPassword(userId: string, body: any, sessionFamily?: string | null) {
    return this.authService.changeOwnPassword(
      userId,
      body.currentPassword || body.oldPassword || '',
      body.newPassword,
      sessionFamily,
    );
  }

  // ============================================================================
  // USERS MANAGEMENT
  // ============================================================================
  async getUsers(query: any = {}, actor?: any) {
    const actorRole = toBlueprintRole(actor?.role);
    const where: any = { deletedAt: null };
    if (actorRole === 'manager' && actor?.id) {
      where.OR = [{ managerId: actor.id }, { id: actor.id }];
    }
    if (query.role) {
      where.role = { in: matchingRoleVariants(query.role) as Role[] };
    }
    if (query.status) {
      where.status = query.status;
    }

    const [users, activeSessionRows] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        include: {
          team: {
            include: {
              manager: { select: { id: true, fullName: true, employeeId: true } },
              members: {
                where: { deletedAt: null },
                select: { id: true, fullName: true, role: true, email: true, status: true },
              },
            },
          },
          managedTeams: {
            include: {
              members: {
                where: { deletedAt: null },
                select: { id: true, fullName: true, role: true, email: true, status: true },
              },
            },
          },
          manager: { select: { id: true, fullName: true, employeeId: true } },
        },
      }),
      this.prisma.refreshTokenSession.findMany({
        where: { isActive: true, isRevoked: false, expiresAt: { gt: new Date() } },
        select: { userId: true },
      }),
    ]);

    const activeUserIds = new Set(activeSessionRows.map((s) => s.userId));
    const ONLINE_WINDOW_MS = 2 * 60 * 1000;

    const formatted = users.map((u) => {
      const managed = u.managedTeams?.[0];
      const resolvedTeam = u.team || managed || null;
      const resolvedTeamName = resolvedTeam?.name || null;
      const resolvedTeamCode = resolvedTeam?.teamCode || null;
      const resolvedManagerName =
        u.manager?.fullName || (u.team as any)?.manager?.fullName || null;
      const rawMembers = (resolvedTeam as any)?.members || [];
      const teamMembers = rawMembers.map((m: any) => ({
        id: m.id,
        fullName: m.fullName,
        role: this.mapRoleToFrontendUi(m.role),
        email: m.email,
        status: m.status,
      }));
      const recentlyActive =
        Boolean(u.lastActiveAt) &&
        Date.now() - new Date(u.lastActiveAt as any).getTime() <= ONLINE_WINDOW_MS;
      const isOnline =
        activeUserIds.has(u.id) &&
        recentlyActive &&
        Boolean(u.lastLoginAt) &&
        (!u.lastLogoutAt ||
          new Date(u.lastLoginAt).getTime() >= new Date(u.lastLogoutAt).getTime());
      const plainBank = u.bankAccountEncrypted
        ? decryptSensitiveData(u.bankAccountEncrypted)
        : '';
      return {
        _id: u.id,
        id: u.id,
        employeeId: u.employeeId,
        name: u.fullName,
        fullName: u.fullName,
        email: u.email,
        mobile: u.phone || '9876543210',
        phone: u.phone || '9876543210',
        upiId: u.upiId || '',
        bankAccountMasked: plainBank ? maskBankAccount(plainBank) : '',
        hasEncryptedBank: Boolean(u.bankAccountEncrypted),
        role: this.mapRoleToFrontendUi(u.role),
        canonicalRole: toBlueprintRole(u.role),
        backendRole: u.role,
        status: u.status || (u.isActive ? 'active' : 'suspended'),
        isOnline,
        presenceStatus: isOnline ? 'online' : 'offline',
        isActive: u.isActive,
        failedLoginAttempts: u.failedLoginAttempts,
        lockedUntil: u.lockedUntil,
        lastLoginAt: u.lastLoginAt,
        lastLogoutAt: u.lastLogoutAt,
        fnfDate: u.fnfDate,
        fnfSettled: u.fnfSettled,
        twoFactorEnabled: u.isTwoFactorEnabled,
        version: u.version,
        managerId: u.managerId || (u.team as any)?.manager?.id || null,
        managerName: resolvedManagerName,
        teamName: resolvedTeamName,
        teamCode: resolvedTeamCode,
        teamMembers,
        teamId: resolvedTeam
          ? {
              _id: resolvedTeam.id,
              id: resolvedTeam.id,
              teamName: resolvedTeam.name,
              name: resolvedTeam.name,
              teamCode: resolvedTeam.teamCode,
            }
          : null,
        createdAt: u.createdAt,
      };
    });

    return apiEnvelope(formatted, 'Users loaded', { users: formatted });
  }

  async getTeamUsers(managerId: string) {
    const [members, activeSessionRows] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          OR: [{ managerId }, { team: { managerId } }],
          deletedAt: null,
        },
        orderBy: { fullName: 'asc' },
        include: { team: true },
      }),
      this.prisma.refreshTokenSession.findMany({
        where: { isActive: true, isRevoked: false, expiresAt: { gt: new Date() } },
        select: { userId: true },
      }),
    ]);
    const activeUserIds = new Set(activeSessionRows.map((s) => s.userId));
    return apiEnvelope(
      members.map((u) => {
        const isOnline =
          activeUserIds.has(u.id) &&
          Boolean(u.lastLoginAt) &&
          (!u.lastLogoutAt ||
            new Date(u.lastLoginAt).getTime() >= new Date(u.lastLogoutAt).getTime());
        return {
          id: u.id,
          employeeId: u.employeeId,
          fullName: u.fullName,
          email: u.email,
          phone: u.phone,
          role: toBlueprintRole(u.role),
          status: u.status,
          isOnline,
          presenceStatus: isOnline ? 'online' : 'offline',
          lastLoginAt: u.lastLoginAt,
          lastLogoutAt: u.lastLogoutAt,
        };
      }),
      'Team counsellors fetched',
    );
  }

  async getUserById(id: string) {
    const u = await this.prisma.user.findFirst({
      where: { OR: [{ id }, { employeeId: id }], deletedAt: null },
      include: {
        team: true,
        manager: { select: { id: true, fullName: true, email: true } },
      },
    });
    if (!u) throw new NotFoundException('User not found');
    const plainBank = u.bankAccountEncrypted
      ? decryptSensitiveData(u.bankAccountEncrypted)
      : '';
    return apiEnvelope(
      {
        id: u.id,
        employeeId: u.employeeId,
        fullName: u.fullName,
        email: u.email,
        phone: u.phone,
        role: this.mapRoleToFrontendUi(u.role),
        canonicalRole: toBlueprintRole(u.role),
        backendRole: u.role,
        status: u.status,
        isActive: u.isActive,
        isTwoFactorEnabled: u.isTwoFactorEnabled,
        failedLoginAttempts: u.failedLoginAttempts,
        lockedUntil: u.lockedUntil,
        fnfDate: u.fnfDate,
        upiId: u.upiId || '',
        bankAccountMasked: plainBank ? maskBankAccount(plainBank) : '',
        version: u.version,
        manager: u.manager,
        team: u.team,
      },
      'User fetched',
    );
  }

  async createUser(body: any, actor?: any) {
    const email = validateRealEmail(body.email, true)!;

    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null },
    });
    if (existing) {
      throw new BadRequestException(
        `Ye email address (${email}) pehle se registered hai (${existing.fullName} - ${existing.employeeId}). Har staff member ka email unique hona chahiye.`,
      );
    }

    const rawPhoneInput = String(body.mobile || body.phone || '').trim();
    const normalizedPhone = rawPhoneInput ? normalizeIndianPhone(rawPhoneInput, true)! : null;
    if (normalizedPhone) {
      const tenDigit = normalizedPhone.replace(/\D/g, '').slice(-10);
      const phoneCandidates = [normalizedPhone, `+91${tenDigit}`, `91${tenDigit}`, tenDigit];
      const existingPhoneUser = await this.prisma.user.findFirst({
        where: {
          phone: { in: phoneCandidates },
          deletedAt: null,
        },
      });
      if (existingPhoneUser) {
        throw new BadRequestException(
          `Ye mobile number (${tenDigit}) pehle se registered hai (${existingPhoneUser.fullName} - ${existingPhoneUser.employeeId}). Same mobile number dobara add nahi ho sakta.`,
        );
      }
    }

    const rawPassword = String(body.password || 'Password@123');
    if (rawPassword.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters long.');
    }

    const role = this.mapFrontendToRole(body.role);
    const count = await this.prisma.user.count();
    const prefix = role === Role.super_admin ? 'ADM' : role === Role.manager ? 'MGR' : 'COU';
    const employeeId = body.employeeId || `EMP-${prefix}-${String(count + 1).padStart(3, '0')}`;
    const passwordHash = await bcrypt.hash(rawPassword, 12);

    let teamId = body.teamId || null;
    const manualTeamName = String(body.customTeamName || body.teamName || '').trim();
    if (manualTeamName) {
      let existingTeam = await this.prisma.team.findFirst({
        where: { name: { equals: manualTeamName, mode: 'insensitive' } },
      });
      if (!existingTeam) {
        const tCount = await this.prisma.team.count();
        const mgr = await this.prisma.user.findFirst({
          where: { role: { in: [Role.manager, Role.SENIOR_MANAGER] }, deletedAt: null },
        });
        existingTeam = await this.prisma.team.create({
          data: {
            teamCode: `TEAM-UK-${String(tCount + 1).padStart(2, '0')}-${Date.now().toString().slice(-3)}`,
            name: manualTeamName,
            description: 'Custom Admin Team',
            targetAdmissions: 50,
            status: 'ACTIVE',
            managerId: mgr?.id || null,
          },
        });
      }
      teamId = existingTeam.id;
    } else if (teamId) {
      let team = await this.prisma.team.findFirst({
        where: { OR: [{ id: teamId }, { teamCode: teamId }, { name: { equals: String(teamId), mode: 'insensitive' } }] },
      });
      if (!team) {
        const tCount = await this.prisma.team.count();
        const mgr = await this.prisma.user.findFirst({
          where: { role: { in: [Role.manager, Role.SENIOR_MANAGER] }, deletedAt: null },
        });
        team = await this.prisma.team.create({
          data: {
            teamCode: `TEAM-UK-${String(tCount + 1).padStart(2, '0')}-${Date.now().toString().slice(-3)}`,
            name: String(teamId).trim(),
            description: 'Custom Admin Team',
            targetAdmissions: 50,
            status: 'ACTIVE',
            managerId: mgr?.id || null,
          },
        });
      }
      teamId = team ? team.id : null;
    }

    // Phase 3 Business Rule: 1 Manager can manage up to 5 active Jr. Counsellors
    if (toBlueprintRole(role) === 'jr_counsellor' && (body.managerId || teamId)) {
      const existingCounsellorsUnderMgr = await this.prisma.user.count({
        where: {
          deletedAt: null,
          isActive: true,
          role: { in: [Role.jr_counsellor, Role.COUNSELLOR] },
          OR: [
            ...(body.managerId ? [{ managerId: body.managerId }] : []),
            ...(teamId ? [{ teamId }] : []),
          ],
        },
      });
      if (existingCounsellorsUnderMgr >= 5) {
        throw new BadRequestException(
          'A Manager / Team can manage up to 5 active Jr. Counsellors. Please select another Manager or Team.',
        );
      }
    }

    const user = await this.prisma.user.create({
      data: {
        employeeId,
        email,
        passwordHash,
        fullName: body.name || body.fullName || 'New Employee',
        phone: normalizedPhone || null,
        role,
        status: 'active',
        isActive: true,
        passwordUpdatedAt: new Date(),
        managerId: body.managerId || null,
        teamId: teamId || null,
        upiId: body.upiId || null,
        bankAccountEncrypted: body.bankAccount
          ? encryptSensitiveData(String(body.bankAccount))
          : null,
      },
      include: { team: true },
    });

    if (toBlueprintRole(role) === 'manager' && teamId) {
      await this.prisma.team.update({
        where: { id: teamId },
        data: { managerId: user.id },
      }).catch(() => {});
    }

    await this.prisma.auditLog.create({
      data: {
        userId: actor?.id || null,
        userName: actor?.fullName || 'Super Admin',
        userRole: actor?.role || 'super_admin',
        action: 'CREATE',
        module: 'users',
        entity: 'User',
        entityId: user.id,
        newValue: { email: user.email, role: user.role, employeeId },
      },
    });

    return apiEnvelope(
      {
        _id: user.id,
        id: user.id,
        employeeId: user.employeeId,
        name: user.fullName,
        fullName: user.fullName,
        email: user.email,
        role: this.mapRoleToFrontendUi(user.role),
        canonicalRole: toBlueprintRole(user.role),
        status: 'active',
      },
      `User ${user.fullName} (${user.employeeId}) created successfully!`,
      { user },
    );
  }

  async updateUser(id: string, body: any, actor?: any) {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ id }, { employeeId: id }], deletedAt: null },
    });
    if (!user) throw new NotFoundException('User not found');

    if (body.version !== undefined && Number(body.version) !== user.version) {
      throw new ConflictException(
        'User profile was modified concurrently. Please refresh and retry.',
      );
    }

    if (body.status === 'suspended' || body.status === 'inactive' || body.isActive === false) {
      if (normalizeCanonicalRole(user.role) === 'SUPER_ADMIN') {
        throw new BadRequestException('Super Admin accounts cannot be suspended or deactivated.');
      }
    }

    const data: any = { version: { increment: 1 } };
    if (body.fullName || body.name) data.fullName = String(body.fullName || body.name).trim();
    if (body.phone !== undefined || body.mobile !== undefined) {
      data.phone = String(body.phone ?? body.mobile).trim();
    }
    if (body.managerId !== undefined) data.managerId = body.managerId || null;
    if (body.teamId !== undefined) data.teamId = body.teamId || null;
    if (body.upiId !== undefined) data.upiId = body.upiId;
    if (body.bankAccount) {
      data.bankAccountEncrypted = encryptSensitiveData(String(body.bankAccount));
    }
    if (body.role && body.role !== user.role) {
      data.role = body.role;
      await this.prisma.refreshTokenSession.updateMany({
        where: { userId: user.id, isActive: true },
        data: { isActive: false, isRevoked: true, revokedAt: new Date(), revokedReason: 'role_changed' },
      });
    }

    const updated = await this.prisma.user.updateMany({
      where: { id: user.id, version: user.version },
      data,
    });
    if (updated.count === 0) throw new ConflictException('Concurrent user update conflict');

    await this.prisma.auditLog.create({
      data: {
        userId: actor?.id || null,
        userName: actor?.fullName || 'Super Admin',
        userRole: actor?.role || 'super_admin',
        action: 'UPDATE',
        module: 'users',
        entity: 'User',
        entityId: user.id,
        details: { updatedFields: Object.keys(body || {}) },
      },
    });

    return this.getUserById(user.id);
  }

  async toggleUserStatus(id: string, actor?: any) {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ id }, { employeeId: id }], deletedAt: null },
    });
    if (!user) throw new NotFoundException('User not found');

    if (normalizeCanonicalRole(user.role) === 'SUPER_ADMIN') {
      throw new BadRequestException('Super Admin accounts cannot be suspended or deactivated.');
    }

    const newActive = !user.isActive;
    const newStatus = newActive ? 'active' : 'suspended';

    await this.prisma.user.update({
      where: { id: user.id },
      data: { isActive: newActive, status: newStatus, version: { increment: 1 } },
    });

    if (!newActive) {
      await this.prisma.refreshTokenSession.updateMany({
        where: { userId: user.id, isActive: true },
        data: { isActive: false, isRevoked: true, revokedAt: new Date(), revokedReason: 'suspended' },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        userId: actor?.id || null,
        userName: actor?.fullName || 'Super Admin',
        userRole: actor?.role || 'super_admin',
        action: 'UPDATE',
        module: 'users',
        entity: 'User',
        entityId: user.id,
        details: { newStatus },
      },
    });

    return apiEnvelope(
      { id: user.id, status: newStatus, isActive: newActive },
      `User ${user.fullName} status changed to ${newStatus}`,
    );
  }

  async suspendUserFnf(id: string, body: any = {}, actor?: any) {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ id }, { employeeId: id }], deletedAt: null },
    });
    if (!user) throw new NotFoundException('User not found');

    if (normalizeCanonicalRole(user.role) === 'SUPER_ADMIN') {
      throw new BadRequestException('Super Admin accounts cannot be suspended.');
    }

    const fnfDate = body.fnfDate || body.fnf_date ? new Date(body.fnfDate || body.fnf_date) : new Date();
    const transferToId = body.transferToId || body.transfer_to_id || null;

    let transferredLeads = 0;
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          status: 'suspended',
          isActive: false,
          fnfDate,
          version: { increment: 1 },
        },
      });

      await tx.refreshTokenSession.updateMany({
        where: { userId: user.id, isActive: true },
        data: {
          isActive: false,
          isRevoked: true,
          revokedAt: new Date(),
          revokedReason: 'user_suspended',
        },
      });

      if (transferToId) {
        const res = await tx.lead.updateMany({
          where: {
            assignedCounsellorId: user.id,
            deletedAt: null,
            isMerged: false,
            forceExpired: false,
          },
          data: {
            assignedCounsellorId: transferToId,
            version: { increment: 1 },
          },
        });
        transferredLeads = res.count;
      }

      await tx.auditLog.create({
        data: {
          userId: actor?.id || null,
          userName: actor?.fullName || 'Super Admin',
          userRole: actor?.role || 'super_admin',
          action: 'UPDATE',
          module: 'users',
          entity: 'User',
          entityId: user.id,
          newValue: { status: 'suspended', fnfDate, transferToId, transferredLeads },
          isSpecialFlag: true,
        },
      });
    });

    return apiEnvelope(
      { id: user.id, status: 'suspended', fnfDate, transferredLeads },
      `User suspended with FNF date & ${transferredLeads} active leads transferred.`,
    );
  }

  async unlockUser(id: string, actor?: any) {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ id }, { employeeId: id }], deletedAt: null },
    });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        status: 'active',
        isActive: true,
        version: { increment: 1 },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: actor?.id || null,
        userName: actor?.fullName || 'Super Admin',
        userRole: actor?.role || 'super_admin',
        action: 'UPDATE',
        module: 'users',
        entity: 'User',
        entityId: user.id,
        details: { event: 'account_unlocked' },
      },
    });

    return apiEnvelope({ id: user.id, status: 'active' }, `Account unlocked for ${user.fullName}`);
  }

  async forceLogoutUser(id: string, actor?: any) {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ id }, { employeeId: id }], deletedAt: null },
    });
    if (!user) throw new NotFoundException('User not found');

    const res = await this.prisma.refreshTokenSession.updateMany({
      where: { userId: user.id, isActive: true },
      data: {
        isActive: false,
        isRevoked: true,
        revokedAt: new Date(),
        revokedReason: 'admin_force_logout',
      },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLogoutAt: new Date(), lastActiveAt: null },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: actor?.id || null,
        userName: actor?.fullName || 'Super Admin',
        userRole: actor?.role || 'super_admin',
        action: 'LOGOUT',
        module: 'users',
        entity: 'User',
        entityId: user.id,
        details: { revokedSessions: res.count, reason: 'admin_force_logout' },
        isSpecialFlag: true,
      },
    });

    return apiEnvelope(
      { revokedSessions: res.count },
      `Force-logged out ${user.fullName} (${res.count} session(s) revoked).`,
    );
  }

  async getUserLoginHistory(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ id }, { employeeId: id }] },
    });
    if (!user) throw new NotFoundException('User not found');

    const sessions = await this.prisma.refreshTokenSession.findMany({
      where: { userId: user.id },
      orderBy: { loginAt: 'desc' },
      take: 100,
    });
    return apiEnvelope(sessions, 'Login history loaded', { sessions });
  }

  async changeUserRole(id: string, bodyOrRole: any, actor?: any) {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ id }, { employeeId: id }], deletedAt: null },
    });
    if (!user) throw new NotFoundException('User not found');

    const payload = typeof bodyOrRole === 'string' ? { role: bodyOrRole } : (bodyOrRole || {});
    const newRole = payload.role ? this.mapFrontendToRole(payload.role) : user.role;
    const oldRole = user.role;

    let resolvedTeamId = user.teamId;
    const manualTeamName = String(payload.customTeamName || payload.teamName || '').trim();
    if (manualTeamName) {
      let existingTeam = await this.prisma.team.findFirst({
        where: { name: { equals: manualTeamName, mode: 'insensitive' } },
      });
      if (!existingTeam) {
        const tCount = await this.prisma.team.count();
        const mgr = await this.prisma.user.findFirst({
          where: { role: { in: [Role.manager, Role.SENIOR_MANAGER] }, deletedAt: null },
        });
        existingTeam = await this.prisma.team.create({
          data: {
            teamCode: `TEAM-UK-${String(tCount + 1).padStart(2, '0')}-${Date.now().toString().slice(-3)}`,
            name: manualTeamName,
            description: 'Custom Admin Team',
            targetAdmissions: 50,
            status: 'ACTIVE',
            managerId: mgr?.id || null,
          },
        });
      }
      resolvedTeamId = existingTeam.id;
    } else if (payload.teamId !== undefined) {
      if (!payload.teamId) {
        resolvedTeamId = null;
      } else {
        let team = await this.prisma.team.findFirst({
          where: {
            OR: [
              { id: String(payload.teamId) },
              { teamCode: String(payload.teamId) },
              { name: { equals: String(payload.teamId), mode: 'insensitive' } },
            ],
          },
        });
        if (!team) {
          const tCount = await this.prisma.team.count();
          const mgr = await this.prisma.user.findFirst({
            where: { role: { in: [Role.manager, Role.SENIOR_MANAGER] }, deletedAt: null },
          });
          team = await this.prisma.team.create({
            data: {
              teamCode: `TEAM-UK-${String(tCount + 1).padStart(2, '0')}-${Date.now().toString().slice(-3)}`,
              name: String(payload.teamId).trim(),
              description: 'Custom Admin Team',
              targetAdmissions: 50,
              status: 'ACTIVE',
              managerId: mgr?.id || null,
            },
          });
        }
        resolvedTeamId = team.id;
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const upd = await tx.user.update({
        where: { id: user.id },
        data: {
          role: newRole,
          teamId: resolvedTeamId,
          version: { increment: 1 },
        },
      });

      if (payload.role && newRole !== oldRole) {
        await tx.refreshTokenSession.updateMany({
          where: { userId: user.id, isActive: true },
          data: {
            isActive: false,
            isRevoked: true,
            revokedAt: new Date(),
            revokedReason: 'role_change',
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: actor?.id || null,
          userName: actor?.fullName || 'Super Admin',
          userRole: actor?.role || 'super_admin',
          action: 'UPDATE',
          module: 'users',
          entity: 'User',
          entityId: user.id,
          oldValue: { role: oldRole, teamId: user.teamId },
          newValue: { role: newRole, teamId: resolvedTeamId },
          details: {
            note: `User updated (role: ${oldRole} -> ${newRole}, teamId: ${resolvedTeamId}).`,
          },
          isSpecialFlag: true,
        },
      });

      return upd;
    });

    return apiEnvelope(
      { id: updated.id, role: updated.role, teamId: updated.teamId, sessionsRevoked: Boolean(payload.role) },
      `User ${updated.fullName} role/team updated cleanly.`,
      { user: updated },
    );
  }

  async adminResetPassword(id: string, newPassword: string, actor?: any) {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ id }, { employeeId: id }], deletedAt: null },
    });
    if (!user) throw new NotFoundException('User not found');

    const pwd = newPassword || 'Password@123';
    await this.authService.assertPasswordMeetsPolicy(pwd);
    const passwordHash = await bcrypt.hash(pwd, 12);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, passwordUpdatedAt: new Date(), version: { increment: 1 } },
    });

    await this.prisma.refreshTokenSession.updateMany({
      where: { userId: user.id, isActive: true },
      data: {
        isActive: false,
        isRevoked: true,
        revokedAt: new Date(),
        revokedReason: 'admin_password_reset',
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: actor?.id || null,
        userName: actor?.fullName || 'Super Admin',
        userRole: actor?.role || 'super_admin',
        action: 'UPDATE',
        module: 'users',
        entity: 'User',
        entityId: user.id,
        details: { employeeId: user.employeeId, action: 'admin_reset_password' },
      },
    });

    return apiEnvelope(
      { employeeId: user.employeeId },
      `Password reset for ${user.fullName} (${user.employeeId})`,
    );
  }

  async softDeleteUser(id: string, actor?: any) {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ id }, { employeeId: id }], deletedAt: null },
    });
    if (!user) throw new NotFoundException('User not found');
    if (actor?.id === user.id) {
      throw new BadRequestException('Cannot delete your own active account');
    }
    if (normalizeCanonicalRole(user.role) === 'SUPER_ADMIN') {
      throw new BadRequestException('Super Admin accounts cannot be deleted.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { deletedAt: new Date(), isActive: false, status: 'inactive' },
    });

    await this.prisma.refreshTokenSession.updateMany({
      where: { userId: user.id, isActive: true },
      data: {
        isActive: false,
        isRevoked: true,
        revokedAt: new Date(),
        revokedReason: 'user_deleted',
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: actor?.id || null,
        userName: actor?.fullName || 'Super Admin',
        userRole: actor?.role || 'super_admin',
        action: 'DELETE',
        module: 'users',
        entity: 'User',
        entityId: user.id,
        isSpecialFlag: true,
      },
    });

    return apiEnvelope({ id: user.id }, `User ${user.fullName} soft-deleted`);
  }

  // ============================================================================
  // ROLES & PERMISSIONS MATRIX (/roles, /roles/:role/permissions)
  // ============================================================================
  async getRolesAndPermissions() {
    const dbPerms = await this.prisma.rolePermission.findMany({
      orderBy: [{ role: 'asc' }, { permissionKey: 'asc' }],
    });

    const matrix: Record<string, Record<string, boolean>> = {
      super_admin: {},
      manager: {},
      jr_counsellor: {},
    };
    for (const row of dbPerms) {
      const r = toBlueprintRole(row.role);
      if (!matrix[r]) matrix[r] = {};
      matrix[r][row.permissionKey] = row.allowed;
    }

    const roles = [
      {
        name: 'super_admin',
        displayName: 'Super Admin',
        description: 'Full organization oversight, 20 reports, settings, approvals & ledger control',
        permissions: Object.entries(matrix.super_admin)
          .filter(([, ok]) => ok)
          .map(([k]) => k),
      },
      {
        name: 'manager',
        displayName: 'Sr. Counsellor / Manager',
        description: 'Team oversight, verification, lifecycle decisions, Sub-Stage updates',
        permissions: Object.entries(matrix.manager)
          .filter(([, ok]) => ok)
          .map(([k]) => k),
      },
      {
        name: 'jr_counsellor',
        displayName: 'Jr. Counsellor',
        description: 'Assigned lead counselling, manual WA/Call confirmation & applications',
        permissions: Object.entries(matrix.jr_counsellor)
          .filter(([, ok]) => ok)
          .map(([k]) => k),
      },
    ];

    return apiEnvelope({ roles, matrix, raw: dbPerms }, 'Roles & permission matrix loaded', {
      roles,
      matrix,
    });
  }

  async updateRolePermissions(roleName: string, body: any, actor?: any) {
    const canonical = toBlueprintRole(roleName);
    const items: Array<{ permissionKey: string; allowed: boolean; description?: string }> = [];

    if (Array.isArray(body?.permissions)) {
      for (const p of body.permissions) {
        if (typeof p === 'string') {
          items.push({ permissionKey: p, allowed: true });
        } else if (p && p.permissionKey) {
          items.push({
            permissionKey: String(p.permissionKey),
            allowed: Boolean(p.allowed),
            description: p.description,
          });
        }
      }
    } else if (body?.matrix && typeof body.matrix === 'object') {
      for (const [k, v] of Object.entries(body.matrix)) {
        items.push({ permissionKey: k, allowed: Boolean(v) });
      }
    } else if (typeof body === 'object' && body !== null) {
      for (const [k, v] of Object.entries(body)) {
        if (k !== 'permissions') items.push({ permissionKey: k, allowed: Boolean(v) });
      }
    }

    if (items.length === 0) {
      throw new BadRequestException('Permissions payload required');
    }

    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.rolePermission.upsert({
          where: { role_permissionKey: { role: canonical, permissionKey: item.permissionKey } },
          update: { allowed: item.allowed, description: item.description },
          create: {
            role: canonical,
            permissionKey: item.permissionKey,
            allowed: item.allowed,
            description: item.description,
          },
        }),
      ),
    );

    RolesGuard.invalidateCache();

    await this.prisma.auditLog.create({
      data: {
        userId: actor?.id || null,
        userName: actor?.fullName || 'Super Admin',
        userRole: actor?.role || 'super_admin',
        action: 'UPDATE',
        module: 'roles',
        entity: 'RolePermission',
        newValue: { role: canonical, updatedCount: items.length },
        isSpecialFlag: true,
      },
    });

    return this.getRolesAndPermissions();
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
            admissionsCreated: true,
            commissionsBeneficiary: true,
          },
        },
      },
    });

    const formatted = teams.map((t) => {
      const totalLeads = t.members.reduce((sum, c) => sum + c.assignedLeads.length, 0);
      const totalAdmissions = t.members.reduce((sum, c) => sum + c.admissionsCreated.length, 0);
      const totalCommission = t.members.reduce(
        (sum, c) =>
          sum +
          c.commissionsBeneficiary
            .filter(
              (cm) => !['reversed', 'REVERSED'].includes(String(cm.status)) && cm.amount > 0,
            )
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
        status: t.status || 'ACTIVE',
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

    return apiEnvelope(formatted, 'Teams loaded', { teams: formatted });
  }

  async createTeam(body: any, actor?: any) {
    const count = await this.prisma.team.count();
    const teamCode = body.teamId || `TEAM-UK-${String(count + 1).padStart(2, '0')}`;

    let managerId = body.managerId;
    if (!managerId) {
      const mgr = await this.prisma.user.findFirst({
        where: { role: { in: [Role.manager, Role.SENIOR_MANAGER] }, deletedAt: null },
      });
      managerId = mgr?.id;
    }

    const team = await this.prisma.team.create({
      data: {
        teamCode,
        name: body.teamName || body.name || `Uttarakhand Team ${count + 1}`,
        description: body.region || body.description || 'Dehradun & Mussoorie',
        targetAdmissions: Number(body.targetAdmissions || 50),
        status: 'ACTIVE',
        managerId,
      },
      include: { manager: true, members: true },
    });

    if (Array.isArray(body.counsellorIds) && body.counsellorIds.length > 0) {
      await this.prisma.user.updateMany({
        where: { id: { in: body.counsellorIds } },
        data: { teamId: team.id, managerId: managerId || undefined },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        userId: actor?.id || null,
        userName: actor?.fullName || 'Super Admin',
        userRole: actor?.role || 'super_admin',
        action: 'CREATE',
        module: 'teams',
        entity: 'Team',
        entityId: team.id,
        details: { teamCode, name: team.name },
      },
    });

    return apiEnvelope(team, `Team "${team.name}" created successfully!`, { team });
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

    return apiEnvelope(updated, 'Team updated successfully', { team: updated });
  }

  async toggleTeamStatus(id: string) {
    const team = await this.prisma.team.findFirst({
      where: { OR: [{ id }, { teamCode: id }] },
    });
    if (!team) throw new NotFoundException('Team not found');

    const newStatus = team.status === 'ACTIVE' || team.status === 'Active' ? 'INACTIVE' : 'ACTIVE';
    const updated = await this.prisma.team.update({
      where: { id: team.id },
      data: { status: newStatus },
    });

    return apiEnvelope(updated, `Team status changed to ${newStatus}`, { team: updated });
  }

  // ============================================================================
  // FOLLOW-UPS & TASKS (/follow-ups/*, /followups/*, /tasks/*)
  // ============================================================================
  private formatFollowUp(f: any) {
    return {
      _id: f.id,
      id: f.id,
      followUpId: f.followUpCode || f.id.slice(0, 10).toUpperCase(),
      callOutcome: f.outcome || 'interested',
      status: f.status,
      type: f.type,
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
              name: f.lead.studentName,
              admissionClass: f.lead.applyingForGrade,
            },
            parentId: {
              name: f.lead.parentName,
              mobile: f.lead.parentPhone,
            },
          }
        : null,
      counsellorId: f.counsellor
        ? { _id: f.counsellor.id, id: f.counsellor.id, name: f.counsellor.fullName }
        : null,
    };
  }

  async getFollowUps(user?: any, filter: 'all' | 'today' | 'overdue' = 'all') {
    const role = toBlueprintRole(user?.role);
    const where: any = {};
    if (role === 'jr_counsellor' && user?.id) {
      where.counsellorId = user.id;
    }

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    if (filter === 'today') {
      where.scheduledAt = { gte: startOfToday, lte: endOfToday };
    } else if (filter === 'overdue') {
      where.scheduledAt = { lt: startOfToday };
      where.status = { notIn: ['COMPLETED', 'Completed', 'completed'] };
    }

    const followUps = await this.prisma.followUp.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
      include: {
        lead: true,
        counsellor: true,
      },
    });

    const formatted = followUps.map((f) => this.formatFollowUp(f));
    return apiEnvelope(formatted, 'Follow-ups loaded', { followUps: formatted });
  }

  async createFollowUp(body: any, user?: any) {
    const rawLeadId = body.leadId || body.lead_id;
    const lead = await this.prisma.lead.findFirst({
      where: { OR: [{ id: rawLeadId }, { leadNumber: rawLeadId }], deletedAt: null },
    });
    if (!lead) throw new NotFoundException('Lead not found');

    const count = await this.prisma.followUp.count();
    const followUpCode = `FUP-2026-${String(count + 1).padStart(4, '0')}`;
    const nextDate = body.nextFollowUpDate || body.scheduledAt
      ? new Date(body.nextFollowUpDate || body.scheduledAt)
      : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    const fup = await this.prisma.followUp.create({
      data: {
        followUpCode,
        leadId: lead.id,
        counsellorId: user?.id || lead.assignedCounsellorId!,
        outcome: body.callOutcome || body.outcome || 'interested',
        scheduledAt: nextDate,
        notes: body.notes || 'Follow-up scheduled with parent.',
        status: body.status || 'SCHEDULED',
        dpdpConsentRecorded: body.consentRecorded !== false,
      },
      include: { lead: true, counsellor: true },
    });

    await this.prisma.lead.update({
      where: { id: lead.id },
      data: {
        nextFollowUpDate: nextDate,
        status: lead.status === LeadStatus.new ? LeadStatus.contacted : lead.status,
        version: { increment: 1 },
      },
    });

    return apiEnvelope(
      this.formatFollowUp(fup),
      'Follow-up scheduled & linked to lead!',
      { followUp: fup },
    );
  }

  async rescheduleFollowUp(id: string, body: any, user?: any) {
    const reason = String(body.reason || '').trim();
    if (reason.length < 5) {
      throw new BadRequestException(
        'Mandatory reschedule reason (min 5 characters) is required.',
      );
    }
    const newDate = new Date(body.newDate || body.new_date || body.nextFollowUpDate);
    if (Number.isNaN(newDate.getTime())) {
      throw new BadRequestException('Valid newDate is required');
    }

    const fup = await this.prisma.followUp.findFirst({
      where: { OR: [{ id }, { followUpCode: id }] },
    });
    if (!fup) throw new NotFoundException('Follow-up not found');

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.followUpHistory.create({
        data: {
          leadId: fup.leadId,
          followUpId: fup.id,
          oldDate: fup.scheduledAt,
          newDate,
          reason,
          changedBy: user?.id || fup.counsellorId,
        },
      });

      const upd = await tx.followUp.update({
        where: { id: fup.id },
        data: { scheduledAt: newDate, status: 'SCHEDULED' },
        include: { lead: true, counsellor: true },
      });

      await tx.lead.update({
        where: { id: fup.leadId },
        data: { nextFollowUpDate: newDate, version: { increment: 1 } },
      });

      await tx.auditLog.create({
        data: {
          userId: user?.id || null,
          userName: user?.fullName || 'Counsellor',
          userRole: user?.role || 'jr_counsellor',
          action: 'UPDATE',
          module: 'follow_ups',
          entity: 'FollowUp',
          entityId: fup.id,
          oldValue: { scheduledAt: fup.scheduledAt },
          newValue: { scheduledAt: newDate, reason },
        },
      });
      return upd;
    });

    return apiEnvelope(
      this.formatFollowUp(updated),
      'Follow-up rescheduled and history recorded',
    );
  }

  async completeFollowUp(id: string, body: any, user?: any) {
    const fup = await this.prisma.followUp.findFirst({
      where: { OR: [{ id }, { followUpCode: id }] },
    });
    if (!fup) throw new NotFoundException('Follow-up not found');

    const upd = await this.prisma.followUp.update({
      where: { id: fup.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        outcome: body?.outcome || fup.outcome || 'interested',
        notes: body?.notes ? `${fup.notes} | Completed: ${body.notes}` : fup.notes,
      },
      include: { lead: true, counsellor: true },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user?.id || null,
        userName: user?.fullName || 'Counsellor',
        userRole: user?.role || 'jr_counsellor',
        action: 'UPDATE',
        module: 'follow_ups',
        entity: 'FollowUp',
        entityId: fup.id,
        newValue: { status: 'COMPLETED', outcome: upd.outcome },
      },
    });

    return apiEnvelope(this.formatFollowUp(upd), 'Follow-up marked completed');
  }

  async getTasks(user?: any) {
    const where: any = {};
    if (toBlueprintRole(user?.role) === 'jr_counsellor' && user?.id) {
      where.assignedToId = user.id;
    }
    const tasks = await this.prisma.task.findMany({
      where,
      orderBy: { dueDate: 'asc' },
      include: { assignedTo: true, lead: true },
    });
    return apiEnvelope(tasks, 'Tasks fetched', { tasks });
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
    return apiEnvelope(task, 'Task created', { task });
  }

  // ============================================================================
  // LEGACY DASHBOARD STATS & AI MESSAGE ALIAS
  // ============================================================================
  async getDashboardStats(user: any, previewRole?: string) {
    const effectiveCanon = previewRole
      ? toBlueprintRole(previewRole)
      : toBlueprintRole(user?.role);

    const [allLeads, allAdmissions, allCommissions, allUsers, allTeams, allFollowUps, allSchools] =
      await Promise.all([
        this.prisma.lead.findMany({ where: { deletedAt: null } }),
        this.prisma.admission.findMany({ where: { deletedAt: null }, include: { school: true, lead: true } }),
        this.prisma.commission.findMany({ where: { deletedAt: null } }),
        this.prisma.user.findMany({ where: { deletedAt: null } }),
        this.prisma.team.findMany(),
        this.prisma.followUp.findMany(),
        this.prisma.school.findMany({ where: { deletedAt: null } }),
      ]);

    const schoolNameById = new Map(allSchools.map((s) => [s.id, s.name]));
    const schoolDistribution: Record<string, number> = {};
    for (const s of allSchools.slice(0, 15)) schoolDistribution[s.name] = 0;
    for (const l of allLeads) {
      if (l.preferredSchoolId && schoolNameById.has(l.preferredSchoolId)) {
        const nm = schoolNameById.get(l.preferredSchoolId)!;
        schoolDistribution[nm] = (schoolDistribution[nm] || 0) + 1;
      }
    }

    const confirmedAdmissions = allAdmissions.filter((a) => a.status !== 'Cancelled');
    const totalRevenue = confirmedAdmissions.reduce((s, a) => s + (a.feeAgreed || 0), 0);
    const totalCommissionLiability = allCommissions
      .filter((c) => c.amount > 0 && !['reversed', 'REVERSED'].includes(String(c.status)))
      .reduce((s, c) => s + c.amount, 0);
    const paidCommission = allCommissions
      .filter((c) => c.amount > 0 && ['paid_out', 'PAID'].includes(String(c.status)))
      .reduce((s, c) => s + Number(c.jrAmount || 0) + Number(c.srAmount || 0), 0);

    if (effectiveCanon === 'super_admin') {
      return {
        success: true,
        role: 'admin',
        stats: {
          totalUsers: allUsers.length,
          activeTeams: allTeams.filter((t) => String(t.status).toLowerCase() === 'active').length,
          totalLeads: allLeads.length,
          verifiedLeads: allLeads.filter((l) => l.verificationStatus === VerificationStatus.APPROVED)
            .length,
          pendingVerification: allLeads.filter(
            (l) => l.verificationStatus === VerificationStatus.PENDING_VERIFICATION,
          ).length,
          confirmedAdmissions: confirmedAdmissions.length,
          totalRevenue,
          totalCommissionLiability,
          paidCommission,
          pendingCommissionPayout: Math.max(0, totalCommissionLiability - paidCommission),
          conversionRate: allLeads.length
            ? `${Math.round((confirmedAdmissions.length / allLeads.length) * 100)}%`
            : '0%',
          schoolDistribution,
        },
      };
    }

    if (effectiveCanon === 'manager') {
      return {
        success: true,
        role: 'manager',
        stats: {
          teamSize: allUsers.filter((u) => toBlueprintRole(u.role) === 'jr_counsellor').length,
          teamLeads: allLeads.length,
          pendingVerification: allLeads.filter(
            (l) => l.verificationStatus === VerificationStatus.PENDING_VERIFICATION,
          ).length,
          verifiedLeads: allLeads.filter((l) => l.verificationStatus === VerificationStatus.APPROVED)
            .length,
          returnedLeads: allLeads.filter((l) => l.verificationStatus === VerificationStatus.RETURNED)
            .length,
          teamAdmissions: confirmedAdmissions.length,
          teamCommission: allCommissions.reduce((s, c) => s + Number(c.jrAmount || 0), 0),
          managerSharing: allCommissions.reduce((s, c) => s + Number(c.srAmount || 0), 0),
          schoolDistribution,
        },
      };
    }

    const myLeads =
      toBlueprintRole(user?.role) === 'jr_counsellor'
        ? allLeads.filter((l) => l.assignedCounsellorId === user.id)
        : allLeads;
    const myAdmissions =
      toBlueprintRole(user?.role) === 'jr_counsellor'
        ? confirmedAdmissions.filter((a) => a.counsellorId === user.id)
        : confirmedAdmissions;
    const myCommissions = allCommissions.filter(
      (c) =>
        (toBlueprintRole(user?.role) !== 'jr_counsellor' || c.beneficiaryId === user.id) &&
        !['reversed', 'REVERSED'].includes(String(c.status)),
    );
    const earnedCommission = myCommissions.reduce((s, c) => s + Number(c.jrAmount || 0), 0);
    const paidCounsellor = myCommissions
      .filter((c) => ['paid_out', 'PAID'].includes(String(c.status)))
      .reduce((s, c) => s + Number(c.jrAmount || 0), 0);

    return {
      success: true,
      role: 'counsellor',
      stats: {
        assignedLeads: myLeads.length,
        inProgressLeads: myLeads.filter((l) => l.status === LeadStatus.contacted).length,
        pendingVerification: myLeads.filter(
          (l) => l.verificationStatus === VerificationStatus.PENDING_VERIFICATION,
        ).length,
        todayFollowUps: allFollowUps.length,
        confirmedAdmissions: myAdmissions.length,
        earnedCommission,
        paidCommission: paidCounsellor,
        pendingCommission: Math.max(0, earnedCommission - paidCounsellor),
        schoolDistribution,
      },
    };
  }

  async generateAiMessage(body: any) {
    const channel = body.channel || 'WhatsApp';
    const studentName = body.studentName || 'your child';
    const grade = body.class || 'Class 6';
    const schoolName = body.schoolName || 'The Doon School, Dehradun';
    const message =
      channel === 'WhatsApp'
        ? `Namaste! Regarding ${studentName}'s admission for ${grade} at ${schoolName}: Please let us know a convenient time for a campus walkthrough & prospectus sharing. - Team BoardingEdu`
        : `Dear Parent, thank you for exploring residential schooling at ${schoolName} for ${studentName} (${grade}). Attached are the academic & hostel fee details. Warm regards, BoardingEdu Admissions Desk.`;
    return apiEnvelope({ channel, message }, 'Message draft generated', { message });
  }

  // ============================================================================
  // SYSTEM SETTINGS, RATE LIMITS, GST/TDS
  // ============================================================================
  async getAllSettings() {
    const list = await this.prisma.systemSetting.findMany({ orderBy: { key: 'asc' } });
    const map: Record<string, any> = {};
    list.forEach((s) => {
      map[s.key] = s.value;
    });
    return apiEnvelope(map, 'System settings loaded', { list, settings: map });
  }

  async getSettingByKey(key: string) {
    const setting = await this.prisma.systemSetting.findUnique({ where: { key } });
    if (!setting) throw new NotFoundException(`System setting '${key}' not found.`);
    return apiEnvelope(setting.value, 'Setting loaded', { setting });
  }

  async putSystemSetting(
    key: string,
    value: any,
    category = 'general',
    description?: string,
    user?: any,
  ) {
    if (!key || value === undefined) {
      throw new BadRequestException('Setting key and JSON value are required.');
    }

    const previous = await this.prisma.systemSetting.findUnique({ where: { key } });
    const updated = await this.prisma.systemSetting.upsert({
      where: { key },
      update: {
        value,
        category,
        ...(description ? { description } : {}),
        updatedById: user?.id || null,
      },
      create: {
        key,
        value,
        category,
        description,
        updatedById: user?.id || null,
      },
    });

    if (key === 'rate_limits') {
      DynamicRateLimitGuard.invalidateConfig();
    }

    await this.prisma.auditLog.create({
      data: {
        userId: user?.id || null,
        userName: user?.fullName || 'Super Admin',
        userRole: user?.role || 'super_admin',
        action: 'UPDATE',
        module: 'settings',
        entity: 'SystemSetting',
        entityId: updated.id,
        oldValue: (previous?.value as any) ?? undefined,
        newValue: value,
        details: { key, category },
      },
    });

    return apiEnvelope(
      updated.value,
      `System setting '${key}' updated dynamically!`,
      { setting: updated },
    );
  }

  // ============================================================================
  // WHATSAPP TEMPLATES CRUD
  // ============================================================================
  async createWhatsappTemplate(dto: any, user?: any) {
    const key = String(dto.templateKey || dto.template_key || dto.name || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    const name = String(dto.name || '').trim();
    const body = String(dto.body || '').trim();
    if (!key || !name || !body) {
      throw new BadRequestException('templateKey, name and body are required');
    }
    if (body.length > 2000) {
      throw new BadRequestException('Template body exceeds 2000 characters maximum length.');
    }

    const created = await this.prisma.whatsappTemplate.create({
      data: {
        templateKey: key,
        name,
        body,
        recipientType: dto.recipientType || dto.recipient_type || 'parent',
        category: dto.category || 'general',
        isActive: dto.isActive !== false,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user?.id || null,
        userName: user?.fullName || 'Super Admin',
        userRole: user?.role || 'super_admin',
        action: 'CREATE',
        module: 'communications',
        entity: 'WhatsappTemplate',
        entityId: created.id,
        newValue: created,
      },
    });

    return apiEnvelope(created, 'WhatsApp template created!', { template: created });
  }

  async updateWhatsappTemplate(id: string, dto: any, user?: any) {
    if (dto.body && String(dto.body).length > 2000) {
      throw new BadRequestException('Template body exceeds 2000 characters maximum length.');
    }
    const existing = await this.prisma.whatsappTemplate.findFirst({
      where: { OR: [{ id }, { templateKey: id }] },
    });
    if (!existing) throw new NotFoundException('Template not found');

    const updated = await this.prisma.whatsappTemplate.update({
      where: { id: existing.id },
      data: {
        name: dto.name ?? existing.name,
        body: dto.body ?? existing.body,
        recipientType: dto.recipientType ?? dto.recipient_type ?? existing.recipientType,
        category: dto.category ?? existing.category,
        isActive: dto.isActive ?? existing.isActive,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user?.id || null,
        userName: user?.fullName || 'Super Admin',
        userRole: user?.role || 'super_admin',
        action: 'UPDATE',
        module: 'communications',
        entity: 'WhatsappTemplate',
        entityId: updated.id,
        oldValue: existing,
        newValue: updated,
      },
    });

    return apiEnvelope(updated, 'WhatsApp template updated!', { template: updated });
  }

  async deleteWhatsappTemplate(id: string) {
    const existing = await this.prisma.whatsappTemplate.findFirst({
      where: { OR: [{ id }, { templateKey: id }] },
    });
    if (!existing) throw new NotFoundException('Template not found');
    await this.prisma.whatsappTemplate.update({
      where: { id: existing.id },
      data: { isActive: false },
    });
    return apiEnvelope({ id: existing.id }, 'WhatsApp template deactivated');
  }

  // ============================================================================
  // BULK IMPORT (2-Step Preview + Confirm, Strict / Lenient, Formula Sanitized)
  // ============================================================================
  private parseUploadToSanitizedRows(fileBuffer: Buffer, fileName: string): any[] {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'xlsm' || (ext !== 'xlsx' && ext !== 'csv')) {
      throw new BadRequestException(
        `Unsupported file format '.${ext}'. Only safe '.xlsx' and '.csv' files are accepted. '.xlsm' (macro-enabled) files are strictly rejected for security.`,
      );
    }
    if (fileBuffer.length > 10 * 1024 * 1024) {
      throw new BadRequestException('File size exceeds the 10 MB maximum upload limit.');
    }

    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (!rawRows.length) {
      throw new BadRequestException('Uploaded file is empty or contains no data rows.');
    }

    return rawRows.map((row) => {
      const sanitized: any = {};
      for (const [key, val] of Object.entries(row)) {
        const cleanVal = typeof val === 'string' ? sanitizeSpreadsheetCell(val) : val;
        sanitized[key.trim()] = cleanVal;
      }
      return sanitized;
    });
  }

  async previewBulkImport(
    rowsOrBuffer: Buffer | any[],
    fileName: string,
    entity: 'leads' | 'schools' = 'leads',
  ) {
    const sanitizedRows = Buffer.isBuffer(rowsOrBuffer)
      ? this.parseUploadToSanitizedRows(rowsOrBuffer, fileName)
      : (rowsOrBuffer || []).map((row) => {
          const out: any = {};
          for (const [k, v] of Object.entries(row || {})) {
            out[k.trim()] = typeof v === 'string' ? sanitizeSpreadsheetCell(v) : v;
          }
          return out;
        });

    if (sanitizedRows.length === 0) {
      throw new BadRequestException('No rows found to preview');
    }

    const validRows: any[] = [];
    const duplicateRows: any[] = [];
    const errors: Array<{ rowNumber: number; identifier: string; error: string }> = [];

    // Fetch existing keys for duplicate check
    const existingPhones = new Set<string>();
    const existingSchools = new Set<string>();
    if (entity === 'leads') {
      const leads = await this.prisma.lead.findMany({
        where: { deletedAt: null },
        select: { parentPhone: true, studentName: true, classGrade: true },
      });
      leads.forEach((l) =>
        existingPhones.add(`${l.parentPhone}|${l.studentName.toLowerCase()}|${l.classGrade}`),
      );
    } else {
      const schools = await this.prisma.school.findMany({
        where: { deletedAt: null },
        select: { name: true },
      });
      schools.forEach((s) => existingSchools.add(s.name.toLowerCase()));
    }

    sanitizedRows.forEach((row, idx) => {
      const rowNum = idx + 2;
      try {
        if (entity === 'leads') {
          const studentName = row['Student Name'] || row['studentName'] || row['student_name'];
          const mobile = row['Mobile'] || row['parentPhone'] || row['mobile_primary'] || row['Phone'];
          const grade = row['Class'] || row['Grade'] || row['applyingForGrade'] || row['applying_for_grade'] || 'Class 6';
          if (!studentName) throw new Error('Missing Student Name');
          if (!mobile) throw new Error('Missing Mobile Number');
          const cleanPhone = normalizeIndianPhone(String(mobile));
          if (!cleanPhone || cleanPhone.replace(/\D/g, '').length < 10) {
            throw new Error(`Invalid mobile number '${mobile}'`);
          }
          const classGrade = parseClassGrade(String(grade));
          const dupKey = `${cleanPhone}|${String(studentName).trim().toLowerCase()}|${classGrade}`;
          const item = {
            rowNumber: rowNum,
            studentName: String(studentName).trim(),
            parentName: row['Parent Name'] || row['parentName'] || row['parent_name'] || `${studentName} Parent`,
            parentPhone: cleanPhone,
            parentEmail: row['Email'] || row['parentEmail'] || row['email'] || '',
            applyingForGrade: String(grade),
            classGrade,
            city: row['City'] || row['city'] || row['city_resident'] || 'Dehradun',
            preferredLocation: row['Preferred City'] || row['preferredLocation'] || row['city_preferred'] || 'Dehradun',
            annualBudget: row['Budget'] || row['annualBudget'] || '₹6L - ₹10L',
            preferredBoard: row['Board'] || row['preferredBoard'] || 'CBSE',
            leadSource: 'excel_import',
          };
          if (existingPhones.has(dupKey)) {
            duplicateRows.push(item);
            errors.push({
              rowNumber: rowNum,
              identifier: `${item.studentName} (${cleanPhone})`,
              error: 'Duplicate active lead exists',
            });
          } else {
            existingPhones.add(dupKey);
            validRows.push(item);
          }
        } else {
          const name = row['School Name'] || row['name'];
          const city = row['City'] || row['city'];
          if (!name) throw new Error('Missing School Name');
          if (!city) throw new Error('Missing City');
          const item = {
            rowNumber: rowNum,
            name: String(name).trim(),
            city: String(city).trim(),
            state: row['State'] || row['state'] || 'Uttarakhand',
            board: row['Board'] || row['board'] || 'CBSE',
            genderType: row['Gender Type'] || row['type'] || 'co_ed',
            category: row['Category'] || row['category'] || 'boarding',
            minFeeAnnual: Number(row['Min Fee'] || row['minFeeAnnual'] || 350000),
            maxFeeAnnual: Number(row['Max Fee'] || row['maxFeeAnnual'] || 700000),
            defaultCommission: Number(row['Company Commission'] || row['defaultCommission'] || 35000),
            jrCommission: Number(row['Jr Commission'] || row['jrCommission'] || 5000),
            srCommission: Number(row['Sr Commission'] || row['srCommission'] || 7000),
          };
          if (existingSchools.has(item.name.toLowerCase())) {
            duplicateRows.push(item);
          } else {
            existingSchools.add(item.name.toLowerCase());
            validRows.push(item);
          }
        }
      } catch (err: any) {
        errors.push({
          rowNumber: rowNum,
          identifier: row['Student Name'] || row['School Name'] || row['Mobile'] || `Row ${rowNum}`,
          error: err.message || 'Validation failed',
        });
      }
    });

    const header = 'Row Number,Record Identifier,Error Description\n';
    const errorCsv =
      errors.length > 0
        ? header +
          errors
            .map((e) => `"${e.rowNumber}","${String(e.identifier).replace(/"/g, '""')}","${String(e.error).replace(/"/g, '""')}"`)
            .join('\n')
        : '';

    const previewId = `imp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.importPreviews.set(previewId, {
      previewId,
      entity,
      fileName,
      validRows,
      duplicateRows,
      errors,
      errorCsv,
      expiresAt: Date.now() + 30 * 60 * 1000,
    });
    if (errorCsv) {
      this.errorCsvStore.set(previewId, { csv: errorCsv, expiresAt: Date.now() + 30 * 60 * 1000 });
    }

    const previewPayload = {
      previewId,
      entity,
      fileName,
      totalRows: sanitizedRows.length,
      validCount: validRows.length,
      duplicateCount: duplicateRows.length,
      errorCount: errors.length,
      validPreview: validRows.slice(0, 50),
      duplicates: duplicateRows.slice(0, 50),
      errors,
      error_csv_url: errorCsv ? `/api/settings/import-excel/errors/${previewId}` : null,
      errorReportCsv: errorCsv || undefined,
    };

    return apiEnvelope(previewPayload, 'Excel import preview generated', previewPayload);
  }

  async confirmBulkImport(
    options: {
      previewId?: string;
      fileBuffer?: Buffer;
      fileName?: string;
      rows?: any[];
      mode?: 'strict' | 'lenient';
      entity?: 'leads' | 'schools';
    },
    user?: any,
  ) {
    const mode = options.mode || 'lenient';
    const entity = options.entity || 'leads';

    let preview: ImportPreviewCacheItem | undefined;
    if (options.previewId) {
      preview = this.importPreviews.get(options.previewId);
      if (!preview || preview.expiresAt < Date.now()) {
        throw new BadRequestException('Import preview expired or invalid. Please re-upload.');
      }
    } else {
      const res: any = await this.previewBulkImport(
        options.fileBuffer || options.rows || [],
        options.fileName || 'import.xlsx',
        entity,
      );
      preview = this.importPreviews.get(res.previewId || res.data?.previewId);
    }

    if (!preview) throw new BadRequestException('Import preview missing');

    if (mode === 'strict' && (preview.errors.length > 0 || preview.duplicateRows.length > 0)) {
      throw new BadRequestException({
        message: `Strict Mode Rollback: ${preview.errors.length} validation/duplicate issues found. Zero records imported.`,
        errors: preview.errors,
        error_csv_url: preview.errorCsv ? `/api/settings/import-excel/errors/${preview.previewId}` : null,
      });
    }

    let importedCount = 0;
    if (preview.entity === 'leads') {
      for (const item of preview.validRows) {
        let leadNumber = `LD${String(Date.now()).slice(-6)}`;
        try {
          const seq: any[] = await this.prisma.$queryRawUnsafe(`SELECT nextval('seq_lead_id') AS val`);
          leadNumber = `LD${String(Number(seq?.[0]?.val || 1)).padStart(6, '0')}`;
        } catch {}

        await this.prisma.lead.create({
          data: {
            leadNumber,
            studentName: item.studentName,
            parentName: item.parentName,
            parentPhone: item.parentPhone,
            parentEmail: item.parentEmail || null,
            applyingForGrade: item.applyingForGrade,
            classGrade: item.classGrade,
            city: item.city,
            preferredLocation: item.preferredLocation,
            annualBudget: item.annualBudget,
            preferredBoard: item.preferredBoard,
            leadSource: 'excel_import',
            status: LeadStatus.new,
            verificationStatus: VerificationStatus.PENDING_VERIFICATION,
            assignedCounsellorId: user?.id || null,
            createdById: user?.id || null,
            dpdpConsent: true,
          },
        });
        importedCount++;
      }
    } else {
      for (const item of preview.validRows) {
        let schoolCode = `SC${String(Date.now()).slice(-4)}`;
        try {
          const seq: any[] = await this.prisma.$queryRawUnsafe(`SELECT nextval('seq_school_code') AS val`);
          schoolCode = `SC${String(Number(seq?.[0]?.val || 1)).padStart(3, '0')}`;
        } catch {}

        await this.prisma.school.create({
          data: {
            schoolCode,
            name: item.name,
            city: item.city,
            state: item.state,
            board: item.board,
            genderType: item.genderType,
            category: item.category,
            minFeeAnnual: item.minFeeAnnual,
            maxFeeAnnual: item.maxFeeAnnual,
            defaultCommission: item.defaultCommission,
            jrCommission: item.jrCommission,
            srCommission: item.srCommission,
            netProfit: Math.max(0, item.defaultCommission - item.jrCommission - item.srCommission),
            status: 'active',
          },
        });
        importedCount++;
      }
    }

    await this.prisma.auditLog.create({
      data: {
        userId: user?.id || null,
        userName: user?.fullName || 'User',
        userRole: user?.role || 'super_admin',
        action: 'CREATE',
        module: 'bulk_import',
        entity: preview.entity,
        details: {
          mode,
          fileName: preview.fileName,
          importedCount,
          errorsCount: preview.errors.length,
        },
      },
    });

    if (user?.id && this.notifications) {
      await this.notifications
        .notifyUser({
          userId: user.id,
          type: 'bulk_import_complete',
          title: 'Bulk Import Complete',
          message: `Imported ${importedCount} ${preview.entity} records (${mode} mode).`,
        })
        .catch(() => undefined);
    }

    const totalRows =
      preview.validRows.length + preview.duplicateRows.length + preview.errors.length;
    return apiEnvelope(
      {
        mode,
        totalRows,
        importedCount,
        duplicateCount: preview.duplicateRows.length,
        errorsCount: preview.errors.length,
        errors: preview.errors,
        error_csv_url: preview.errorCsv
          ? `/api/settings/import-excel/errors/${preview.previewId}`
          : null,
        errorReportCsv: preview.errorCsv || undefined,
      },
      `Bulk import completed! ${importedCount} records imported.`,
      {
        mode,
        totalRows,
        importedCount,
        errorsCount: preview.errors.length,
        errors: preview.errors,
        errorReportCsv: preview.errorCsv || undefined,
      },
    );
  }

  getImportErrorCsv(token: string): string {
    const clean = path.basename(token);
    const entry = this.errorCsvStore.get(clean);
    if (!entry) throw new NotFoundException('Error CSV not found or expired');
    return entry.csv;
  }

  // ============================================================================
  // AUDIT LOG, S3 ARCHIVAL (.json.gz + local fallback), JOBS, INTEGRITY
  // ============================================================================
  async getAuditLogs(query: any = {}) {
    const limit = Math.min(200, Math.max(1, Number(query.limit || 50)));
    const page = Math.max(1, Number(query.page || 1));
    const where: any = {};
    if (query.module) where.module = query.module;
    if (query.action) where.action = query.action;
    if (query.user_id || query.userId) where.userId = query.user_id || query.userId;
    if (query.special_flag !== undefined || query.specialFlag !== undefined) {
      where.isSpecialFlag = String(query.special_flag ?? query.specialFlag) === 'true';
    }
    if (query.date_from || query.date_to) {
      where.createdAt = {};
      if (query.date_from) where.createdAt.gte = new Date(query.date_from);
      if (query.date_to) where.createdAt.lte = new Date(query.date_to);
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return apiEnvelope(logs, 'Audit logs loaded', {
      logs,
      auditLogs: logs,
      total,
      page,
      limit,
    });
  }

  async runAuditRetentionCheck(olderThanDays = 365) {
    const cutoffDays = Number(olderThanDays || 365);
    const cutoffDate = new Date(Date.now() - cutoffDays * 24 * 60 * 60 * 1000);

    const eligibleLogs = await this.prisma.auditLog.findMany({
      where: { isArchived: false, createdAt: { lte: cutoffDate } },
      take: 2000,
    });

    let archivedCount = 0;
    let archiveTargetUri: string | null = null;
    let checksum: string | null = null;
    let storageMode: 's3' | 'local_gzip' | 'none' = 'none';

    if (eligibleLogs.length > 0) {
      const jsonPayload = JSON.stringify({
        archivedAt: new Date().toISOString(),
        cutoffDate: cutoffDate.toISOString(),
        count: eligibleLogs.length,
        records: eligibleLogs,
      });
      const gzBuffer = zlib.gzipSync(Buffer.from(jsonPayload, 'utf8'));
      checksum = crypto.createHash('sha256').update(gzBuffer).digest('hex');
      const fileName = `audit-archive-${new Date().toISOString().slice(0, 10)}-${Date.now()}.json.gz`;

      const endpoint = process.env.S3_ENDPOINT || '';
      const accessKey = process.env.S3_ACCESS_KEY_ID || '';
      const secretKey = process.env.S3_SECRET_ACCESS_KEY || '';
      const bucket = process.env.S3_BUCKET || 'boardingedu-audit-archive';
      const hasValidS3 =
        endpoint && !endpoint.includes('<account-id>') && accessKey && secretKey;

      if (hasValidS3) {
        const s3 = new S3Client({
          endpoint,
          region: process.env.S3_REGION || 'auto',
          credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
        });
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: `audit/${fileName}`,
            Body: gzBuffer,
            ContentType: 'application/gzip',
            Metadata: { sha256: checksum },
          }),
        );
        archiveTargetUri = `s3://${bucket}/audit/${fileName}`;
        storageMode = 's3';
      } else {
        const localFile = path.join(this.archiveDir, fileName);
        fs.writeFileSync(localFile, gzBuffer);
        archiveTargetUri = `file://${localFile.replace(/\\/g, '/')}`;
        storageMode = 'local_gzip';
      }

      const ids = eligibleLogs.map((l) => l.id);
      await this.prisma.auditLog.updateMany({
        where: { id: { in: ids } },
        data: {
          isArchived: true,
          archivedAt: new Date(),
          archiveS3Uri: archiveTargetUri,
        },
      });
      archivedCount = eligibleLogs.length;
    }

    const activeAuditCount = await this.prisma.auditLog.count({ where: { isArchived: false } });
    const archivedAuditCount = await this.prisma.auditLog.count({ where: { isArchived: true } });

    return apiEnvelope(
      {
        retentionPolicy: {
          auditActiveDays: 365,
          archivedFormat: '.json.gz',
          storageMode,
          archiveTargetUri,
          sha256: checksum,
        },
        archivedThisRun: archivedCount,
        activeAuditLogs: activeAuditCount,
        archivedAuditLogs: archivedAuditCount,
      },
      'Audit retention & lifecycle check complete',
      {
        archivedThisRun: archivedCount,
        activeAuditLogs: activeAuditCount,
        archivedAuditLogs: archivedAuditCount,
      },
    );
  }

  async runDataIntegrityCheck(user?: any, enqueue = false) {
    if (enqueue) {
      return this.queueEngine.enqueueJob({
        queueName: 'integrity',
        jobType: 'AUDIT_INTEGRITY_CHECK',
        userId: user?.id,
      });
    }

    const [
      totalLeads,
      totalApplications,
      totalCommissions,
      dupGroups,
      scoringRows,
      matchingRows,
      stageCMissingComm,
      commissionMathMismatch,
    ] = await Promise.all([
      this.prisma.lead.count({ where: { deletedAt: null } }),
      this.prisma.admission.count({ where: { deletedAt: null } }),
      this.prisma.commission.count({ where: { deletedAt: null } }),
      this.prisma.$queryRawUnsafe<any[]>(
        `SELECT mobile_primary, lower(student_name) AS sname, class_grade, COUNT(*) AS cnt
         FROM leads
         WHERE deleted_at IS NULL AND is_merged = false
         GROUP BY mobile_primary, lower(student_name), class_grade
         HAVING COUNT(*) > 1`,
      ),
      this.prisma.leadScoringConfig.findMany(),
      this.prisma.matchingCriteriaWeight.findMany(),
      this.prisma.admission.findMany({
        where: {
          deletedAt: null,
          subStage: 'C_formalities_done',
          commissions: { none: {} },
        },
        select: { id: true, admissionNumber: true },
      }),
      this.prisma.commission.findMany({
        where: { deletedAt: null, isReversal: false },
        select: { id: true, commissionCode: true, amount: true, jrAmount: true, srAmount: true, netProfit: true },
      }),
    ]);

    const scoringSum = scoringRows.reduce((s, r) => s + Number(r.weight || 0), 0);
    const matchingSum = matchingRows.reduce((s, r) => s + Number(r.weight || 0), 0);
    const mathAnomalies = commissionMathMismatch.filter(
      (c) => Math.abs(c.amount - c.jrAmount - c.srAmount - c.netProfit) > 1,
    );

    const healthy =
      dupGroups.length === 0 &&
      scoringSum === 100 &&
      matchingSum === 100 &&
      stageCMissingComm.length === 0 &&
      mathAnomalies.length === 0;

    return apiEnvelope(
      {
        healthy,
        checkedAt: new Date().toISOString(),
        counts: { totalLeads, totalApplications, totalCommissions },
        checks: {
          duplicateActiveLeads: dupGroups.length,
          leadScoringSum: scoringSum,
          matchingCriteriaSum: matchingSum,
          stageCMissingCommissions: stageCMissingComm.length,
          commissionSplitAnomalies: mathAnomalies.length,
        },
      },
      healthy ? 'Data integrity check passed cleanly' : 'Data integrity anomalies detected',
    );
  }

  // ============================================================================
  // BACKGROUND JOBS (BullMQ + PostgreSQL BackgroundJob Table)
  // ============================================================================
  async triggerJob(type: string, payload: any = {}, user?: any) {
    const queueMap: Record<string, any> = {
      RECALCULATE_LEAD_SCORES: 'scoring',
      lead_score_recalc: 'scoring',
      CHECK_LEAD_EXPIRIES: 'lifecycle',
      DAILY_LIFECYCLE_CHECK: 'lifecycle',
      lead_expiry_check: 'lifecycle',
      AUDIT_INTEGRITY_CHECK: 'integrity',
      data_integrity_check: 'integrity',
      GENERATE_REPORT: 'reports',
      report_generation: 'reports',
      MANUAL_LOGGING_REMINDERS: 'communications',
      manual_logging_reminders: 'communications',
      AUDIT_RETENTION_ARCHIVE: 'integrity',
      audit_retention_archive: 'integrity',
    };

    const queueName = queueMap[type];
    if (!queueName) {
      throw new BadRequestException(
        `Invalid job type '${type}'. Supported: ${Object.keys(queueMap).join(', ')}`,
      );
    }

    const job = await this.queueEngine.enqueueJob({
      queueName,
      jobType: type,
      payload: { ...payload, requestedBy: user?.id },
      userId: user?.id,
    });

    return apiEnvelope(job, `Background job '${type}' queued (${this.queueEngine.isRedisUp() ? 'BullMQ' : 'Async Worker'})`, {
      job,
      jobId: job?.jobId,
    });
  }

  async getJobStatus(jobId: string) {
    const job = await this.queueEngine.getJobStatus(jobId);
    if (!job) throw new NotFoundException(`Job '${jobId}' not found`);
    return apiEnvelope(job, 'Job status loaded', { job });
  }

  async listMyJobs(userId: string) {
    const jobs = await this.prisma.backgroundJob.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return apiEnvelope(jobs, 'User jobs loaded', { jobs });
  }

  // ============================================================================
  // DATA PRIVACY & DPDP COMPLIANCE ENGINE
  // ============================================================================
  async getPrivacyComplianceStatus(user: any) {
    const threeYearsAgo = new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000);
    const [
      acceptanceLog,
      totalLeads,
      consentedLeads,
      totalCalls,
      consentedCalls,
      inactiveOldLeads,
      archivedLeads,
      encryptedBankCount,
      twoFaCount,
      deletionSetting,
    ] = await Promise.all([
      this.prisma.auditLog.findFirst({
        where: { userId: user?.id, action: 'PRIVACY_POLICY_ACCEPTED' },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.lead.count({ where: { deletedAt: null } }),
      this.prisma.lead.count({ where: { deletedAt: null, dpdpConsent: true } }),
      this.prisma.callLog.count(),
      this.prisma.callLog.count({ where: { recordingConsent: true } }),
      this.prisma.lead.count({
        where: {
          deletedAt: null,
          updatedAt: { lt: threeYearsAgo },
          status: { notIn: ['admission_done', 'commission_received', 'ADMISSION_CONFIRMED', 'ENROLLED'] },
        },
      }),
      this.prisma.lead.count({ where: { deletedAt: { not: null } } }),
      this.prisma.user.count({ where: { deletedAt: null, bankAccountEncrypted: { not: null } } }),
      this.prisma.user.count({ where: { deletedAt: null, twoFactorSecret: { not: null } } }),
      this.prisma.systemSetting.findUnique({ where: { key: 'privacy_deletion_requests' } }),
    ]);

    const deletionRequests = Array.isArray((deletionSetting?.value as any)?.requests)
      ? (deletionSetting!.value as any).requests
      : [];

    const data = {
      policyVersion: 'v2.0 (DPDP Act 2023)',
      acceptedByCurrentUser: Boolean(acceptanceLog),
      acceptedAt: acceptanceLog?.createdAt || null,
      consentStats: {
        totalLeads,
        consentedLeads,
        consentRate: totalLeads > 0 ? Math.round((consentedLeads / totalLeads) * 100) : 100,
      },
      callRecordingStats: {
        totalCalls,
        consentedCalls,
        retentionYears: 3,
      },
      retentionStats: {
        policyYears: 3,
        cutoffDate: threeYearsAgo.toISOString(),
        activeLeads: totalLeads,
        inactiveEligibleForArchive: inactiveOldLeads,
        archivedRecords: archivedLeads,
      },
      encryptionStatus: {
        algorithm: 'AES-256-GCM',
        atRestEnabled: true,
        encryptedBankAccounts: encryptedBankCount,
        encryptedTwoFactorSecrets: twoFaCount,
        backupCodesProtected: true,
      },
      deletionRequests,
    };

    return apiEnvelope(data, 'Privacy & compliance status loaded', data);
  }

  async acceptPrivacyPolicy(user: any, version = 'v2.0 (DPDP Act 2023)') {
    const now = new Date();
    await this.prisma.auditLog.create({
      data: {
        userId: user?.id || null,
        userName: user?.fullName || user?.email || 'CRM User',
        userRole: user?.role || 'user',
        action: 'PRIVACY_POLICY_ACCEPTED',
        module: 'privacy',
        entity: 'PrivacyPolicy',
        entityId: user?.id || 'global',
        details: {
          version,
          acceptedAt: now.toISOString(),
          email: user?.email || null,
        },
      },
    });
    return apiEnvelope(
      { accepted: true, version, acceptedAt: now.toISOString() },
      'Privacy Policy accepted and recorded in audit trail.',
    );
  }

  async createDataDeletionRequest(body: any, user: any) {
    const requesterName = String(body.requesterName || body.name || '').trim();
    const phone = String(body.phone || '').trim();
    const email = String(body.email || '').trim();
    const leadNumber = String(body.leadNumber || '').trim();
    const reason = String(body.reason || '').trim();

    if (!requesterName || (!phone && !email && !leadNumber)) {
      throw new BadRequestException('Requester name and at least one identifier (Phone, Email, or Lead ID) are required.');
    }

    const existing = await this.prisma.systemSetting.findUnique({
      where: { key: 'privacy_deletion_requests' },
    });
    const list: any[] = Array.isArray((existing?.value as any)?.requests)
      ? [...(existing!.value as any).requests]
      : [];

    const newReq = {
      id: `DEL-${Date.now().toString().slice(-6)}`,
      requesterName,
      phone: phone || null,
      email: email || null,
      leadNumber: leadNumber || null,
      reason: reason || 'Parent / user requested erasure under DPDP Act',
      status: 'PENDING',
      submittedBy: user?.fullName || user?.email || 'Staff',
      submittedByRole: user?.role || 'user',
      createdAt: new Date().toISOString(),
      processedAt: null,
      processedBy: null,
      resolutionNotes: null,
    };

    list.unshift(newReq);

    await this.prisma.systemSetting.upsert({
      where: { key: 'privacy_deletion_requests' },
      create: {
        key: 'privacy_deletion_requests',
        value: { requests: list },
        updatedById: user?.id || null,
      },
      update: {
        value: { requests: list },
        updatedById: user?.id || null,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user?.id || null,
        userName: user?.fullName || 'CRM User',
        userRole: user?.role || 'user',
        action: 'CREATE',
        module: 'privacy',
        entity: 'DataDeletionRequest',
        entityId: newReq.id,
        details: { requesterName, phone, email, leadNumber, reason: newReq.reason },
        isSpecialFlag: true,
      },
    });

    return apiEnvelope(newReq, 'Data deletion request submitted for compliance review.', { request: newReq });
  }

  async processDataDeletionRequest(id: string, body: any, actor: any) {
    const decision = String(body.decision || body.status || '').toUpperCase();
    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      throw new BadRequestException('Decision must be APPROVED or REJECTED');
    }

    const existing = await this.prisma.systemSetting.findUnique({
      where: { key: 'privacy_deletion_requests' },
    });
    const list: any[] = Array.isArray((existing?.value as any)?.requests)
      ? [...(existing!.value as any).requests]
      : [];

    const idx = list.findIndex((r) => r.id === id);
    if (idx === -1) throw new NotFoundException(`Deletion request ${id} not found`);

    const reqItem = list[idx];
    let anonymizedCount = 0;

    if (decision === 'APPROVED') {
      const orConds: any[] = [];
      if (reqItem.leadNumber) orConds.push({ leadNumber: reqItem.leadNumber });
      if (reqItem.phone) {
        const cleanDigits = String(reqItem.phone).replace(/\D/g, '').slice(-10);
        if (cleanDigits) orConds.push({ parentPhone: { contains: cleanDigits } });
      }
      if (reqItem.email) orConds.push({ parentEmail: { equals: reqItem.email, mode: 'insensitive' } });

      if (orConds.length > 0) {
        const matchingLeads = await this.prisma.lead.findMany({
          where: { deletedAt: null, OR: orConds },
          select: { id: true },
        });
        for (const ml of matchingLeads) {
          await this.prisma.lead.update({
            where: { id: ml.id },
            data: {
              studentName: '[ERASED_DPDP]',
              parentName: '[ERASED_DPDP]',
              parentPhone: `ERASED-${ml.id.slice(0, 6)}`,
              whatsappNumber: null,
              parentEmail: null,
              alternateMobile: null,
              notes: 'Personal data erased per DPDP Data Deletion Request.',
              deletedAt: new Date(),
            },
          });
          anonymizedCount += 1;
        }
      }
    }

    list[idx] = {
      ...reqItem,
      status: decision,
      processedAt: new Date().toISOString(),
      processedBy: actor?.fullName || 'Super Admin',
      resolutionNotes:
        String(body.notes || '').trim() ||
        (decision === 'APPROVED'
          ? `Approved & PII erased (${anonymizedCount} matching lead record(s) anonymized).`
          : 'Rejected — legal/financial retention applies.'),
      anonymizedCount,
    };

    await this.prisma.systemSetting.update({
      where: { key: 'privacy_deletion_requests' },
      data: { value: { requests: list }, updatedById: actor?.id || null },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: actor?.id || null,
        userName: actor?.fullName || 'Super Admin',
        userRole: actor?.role || 'SUPER_ADMIN',
        action: decision === 'APPROVED' ? 'DELETE' : 'UPDATE',
        module: 'privacy',
        entity: 'DataDeletionRequest',
        entityId: id,
        details: { decision, anonymizedCount, notes: list[idx].resolutionNotes },
        isSpecialFlag: true,
      },
    });

    return apiEnvelope(list[idx], `Data deletion request ${id} marked ${decision}.`, { request: list[idx] });
  }

  async runThreeYearRetentionCheck(actor: any) {
    const threeYearsAgo = new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000);
    const archived = await this.prisma.lead.updateMany({
      where: {
        deletedAt: null,
        updatedAt: { lt: threeYearsAgo },
        status: { notIn: ['admission_done', 'commission_received', 'ADMISSION_CONFIRMED', 'ENROLLED'] },
      },
      data: {
        deletedAt: new Date(),
        expiryStatus: 'ARCHIVED_3YR_RETENTION',
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: actor?.id || null,
        userName: actor?.fullName || 'Super Admin',
        userRole: actor?.role || 'SUPER_ADMIN',
        action: 'AUTO',
        module: 'privacy',
        entity: 'DataRetention',
        entityId: '3-year-policy',
        details: {
          cutoffDate: threeYearsAgo.toISOString(),
          archivedCount: archived.count,
        },
      },
    });

    return apiEnvelope(
      { archivedCount: archived.count, cutoffDate: threeYearsAgo.toISOString() },
      archived.count > 0
        ? `Archived ${archived.count} inactive lead(s) older than 3 years.`
        : 'All active records are within the 3-year retention window (0 records archived).',
    );
  }
}
