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

  async onModuleInit() {
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

    // Periodic maintenance sweep every 15 minutes (Pending logging 1h/4h/24h escalations + Weekly Monday 9 AM check)
    const sweepTimer = setInterval(() => {
      this.runPendingQueueEscalationSweep().catch(() => {});
      this.runScheduledMaintenanceChecks().catch(() => {});
    }, 15 * 60 * 1000);
    this.timers.push(sweepTimer);
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
   * Checks Monday 9 AM IST weekly Super Admin summary & daily follow-up reminder dispatch.
   */
  async runScheduledMaintenanceChecks() {
    const now = new Date();
    const ist = new Date(now.getTime() + 330 * 60 * 1000);
    // Monday (1) between 09:00 and 09:20 IST -> trigger weekly admin summary if not run today
    if (ist.getUTCDay() === 1 && ist.getUTCHours() === 9 && ist.getUTCMinutes() < 20) {
      const todayKey = ist.toISOString().slice(0, 10);
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
  }
}
