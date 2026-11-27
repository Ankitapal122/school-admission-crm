import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { matchingRoleVariants, normalizeCanonicalRole } from '../../common/utils/crm.utils';

export type PresenceStatus = 'online' | 'idle' | 'offline';

/** Thresholds: <=2 min since last heartbeat = online, <=15 min = idle, else offline. */
const ONLINE_MS = 2 * 60 * 1000;
const IDLE_MS = 15 * 60 * 1000;
const DB_FLUSH_INTERVAL_MS = 45 * 1000;

export function computePresence(lastActiveAt?: Date | string | number | null, now = Date.now()): PresenceStatus {
  if (!lastActiveAt) return 'offline';
  const ts = typeof lastActiveAt === 'number' ? lastActiveAt : new Date(lastActiveAt).getTime();
  const diff = now - ts;
  if (diff <= ONLINE_MS) return 'online';
  if (diff <= IDLE_MS) return 'idle';
  return 'offline';
}

@Injectable()
export class PresenceService implements OnModuleInit, OnModuleDestroy {
  // High-throughput in-memory presence cache + batched DB sync for 5,500+ concurrent staff
  private lastSeenMap = new Map<string, number>();
  private dirtyUserIds = new Set<string>();
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    this.flushTimer = setInterval(() => {
      this.flushPresenceToDb().catch(() => {});
    }, DB_FLUSH_INTERVAL_MS);
  }

  async onModuleDestroy() {
    if (this.flushTimer) clearInterval(this.flushTimer);
    await this.flushPresenceToDb().catch(() => {});
  }

  private async flushPresenceToDb() {
    if (this.dirtyUserIds.size === 0) return;
    const batchIds = Array.from(this.dirtyUserIds);
    this.dirtyUserIds.clear();
    const now = new Date();
    // Single bulk UPDATE query for all active users instead of 5,500 individual UPDATE queries
    const CHUNK = 500;
    for (let i = 0; i < batchIds.length; i += CHUNK) {
      const slice = batchIds.slice(i, i + CHUNK);
      await this.prisma.user
        .updateMany({
          where: { id: { in: slice } },
          data: { lastActiveAt: now },
        })
        .catch(() => {});
    }
    // Prune stale entries older than 30 minutes to keep RAM bounded
    const cutoff = Date.now() - 30 * 60 * 1000;
    for (const [uid, ts] of this.lastSeenMap.entries()) {
      if (ts < cutoff) this.lastSeenMap.delete(uid);
    }
  }

  getLastSeenTs(userId: string, dbDate?: Date | null): number | null {
    const memTs = this.lastSeenMap.get(userId) || 0;
    const dbTs = dbDate ? new Date(dbDate).getTime() : 0;
    const best = Math.max(memTs, dbTs);
    return best > 0 ? best : null;
  }

  async heartbeat(userId: string) {
    const nowTs = Date.now();
    const isFirstSighting = !this.lastSeenMap.has(userId);
    this.lastSeenMap.set(userId, nowTs);
    this.dirtyUserIds.add(userId);
    // Write immediately only on first login heartbeat; subsequent heartbeats batch-flush every 45s
    if (isFirstSighting) {
      this.prisma.user
        .update({ where: { id: userId }, data: { lastActiveAt: new Date(nowTs) } })
        .catch(() => {});
    }
    return { status: 'online' as PresenceStatus, lastActiveAt: new Date(nowTs) };
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
      const effectiveLastActive = this.getLastSeenTs(u.id, u.lastActiveAt);
      const presence = computePresence(effectiveLastActive, now);
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
        lastActiveAt: effectiveLastActive ? new Date(effectiveLastActive) : u.lastActiveAt,
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
