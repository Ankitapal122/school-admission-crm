import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { NotificationsService } from './notifications.service';
import { apiEnvelope } from '../../common/utils/crm.utils';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async list(
    @Req() req: any,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('limit') limit?: string,
  ) {
    const res = await this.notificationsService.listForUser(
      req.user.id,
      unreadOnly === 'true',
      Number(limit || 50),
    );
    return apiEnvelope(res, undefined, res);
  }

  @Get('unread-count')
  async unreadCount(@Req() req: any) {
    const res = await this.notificationsService.getUnreadCount(req.user.id);
    return apiEnvelope(res, undefined, res);
  }

  @Put('mark-all-read')
  async markAllRead(@Req() req: any) {
    const res = await this.notificationsService.markAllRead(req.user.id);
    return apiEnvelope(res, 'All notifications marked as read', res);
  }

  @Put(':id/read')
  async markRead(@Param('id') id: string, @Req() req: any) {
    const notification = await this.notificationsService.markRead(req.user.id, id);
    return apiEnvelope({ notification }, 'Notification marked as read', { notification });
  }

  @Get('preferences')
  async getPreferences(@Req() req: any) {
    const preferences = await this.notificationsService.getPreferences(req.user.id);
    return apiEnvelope(preferences, undefined, { preferences });
  }

  @Put('preferences')
  async updatePreferences(@Req() req: any, @Body() body: any) {
    const preferences = await this.notificationsService.updatePreferences(req.user.id, body);
    return apiEnvelope(preferences, 'Notification preferences updated', { preferences });
  }
}

@ApiTags('Push Notifications')
@Controller('push')
export class PushController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('vapid-public-key')
  async getVapidKey() {
    const { publicKey } = await this.notificationsService.ensureVapidKeys();
    return apiEnvelope({ publicKey, vapid_public_key: publicKey }, undefined, { publicKey });
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('subscribe')
  async subscribe(@Req() req: any, @Body() body: any) {
    const device = await this.notificationsService.subscribeDevice(req.user.id, body);
    return apiEnvelope({ device }, 'Device registered for push notifications', { device });
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('unsubscribe')
  async unsubscribe(@Req() req: any, @Body() body: any) {
    const res = await this.notificationsService.unsubscribeDevice(req.user.id, body);
    return apiEnvelope(res, 'Push subscription removed', res);
  }
}
