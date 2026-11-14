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
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CALL_OUTCOMES, CommunicationsService } from './communications.service';
import { apiEnvelope } from '../../common/utils/crm.utils';

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
