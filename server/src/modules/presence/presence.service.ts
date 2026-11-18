import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { matchingRoleVariants, normalizeCanonicalRole } from '../../common/utils/crm.utils';

export type PresenceStatus = 'online' | 'idle' | 'offline';

/** Thresholds: <=2 min since last heartbeat = online, <=15 min = idle, else offline. */
const ONLINE_MS = 2 * 60 * 1000;
const IDLE_MS = 15 * 60 * 1000;

export function computePresence(lastActiveAt?: Date | null, now = Date.now()): PresenceStatus {
  if (!lastActiveAt) return 'offline';
  const diff = now - new Date(lastActiveAt).getTime();
  if (diff <= ONLINE_MS) return 'online';
  if (diff <= IDLE_MS) return 'idle';
  return 'offline';
}

@Injectable()
export class PresenceService {
  constructor(private prisma: PrismaService) {}

  async heartbeat(userId: string) {
    const now = new Date();
    await this.prisma.user.update({ where: { id: userId }, data: { lastActiveAt: now } });
    return { status: 'online' as PresenceStatus, lastActiveAt: now };
  }

  /**
   * Admin: all managers/counsellors (optionally filtered by managerId, search, role).
   * Manager: only own team. Counsellor: not allowed (guarded in controller).
   * Returns paginated rows with real presence and today's activity counts.
   */
  async getTeam(user: any, query: any) {
    const canon = normalizeCanonicalRole(user.role);
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(200, Math.max(1, Number(query.limit || 50)));

    const where: any = { deletedAt: null, isActive: true };
    if (canon === 'SENIOR_MANAGER') {
      where.managerId = user.id;
    } else {
      if (query.managerId) where.managerId = String(query.managerId);
      const roleFilter = String(query.role || '').toLowerCase();
      if (roleFilter === 'manager') where.role = { in: matchingRoleVariants('manager') };
      else if (roleFilter === 'counsellor') where.role = { in: matchingRoleVariants('counsellor') };
      else where.role = { in: [...matchingRoleVariants('manager'), ...matchingRoleVariants('counsellor')] };
    }
    if (query.search) {
      const q = String(query.search);
      where.OR = [
        { fullName: { contains: q, mode: 'insensitive' } },
        { employeeId: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: [{ lastActiveAt: { sort: 'desc', nulls: 'last' } }, { fullName: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          fullName: true,
          employeeId: true,
          email: true,
          role: true,
          managerId: true,
          teamId: true,
          lastLoginAt: true,
          lastActiveAt: true,
          manager: { select: { id: true, fullName: true } },
          team: { select: { id: true, name: true } },
        },
      }),
    ]);

    const ids = users.map((u) => u.id);
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const [calls, whatsapp, leads] = ids.length
      ? await Promise.all([
          this.prisma.callLog.groupBy({
            by: ['calledBy'],
            where: { calledBy: { in: ids }, calledAt: { gte: start } },
            _count: { _all: true },
          }),
          this.prisma.whatsappLog.groupBy({
            by: ['sentBy'],
            where: { sentBy: { in: ids }, sentAt: { gte: start } },
            _count: { _all: true },
          }),
          this.prisma.lead.groupBy({
            by: ['createdById'],
            where: { createdById: { in: ids }, createdAt: { gte: start }, deletedAt: null },
            _count: { _all: true },
          }),
        ])
      : [[], [], []];

    const callMap = new Map<string, number>((calls as any[]).map((c) => [c.calledBy, c._count._all]));
    const waMap = new Map<string, number>((whatsapp as any[]).map((c) => [c.sentBy, c._count._all]));
    const leadMap = new Map<string, number>((leads as any[]).map((c) => [c.createdById, c._count._all]));

    const now = Date.now();
    const rows = users.map((u) => {
      const presence = computePresence(u.lastActiveAt, now);
      const callsToday = callMap.get(u.id) || 0;
      const waToday = waMap.get(u.id) || 0;
      const leadsToday = leadMap.get(u.id) || 0;
      return {
        id: u.id,
        name: u.fullName,
        employeeId: u.employeeId,
        email: u.email,
        role: normalizeCanonicalRole(u.role),
        managerId: u.managerId,
        managerName: u.manager?.fullName || null,
        teamName: u.team?.name || null,
        presence,
        isOnline: presence === 'online',
        lastActiveAt: u.lastActiveAt,
        lastLoginAt: u.lastLoginAt,
        callsToday,
        whatsappToday: waToday,
        leadsToday,
        // Logged in / online but zero work today => "free"
        isIdleWorker: presence !== 'offline' && callsToday + waToday + leadsToday === 0,
      };
    });

    const summary = {
      total,
      online: rows.filter((r) => r.presence === 'online').length,
      idle: rows.filter((r) => r.presence === 'idle').length,
      offline: rows.filter((r) => r.presence === 'offline').length,
      notWorkingToday: rows.filter((r) => r.callsToday + r.whatsappToday + r.leadsToday === 0).length,
    };

    return { rows, summary, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /** Admin only: per-manager rollup (team size, online now, today's activity). Paginated for 500+ managers. */
  async getManagerRollup(query: any) {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 25)));
    const where: any = {
      deletedAt: null,
      isActive: true,
      role: { in: matchingRoleVariants('manager') },
    };
    if (query.search) where.fullName = { contains: String(query.search), mode: 'insensitive' };

    const [total, managers] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { fullName: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          fullName: true,
          employeeId: true,
          lastActiveAt: true,
          team: { select: { name: true } },
          counsellors: {
            where: { deletedAt: null, isActive: true },
            select: { id: true, lastActiveAt: true },
          },
        },
      }),
    ]);

    const now = Date.now();
    const rows = managers.map((m) => {
      const statuses = m.counsellors.map((c) => computePresence(c.lastActiveAt, now));
      return {
        id: m.id,
        name: m.fullName,
        employeeId: m.employeeId,
        teamName: m.team?.name || null,
        presence: computePresence(m.lastActiveAt, now),
        lastActiveAt: m.lastActiveAt,
        counsellorCount: m.counsellors.length,
        counsellorsOnline: statuses.filter((s) => s === 'online').length,
        counsellorsIdle: statuses.filter((s) => s === 'idle').length,
        counsellorsOffline: statuses.filter((s) => s === 'offline').length,
      };
    });

    return { rows, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
