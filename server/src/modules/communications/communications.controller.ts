import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CALL_OUTCOMES, CommunicationsService } from './communications.service';
import { WhatsappBotService } from './whatsapp-bot.service';
import { apiEnvelope } from '../../common/utils/crm.utils';

@ApiTags('WhatsApp Bot (Free QR Connect)')
@Controller('whatsapp/bot')
export class WhatsappBotController {
  constructor(private readonly botService: WhatsappBotService) {}

  @Get('status')
  getBotStatus(@Query('init') init?: string) {
    const shouldInit = init !== 'false';
    const status = this.botService.getStatus(shouldInit);
    return apiEnvelope(status, 'WhatsApp bot status fetched', status);
  }

  @Post('disconnect')
  async disconnectBot() {
    const res = await this.botService.disconnect();
    return apiEnvelope(res, res.message, res);
  }

  @Post('send')
  async sendDirectBotMessage(@Body() body: any) {
    const res = await this.botService.sendMessage(body.phone, body.message);
    return apiEnvelope(res, 'Direct WhatsApp message sent', res);
  }

  private extractUserId(req: any): string {
    if (req.user?.id) return req.user.id;
    if (req.user?.sub) return req.user.sub;
    const auth = String(req.headers?.authorization || req.headers?.Authorization || '');
    if (auth.startsWith('Bearer ')) {
      try {
        const token = auth.slice(7).trim();
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        if (payload?.sub || payload?.id) return payload.sub || payload.id;
      } catch {}
    }
    return req.query?.userId || req.body?.userId || 'default_counsellor';
  }

  // Multi-Device / Personal WhatsApp Endpoints for 500+ Managers, Counsellors & Admins
  @Get(['counsellor/status', 'user/status'])
  async getCounsellorStatus(@Req() req: any) {
    const userId = this.extractUserId(req);
    const status = await this.botService.getCounsellorWhatsapp(userId);
    return apiEnvelope(status, 'User WhatsApp status fetched', status);
  }

  @Post(['pair-code', 'counsellor/pair-phone', 'user/pair-phone', 'user/send-otp'])
  async requestCounsellorPairing(@Body() body: any, @Req() req: any) {
    const rawPhone = String(body.phone || body.phoneNumber || '').trim();
    const countryCode = String(body.countryCode || '91').replace(/\D/g, '') || '91';
    const cleanPhone = rawPhone.replace(/\D/g, '').slice(-10);
    if (cleanPhone.length !== 10) {
      throw new BadRequestException('Please enter a valid 10-digit phone number.');
    }

    const pairingCode = await this.botService.requestPairingCode(cleanPhone, countryCode);

    const result = {
      phone: cleanPhone,
      countryCode: `+${countryCode}`,
      displayNumber: `+${countryCode} ${cleanPhone.slice(0, 3)} ${cleanPhone.slice(3, 6)} ${cleanPhone.slice(6)}`,
      pairingCode,
      message: `Pairing code generated for +${countryCode} ${cleanPhone}. Enter this code in WhatsApp Linked Devices on your phone.`,
    };
    return apiEnvelope(result, result.message, result);
  }

  @Post(['counsellor/verify-otp', 'user/verify-otp'])
  async verifyCounsellorOtp(@Body() body: any, @Req() req: any) {
    const userId = this.extractUserId(req);
    const rawPhone = String(body.phone || body.phoneNumber || '').trim();
    const cleanPhone = rawPhone.replace(/\D/g, '').slice(-10);
    const inputOtp = String(body.otp || body.code || '').trim();

    let result: any;
    if (inputOtp) {
      result = await this.botService.verifyWhatsappLoginOtp(userId, cleanPhone, inputOtp);
    } else {
      result = await this.botService.saveCounsellorWhatsapp(userId, {
        phone: cleanPhone,
        method: 'PAIRING_CODE',
        pairingCode: body.pairingCode,
      });
    }

    return apiEnvelope(result, 'WhatsApp connected successfully!', result);
  }

  @Post(['counsellor/disconnect', 'user/disconnect'])
  async disconnectCounsellor(@Req() req: any) {
    const userId = this.extractUserId(req);
    const result = await this.botService.disconnectCounsellorWhatsapp(userId);
    return apiEnvelope(result, result.message, result);
  }

  @Post(['counsellor/send', 'user/send'])
  async sendCounsellorMessage(@Body() body: any, @Req() req: any) {
    const userId = this.extractUserId(req);
    const targetPhone = body.phone || body.toPhone || body.phoneNumber || '';
    const result = await this.botService.sendCounsellorMessage(
      userId,
      targetPhone,
      body.message || body.text || '',
      body.leadId,
    );
    return apiEnvelope(result, result.message, result);
  }

  // Budget-Based School Search & Direct WhatsApp Delivery
  @Get('budget-schools')
  async getBudgetSchools(@Req() req: any) {
    const budget = Number(req.query?.budget) || 400000;
    const schools = await this.botService.getSchoolsByBudget(budget);
    return apiEnvelope(schools, 'Schools matching budget fetched', { schools, count: schools.length });
  }

  @Post('send-budget-schools')
  async sendBudgetSchools(@Body() body: any, @Req() req: any) {
    const userId = this.extractUserId(req);
    const result = await this.botService.sendBudgetSchoolsMessage(userId, {
      parentPhone: body.phone || body.parentPhone || body.toPhone || body.parent_phone,
      budget: Number(body.budget || body.max_budget) || 400000,
      studentName: body.studentName,
      customMessage: body.message,
      leadId: body.leadId,
    });
    return apiEnvelope(result, 'Budget-matched school details sent to parent', result);
  }
}

@ApiTags('WhatsApp (Free wa.me)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly commService: CommunicationsService) {}

  @Get('templates')
  async getTemplates() {
    const templates = await this.commService.listTemplates();
    return apiEnvelope(templates, undefined, { templates });
  }

  @Roles('SUPER_ADMIN')
  @Post('templates')
  async createTemplate(@Body() body: any, @Req() req: any) {
    const template = await this.commService.createTemplate(body, req.user);
    return apiEnvelope(template, 'WhatsApp template created', { template });
  }

  @Roles('SUPER_ADMIN')
  @Put('templates/:id')
  async updateTemplate(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const template = await this.commService.updateTemplate(id, body, req.user);
    return apiEnvelope(template, 'WhatsApp template updated', { template });
  }

  @Post('generate-link')
  async generateLink(@Body() body: any, @Req() req: any) {
    const res = await this.commService.generateWhatsappLink(body, req.user);
    return apiEnvelope(res, 'wa.me link generated', res);
  }

  @Post('log')
  async confirmLog(@Body() body: any, @Req() req: any) {
    const res = await this.commService.confirmWhatsappSent(body, req.user);
    return apiEnvelope(res, 'WhatsApp activity confirmed', res);
  }

  @Roles('SUPER_ADMIN', 'SENIOR_MANAGER')
  @Get('log')
  async listLogs(@Req() req: any, @Query('lead_id') leadId?: string) {
    const logs = await this.commService.getWhatsappLogs(req.user, leadId);
    return apiEnvelope(logs, undefined, { logs });
  }
}

@ApiTags('Click-to-Call (Tel Protocol)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('calls')
export class CallsController {
  constructor(private readonly commService: CommunicationsService) {}

  @Get('outcomes')
  async getOutcomes() {
    return apiEnvelope(CALL_OUTCOMES, undefined, { outcomes: CALL_OUTCOMES });
  }

  @Get('dial-link/:lead_id')
  async dialLink(
    @Param('lead_id') leadId: string,
    @Query('force') force: string,
    @Req() req: any,
  ) {
    const res = await this.commService.getCallDialLink(leadId, req.user, force === 'true');
    return apiEnvelope(res, 'Dial link ready', res);
  }

  @Post('log')
  async logCall(@Body() body: any, @Req() req: any) {
    const log = await this.commService.logCallOutcome(body, req.user);
    return apiEnvelope(log, 'Call outcome logged', { callLog: log });
  }

  @Get('log/:lead_id')
  async getCallLogs(@Param('lead_id') leadId: string) {
    const logs = await this.commService.getCallLogsForLead(leadId);
    return apiEnvelope(logs, undefined, { logs });
  }
}

@ApiTags('Pending Logging Queue')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('pending-logging-queue')
export class PendingQueueController {
  constructor(private readonly commService: CommunicationsService) {}

  @Get()
  async list(@Req() req: any) {
    const items = await this.commService.listPendingQueue(req.user);
    return apiEnvelope(items, undefined, { items });
  }

  @Post(':id/resolve')
  async resolve(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const res = await this.commService.resolvePendingQueueItem(id, body, req.user);
    return apiEnvelope(res, 'Pending logging item resolved', res);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('communications')
export class CommunicationsLegacyController {
  constructor(private readonly commService: CommunicationsService) {}

  @Post('whatsapp')
  async legacyWhatsapp(@Body() body: any, @Req() req: any) {
    const res = await this.commService.confirmWhatsappSent(body, req.user);
    return apiEnvelope(res, 'WhatsApp message processed', res);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('whatsapp-templates')
export class WhatsappTemplatesAliasController {
  constructor(private readonly commService: CommunicationsService) {}

  @Get()
  async list() {
    const templates = await this.commService.listTemplates();
    return apiEnvelope(templates, undefined, { templates });
  }
}
