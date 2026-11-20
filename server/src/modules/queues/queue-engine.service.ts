import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as net from 'net';
import { Queue, Worker } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { matchingRoleVariants } from '../../common/utils/crm.utils';

export type QueueHandlerFn = (payload: any, jobId: string) => Promise<any>;

@Injectable()
export class QueueEngineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueEngineService.name);
  private redisAvailable = false;
  private queues = new Map<string, Queue>();
  private workers: Worker[] = [];
  private handlers = new Map<string, QueueHandlerFn>();
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  registerHandler(jobType: string, handler: QueueHandlerFn) {
    this.handlers.set(jobType, handler);
  }

  private async probeRedis(host: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let settled = false;
      const done = (ok: boolean) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(ok);
      };
      socket.setTimeout(600);
      socket.once('connect', () => done(true));
      socket.once('timeout', () => done(false));
      socket.once('error', () => done(false));
      socket.connect(port, host);
    });
  }

  onModuleInit() {
    // Run Redis probe asynchronously so HTTP port binds immediately on Render
    this.initRedisQueues().catch((err) => {
      this.logger.warn(`QueueEngine background init warning: ${err?.message || err}`);
    });

    // Periodic maintenance sweep every 15 minutes (Pending logging 1h/4h/24h escalations + Weekly Monday 9 AM check)
    const sweepTimer = setInterval(() => {
      this.runPendingQueueEscalationSweep().catch(() => {});
      this.runScheduledMaintenanceChecks().catch(() => {});
    }, 15 * 60 * 1000);
    this.timers.push(sweepTimer);
  }

  private async initRedisQueues() {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = Number(process.env.REDIS_PORT || 6379);
    const password = process.env.REDIS_PASSWORD || undefined;

    this.redisAvailable = await this.probeRedis(host, port);
    if (this.redisAvailable) {
      const connection = { host, port, password, maxRetriesPerRequest: null as any };
      const queueNames = [
        'reports',
        'scoring',
        'lifecycle',
        'integrity',
        'communications',
        'notifications',
      ];
      for (const name of queueNames) {
        try {
          const q = new Queue(name, {
            connection,
            defaultJobOptions: {
              attempts: 3,
              backoff: { type: 'exponential', delay: 2000 },
              removeOnComplete: 50,
              removeOnFail: 100,
            },
          });
          q.on('error', () => {});
          this.queues.set(name, q);

          const w = new Worker(
            name,
            async (job) => {
              return this.executeTrackedJob(job.data.jobRecordId, job.name, job.data.payload);
            },
            { connection },
          );
          w.on('error', () => {});
          this.workers.push(w);
        } catch (e: any) {
          this.logger.warn(`BullMQ queue "${name}" fallback mode: ${e.message}`);
        }
      }
      this.logger.log(`BullMQ connected to Redis (${host}:${port}) across 6 queues.`);
    } else {
      this.logger.log(
        `Redis unavailable at ${host}:${port}; QueueEngine running in PostgreSQL-tracked async mode.`,
      );
    }
  }

  async onModuleDestroy() {
    for (const t of this.timers) clearInterval(t);
    for (const w of this.workers) await w.close().catch(() => {});
    for (const q of this.queues.values()) await q.close().catch(() => {});
  }

  isRedisUp() {
    return this.redisAvailable;
  }

  async enqueueJob(options: {
    queueName: 'reports' | 'scoring' | 'lifecycle' | 'integrity' | 'communications' | 'notifications';
    jobType: string;
    payload?: any;
    userId?: string;
    runInline?: boolean;
  }) {
    const jobId = `${options.queueName}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const record = await this.prisma.backgroundJob.create({
      data: {
        jobId,
        queueName: options.queueName,
        jobType: options.jobType,
        userId: options.userId || null,
        status: 'waiting',
        progress: 0,
        payload: options.payload || {},
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const bullQueue = this.queues.get(options.queueName);
    if (this.redisAvailable && bullQueue && !options.runInline) {
      await bullQueue.add(options.jobType, {
        jobRecordId: jobId,
        payload: options.payload || {},
      });
    } else if (options.runInline) {
      await this.executeTrackedJob(jobId, options.jobType, options.payload || {});
    } else {
      setImmediate(() => {
        this.executeTrackedJob(jobId, options.jobType, options.payload || {}).catch(() => {});
      });
    }

    return this.getJobStatus(jobId);
  }

  async executeTrackedJob(jobId: string, jobType: string, payload: any) {
    await this.prisma.backgroundJob
      .update({
        where: { jobId },
        data: { status: 'active', progress: 25 },
      })
      .catch(() => {});

    try {
      const handler = this.handlers.get(jobType);
      let result: any = { ok: true, jobType, processedAt: new Date().toISOString() };
      if (handler) {
        result = await handler(payload, jobId);
      }
      const updated = await this.prisma.backgroundJob.update({
        where: { jobId },
        data: {
          status: 'completed',
          progress: 100,
          result: result || {},
          downloadUrl: result?.downloadUrl || null,
        },
      });

      // Notify user when a background report finishes generating with a download link
      if (jobType === 'GENERATE_REPORT' && updated.userId && result?.downloadUrl) {
        const reportLabel = String(result?.reportKey || payload?.reportKey || 'CRM')
          .replace(/[_/-]+/g, ' ')
          .toUpperCase();
        await this.notifications
          .notifyUser({
            userId: updated.userId,
            type: 'report_ready',
            title: `Report Ready: ${reportLabel}`,
            message: `Your background ${String(result?.format || 'file').toUpperCase()} report (${result?.rowCount ?? 0} rows) is ready to download.`,
            relatedEntityId: jobId,
            relatedEntityType: 'report',
            link: result.downloadUrl,
          })
          .catch(() => {});
      }

      return updated;
    } catch (e: any) {
      await this.prisma.backgroundJob
        .update({
          where: { jobId },
          data: { status: 'failed', progress: 100, errorText: e?.message || 'Job failed' },
        })
        .catch(() => {});
      throw e;
    }
  }

  async getJobStatus(jobId: string) {
    const job = await this.prisma.backgroundJob.findUnique({ where: { jobId } });
    if (!job) return null;
    return {
      jobId: job.jobId,
      job_id: job.jobId,
      type: job.jobType,
      queue: job.queueName,
      status: job.status,
      state: job.status,
      progress: job.progress,
      result: job.result,
      downloadUrl: job.downloadUrl,
      download_url: job.downloadUrl,
      expiresAt: job.expiresAt,
      expires_at: job.expiresAt,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  async getMyJobs(userId: string) {
    const jobs = await this.prisma.backgroundJob.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return jobs.map((j) => ({
      jobId: j.jobId,
      job_id: j.jobId,
      type: j.jobType,
      queue: j.queueName,
      status: j.status,
      state: j.status,
      progress: j.progress,
      downloadUrl: j.downloadUrl,
      expiresAt: j.expiresAt,
      createdAt: j.createdAt,
    }));
  }

  /**
   * 3-Layer Pending Logging Queue Escalation Sweep:
   * - >= 1h -> 1h reminder to counsellor (ageBucket = '1h_to_4h')
   * - >= 4h -> escalate to Manager (ageBucket = 'over_4h')
   * - >= 24h -> Red flag to Manager & Super Admin (ageBucket = 'over_24h', status = 'escalated')
   */
  async runPendingQueueEscalationSweep() {
    const now = Date.now();
    const pending = await this.prisma.pendingLoggingQueue.findMany({
      where: { status: { in: ['pending', 'escalated'] } },
      include: {
        lead: { select: { leadNumber: true, studentName: true } },
        user: { select: { id: true, fullName: true, managerId: true } },
      },
    });

    for (const item of pending) {
      const ageHours = (now - new Date(item.createdAt).getTime()) / (1000 * 60 * 60);
      if (ageHours >= 24 && !item.reminderSentAt24h) {
        await this.prisma.pendingLoggingQueue.update({
          where: { id: item.id },
          data: {
            ageBucket: 'over_24h',
            status: 'escalated',
            reminderSentAt24h: new Date(),
          },
        });
        await this.notifications.notifyRoles(['SUPER_ADMIN', 'SENIOR_MANAGER'], {
          type: 'pending_logging_alert',
          title: `RED FLAG: Unlogged ${item.actionType} (>24h)`,
          message: `${item.user?.fullName || 'Counsellor'} has not confirmed ${item.actionType} for lead ${item.lead?.leadNumber || item.leadId}.`,
          relatedEntityId: item.leadId,
          relatedEntityType: 'lead',
          link: `/leads/${item.leadId}`,
        });
      } else if (ageHours >= 4 && !item.reminderSentAt4h) {
        await this.prisma.pendingLoggingQueue.update({
          where: { id: item.id },
          data: {
            ageBucket: 'over_4h',
            reminderSentAt4h: new Date(),
          },
        });
        if (item.user?.managerId) {
          await this.notifications.notifyUser({
            userId: item.user.managerId,
            type: 'pending_logging_alert',
            title: `Manager Alert: Logging overdue (>4h)`,
            message: `${item.user.fullName} has pending ${item.actionType} confirmation for ${item.lead?.studentName || item.leadId}.`,
            relatedEntityId: item.leadId,
            relatedEntityType: 'lead',
          });
        }
      } else if (ageHours >= 1 && !item.reminderSentAt1h) {
        await this.prisma.pendingLoggingQueue.update({
          where: { id: item.id },
          data: {
            ageBucket: '1h_to_4h',
            reminderSentAt1h: new Date(),
          },
        });
        await this.notifications.notifyUser({
          userId: item.userId,
          type: 'pending_logging_alert',
          title: `Reminder: Please log outcome (${item.actionType})`,
          message: `You contacted ${item.lead?.studentName || 'parent'} over 1 hour ago. Confirm outcome to clear pending queue.`,
          relatedEntityId: item.leadId,
          relatedEntityType: 'lead',
        });
      }
    }
    return { checked: pending.length };
  }

  /**
   * Checks:
   * 1) Monday 9 AM IST weekly Super Admin summary (`weekly_report`)
   * 2) Daily 9 AM IST pending follow-up reminders (`follow_up_reminder`)
   * 3) Overdue follow-up escalation to Manager (`follow_up_overdue`)
   * 4) Suspended lead period-end reminders (`lead_suspended`)
   */
  async runScheduledMaintenanceChecks() {
    const now = new Date();
    const ist = new Date(now.getTime() + 330 * 60 * 1000);
    const todayKey = ist.toISOString().slice(0, 10);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 86_400_000);

    // 1. Monday (1) between 09:00 and 09:20 IST -> trigger weekly admin summary if not run today
    if (ist.getUTCDay() === 1 && ist.getUTCHours() === 9 && ist.getUTCMinutes() < 20) {
      const settingKey = `weekly_report_last_run`;
      const prev = await this.prisma.systemSetting.findUnique({ where: { key: settingKey } });
      if ((prev?.value as any)?.date !== todayKey) {
        await this.prisma.systemSetting.upsert({
          where: { key: settingKey },
          update: { value: { date: todayKey } },
          create: { key: settingKey, value: { date: todayKey }, category: 'reports' },
        });
        const admins = await this.prisma.user.findMany({
          where: { role: { in: matchingRoleVariants('SUPER_ADMIN') as any }, isActive: true, deletedAt: null },
        });
        for (const a of admins) {
          await this.notifications.notifyUser({
            userId: a.id,
            type: 'weekly_report',
            title: 'Weekly Monday Executive CRM Summary Ready',
            message: 'Automated Monday 9 AM IST executive summary across Leads, Pipeline & Commissions is ready.',
            link: '/reports',
          });
        }
      }
    }

    // 2. Daily 9 AM IST -> pending follow-up reminder to each counsellor (`follow_up_reminder`)
    if (ist.getUTCHours() === 9 && ist.getUTCMinutes() < 25) {
      const reminderKey = `follow_up_reminder_last_run`;
      const prevRem = await this.prisma.systemSetting.findUnique({ where: { key: reminderKey } });
      if ((prevRem?.value as any)?.date !== todayKey) {
        await this.prisma.systemSetting.upsert({
          where: { key: reminderKey },
          update: { value: { date: todayKey } },
          create: { key: reminderKey, value: { date: todayKey }, category: 'notifications' },
        });
        const todayFollowUps = await this.prisma.lead.findMany({
          where: {
            deletedAt: null,
            nextFollowUpDate: { gte: startOfToday, lt: endOfToday },
            status: { notIn: ['closed', 'merged', 'expired', 'disqualified', 'admission_done', 'LOST', 'MERGED'] },
            assignedCounsellorId: { not: null },
          },
          select: { id: true, assignedCounsellorId: true, studentName: true },
        });
        const byCounsellor = new Map<string, string[]>();
        for (const l of todayFollowUps) {
          if (!l.assignedCounsellorId) continue;
          const arr = byCounsellor.get(l.assignedCounsellorId) || [];
          arr.push(l.studentName);
          byCounsellor.set(l.assignedCounsellorId, arr);
        }
        for (const [counsellorId, names] of byCounsellor.entries()) {
          await this.notifications.notifyUser({
            userId: counsellorId,
            type: 'follow_up_reminder',
            title: `Daily Follow-up Reminder (${names.length} Due Today)`,
            message: `You have ${names.length} scheduled parent follow-up${names.length > 1 ? 's' : ''} today: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` +${names.length - 3} more` : ''}.`,
            link: '/follow-ups',
          });
        }
      }
    }

    // 3. Overdue follow-up escalation to Manager (`follow_up_overdue`) — deduped per lead per 24h
    const overdueLeads = await this.prisma.lead.findMany({
      where: {
        deletedAt: null,
        nextFollowUpDate: { lt: startOfToday },
        status: { notIn: ['closed', 'merged', 'expired', 'disqualified', 'admission_done', 'LOST', 'MERGED'] },
      },
      include: {
        assignedCounsellor: {
          select: {
            id: true,
            fullName: true,
            managerId: true,
            team: { select: { managerId: true } },
          },
        },
      },
      take: 50,
    });
    const cutoff24h = new Date(now.getTime() - 24 * 3600 * 1000);
    for (const lead of overdueLeads) {
      const targetManagerId =
        lead.assignedManagerId ||
        lead.assignedCounsellor?.managerId ||
        lead.assignedCounsellor?.team?.managerId ||
        null;
      if (!targetManagerId) continue;

      const alreadySent = await this.prisma.notification.findFirst({
        where: {
          userId: targetManagerId,
          type: 'follow_up_overdue',
          relatedEntityId: lead.id,
          createdAt: { gte: cutoff24h },
        },
        select: { id: true },
      });
      if (alreadySent) continue;

      const daysOverdue = Math.max(
        1,
        Math.floor((now.getTime() - new Date(lead.nextFollowUpDate!).getTime()) / 86_400_000),
      );
      const is30DayFlag = daysOverdue >= 30;
      await this.notifications.notifyUser({
        userId: targetManagerId,
        type: 'follow_up_overdue',
        title: is30DayFlag
          ? `30+ Days Overdue Flag (No Auto-Expire): ${lead.leadNumber}`
          : `Overdue Follow-up Escalation: ${lead.leadNumber}`,
        message: is30DayFlag
          ? `Follow-up for ${lead.studentName} (${lead.assignedCounsellor?.fullName || 'Unassigned'}) is ${daysOverdue} days overdue. Manager decision required (lead does not auto-expire).`
          : `Follow-up for ${lead.studentName} (${lead.assignedCounsellor?.fullName || 'Unassigned'}) is overdue since ${new Date(lead.nextFollowUpDate!).toLocaleDateString('en-IN')}.`,
        relatedEntityId: lead.id,
        relatedEntityType: 'lead',
        link: `/leads/${lead.id}`,
      });
    }

    // 4. Suspended lead period-end reminder (`lead_suspended`) — deduped per lead per 24h
    const endedSuspensions = await this.prisma.lead.findMany({
      where: {
        deletedAt: null,
        status: 'suspended',
        suspendedUntil: { lte: now },
      },
      include: {
        assignedCounsellor: {
          select: { id: true, fullName: true, managerId: true, team: { select: { managerId: true } } },
        },
      },
      take: 30,
    });
    for (const lead of endedSuspensions) {
      const recipients = new Set<string>();
      if (lead.assignedCounsellorId) recipients.add(lead.assignedCounsellorId);
      const mgrId =
        lead.assignedManagerId ||
        lead.assignedCounsellor?.managerId ||
        lead.assignedCounsellor?.team?.managerId;
      if (mgrId) recipients.add(mgrId);

      for (const uid of recipients) {
        const alreadySent = await this.prisma.notification.findFirst({
          where: {
            userId: uid,
            type: 'lead_suspended',
            relatedEntityId: lead.id,
            title: { contains: 'Suspend Period Ended' },
            createdAt: { gte: cutoff24h },
          },
          select: { id: true },
        });
        if (alreadySent) continue;
        await this.notifications.notifyUser({
          userId: uid,
          type: 'lead_suspended',
          title: `Suspend Period Ended: ${lead.leadNumber}`,
          message: `The suspension window for ${lead.studentName} has ended. If there is no response, a fresh 90-day lifecycle cycle begins.`,
          relatedEntityId: lead.id,
          relatedEntityType: 'lead',
          link: `/leads/${lead.id}`,
        });
      }
      // Restart fresh 90-day cycle after suspend window expires
      await this.prisma.lead
        .update({
          where: { id: lead.id },
          data: { expiryStatus: 'ACTIVE', suspendedUntil: null },
        })
        .catch(() => {});
    }
  }
}
