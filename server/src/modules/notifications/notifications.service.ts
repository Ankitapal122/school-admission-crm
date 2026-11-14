import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as webPush from 'web-push';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';
import { matchingRoleVariants } from '../../common/utils/crm.utils';

export interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  message: string;
  relatedEntityId?: string;
  relatedEntityType?: string;
  link?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private vapidConfigured = false;
  private vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';

  constructor(
    private prisma: PrismaService,
    private gateway: NotificationsGateway,
  ) {}

  async ensureVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      if (!this.vapidConfigured) {
        webPush.setVapidDetails(
          process.env.VAPID_SUBJECT || 'mailto:admin@boardingedu.com',
          process.env.VAPID_PUBLIC_KEY,
          process.env.VAPID_PRIVATE_KEY,
        );
        this.vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
        this.vapidConfigured = true;
      }
      return {
        publicKey: process.env.VAPID_PUBLIC_KEY,
        privateKey: process.env.VAPID_PRIVATE_KEY,
      };
    }

    const existing = await this.prisma.systemSetting.findUnique({ where: { key: 'vapid_keys' } });
    let keys = (existing?.value as { publicKey?: string; privateKey?: string }) || null;
    if (!keys?.publicKey || !keys?.privateKey) {
      keys = webPush.generateVAPIDKeys();
      await this.prisma.systemSetting.upsert({
        where: { key: 'vapid_keys' },
        update: { value: keys },
        create: {
          key: 'vapid_keys',
          value: keys,
          category: 'security',
          description: 'Auto-generated Web Push VAPID keys for PWA notifications',
        },
      });
    }
    if (!this.vapidConfigured) {
      try {
        webPush.setVapidDetails(
          'mailto:admin@boardingedu.com',
          keys.publicKey!,
          keys.privateKey!,
        );
        this.vapidPublicKey = keys.publicKey!;
        this.vapidConfigured = true;
      } catch (e: any) {
        this.logger.warn(`VAPID init warning: ${e.message}`);
      }
    }
    return { publicKey: keys.publicKey!, privateKey: keys.privateKey! };
  }

  async notifyUser(input: CreateNotificationInput) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        relatedEntityId: input.relatedEntityId || null,
        relatedEntityType: input.relatedEntityType || null,
        link: input.link || null,
      },
    });

    this.gateway.emitToUser(input.userId, 'notification', notification);

    // Deliver Web Push if user has pushEnabled & registered web subscriptions
    try {
      const pref = await this.prisma.notificationPreference.findUnique({
        where: { userId: input.userId },
      });
      if (!pref || pref.pushEnabled !== false) {
        const devices = await this.prisma.userDevice.findMany({
          where: { userId: input.userId, pushEnabled: true },
        });
        if (devices.length > 0) {
          await this.ensureVapidKeys();
          for (const dev of devices) {
            if (dev.subscriptionJson && typeof dev.subscriptionJson === 'object') {
              await webPush
                .sendNotification(
                  dev.subscriptionJson as any,
                  JSON.stringify({
                    title: input.title,
                    body: input.message,
                    type: input.type,
                    url: input.link || '/',
                  }),
                )
                .catch(async (err: any) => {
                  if (err?.statusCode === 410 || err?.statusCode === 404) {
                    await this.prisma.userDevice.delete({ where: { id: dev.id } }).catch(() => {});
                  }
                });
            }
          }
        }
      }
    } catch {
      // Non-fatal web push failure
    }

    return notification;
  }

  async notifyRoles(
    roles: string[],
    payload: Omit<CreateNotificationInput, 'userId'>,
  ) {
    const roleVariants = roles.flatMap((r) => matchingRoleVariants(r));
    const users = await this.prisma.user.findMany({
      where: {
        role: { in: roleVariants as any },
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    });
    const created = await Promise.all(
      users.map((u) => this.notifyUser({ ...payload, userId: u.id })),
    );
    return created;
  }

  async listForUser(userId: string, unreadOnly = false, limit = 50) {
    const notifications = await this.prisma.notification.findMany({
      where: {
        userId,
        ...(unreadOnly ? { isRead: false } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const unreadCount = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { notifications, unreadCount };
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { unread_count: count, unreadCount: count };
  }

  async markRead(userId: string, id: string) {
    const existing = await this.prisma.notification.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('Notification not found');
    }
    const updated = await this.prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
    this.gateway.emitToUser(userId, 'notification_read', { id });
    return updated;
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    this.gateway.emitToUser(userId, 'notifications_all_read', { userId });
    return { markedAllRead: true };
  }

  async getPreferences(userId: string) {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        followUpReminder: true,
        weeklyReport: true,
        mergeAlert: true,
        pushEnabled: false,
        commissionUpdates: true,
      },
    });
  }

  async updatePreferences(userId: string, body: any) {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      update: {
        followUpReminder:
          body.follow_up_reminder ?? body.followUpReminder ?? undefined,
        weeklyReport: body.weekly_report ?? body.weeklyReport ?? undefined,
        mergeAlert: body.merge_alert ?? body.mergeAlert ?? undefined,
        pushEnabled: body.push_enabled ?? body.pushEnabled ?? undefined,
        commissionUpdates:
          body.commission_updates ?? body.commissionUpdates ?? undefined,
      },
      create: {
        userId,
        followUpReminder: body.follow_up_reminder ?? body.followUpReminder ?? true,
        weeklyReport: body.weekly_report ?? body.weeklyReport ?? true,
        mergeAlert: body.merge_alert ?? body.mergeAlert ?? true,
        pushEnabled: body.push_enabled ?? body.pushEnabled ?? false,
        commissionUpdates: body.commission_updates ?? body.commissionUpdates ?? true,
      },
    });
  }

  async subscribeDevice(userId: string, body: any) {
    const subscription = body.subscription || body.subscription_json || null;
    const deviceToken =
      body.device_token ||
      body.deviceToken ||
      subscription?.endpoint ||
      `web_${userId}_${Date.now()}`;
    const device = await this.prisma.userDevice.upsert({
      where: { deviceToken },
      update: {
        userId,
        platform: body.platform || 'web',
        deviceName: body.device_name || body.deviceName || 'Web Browser',
        subscriptionJson: subscription,
        pushEnabled: true,
        lastActiveAt: new Date(),
      },
      create: {
        userId,
        deviceToken,
        platform: body.platform || 'web',
        deviceName: body.device_name || body.deviceName || 'Web Browser',
        subscriptionJson: subscription,
        pushEnabled: true,
        lastActiveAt: new Date(),
      },
    });
    await this.prisma.notificationPreference.upsert({
      where: { userId },
      update: { pushEnabled: true },
      create: { userId, pushEnabled: true },
    });
    return device;
  }

  async unsubscribeDevice(userId: string, body: any) {
    const deviceToken = body.device_token || body.deviceToken || body.endpoint;
    if (deviceToken) {
      await this.prisma.userDevice.deleteMany({
        where: { userId, deviceToken },
      });
    } else {
      await this.prisma.userDevice.updateMany({
        where: { userId },
        data: { pushEnabled: false },
      });
    }
    return { unsubscribed: true };
  }
}
