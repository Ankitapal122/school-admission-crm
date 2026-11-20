import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  Res,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CrmRateLimit, DynamicRateLimitGuard } from '../../common/guards/dynamic-rate-limit.guard';
import { LeadsService } from './leads.service';
import { apiEnvelope } from '../../common/utils/crm.utils';
import { BLUEPRINT_MATCHING_KEYS } from './dto/weights-validation.dto';

@ApiTags('Leads & Lifecycle')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, DynamicRateLimitGuard)
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  async findAll(@Query() query: any, @Req() req: any, @Res({ passthrough: true }) res: Response) {
    const data = await this.leadsService.findAll(query, req.user);
    if (query.format === 'excel' || query.format === 'csv') {
      const buf = this.leadsService.buildLeadsExcelBuffer(data.leads);
      res.set({
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="leads_export_${Date.now()}.xlsx"`,
      });
      res.end(buf);
      return;
    }
    return apiEnvelope(data, undefined, data);
  }

  @Roles('SUPER_ADMIN', 'SENIOR_MANAGER')
  @Get('expired')
  async getExpired(@Req() req: any) {
    const leads = await this.leadsService.listLifecycleBucket('expired', req.user);
    return apiEnvelope(leads, undefined, { leads });
  }

  @Roles('SUPER_ADMIN', 'SENIOR_MANAGER')
  @Get('suspended')
  async getSuspended(@Req() req: any) {
    const leads = await this.leadsService.listLifecycleBucket('suspended', req.user);
    return apiEnvelope(leads, undefined, { leads });
  }

  @Roles('SUPER_ADMIN', 'SENIOR_MANAGER')
  @Get('reopened')
  async getReopened(@Req() req: any) {
    const leads = await this.leadsService.listLifecycleBucket('reopened', req.user);
    return apiEnvelope(leads, undefined, { leads });
  }

  @CrmRateLimit({ settingKey: 'lead_create_per_hour', defaultLimit: 50, windowMs: 3_600_000 })
  @Post()
  async create(@Body() body: any, @Req() req: any) {
    const result = await this.leadsService.createLead(body, req.user);
    return apiEnvelope(result, 'Lead created cleanly', result);
  }

  @Post('check-duplicate')
  async checkDuplicate(@Body() body: any) {
    const result = await this.leadsService.checkDuplicate(body);
    return apiEnvelope(result, undefined, result);
  }

  @Post('check-expired-match')
  async checkExpiredMatch(@Body() body: any) {
    const result = await this.leadsService.checkExpiredMatch(body);
    return apiEnvelope(result, undefined, result);
  }

  @Roles('SUPER_ADMIN', 'SENIOR_MANAGER')
  @CrmRateLimit({ settingKey: 'merge_per_hour', defaultLimit: 10, windowMs: 3_600_000 })
  @Post('merge')
  async merge(@Body() body: any, @Req() req: any) {
    const result = await this.leadsService.mergeLeads(body, req.user);
    return apiEnvelope(result, result.message, result);
  }

  @Roles('SUPER_ADMIN')
  @Post('recalculate-all-scores')
  async recalculateAll(@Req() req: any) {
    const job = await this.leadsService.triggerRecalculateAllScores(req.user);
    return apiEnvelope(job, 'Score recalculation job queued', { job });
  }

  @Post('activities/:actId/confirm')
  @HttpCode(200)
  async confirmActivity(@Param('actId') actId: string, @Body() body: any, @Req() req: any) {
    const activity = await this.leadsService.confirmActivity(actId, body, req.user);
    return apiEnvelope({ activity }, 'Activity confirmed', { activity });
  }

  // --- Parameterized :id routes below ---

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: any) {
    const lead = await this.leadsService.findOne(id, req.user);
    return apiEnvelope(lead, undefined, { lead });
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const lead = await this.leadsService.updateLead(id, body, req.user);
    return apiEnvelope(lead, 'Lead updated', { lead });
  }

  @Roles('SUPER_ADMIN', 'SENIOR_MANAGER')
  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: any) {
    const lead = await this.leadsService.softDeleteLead(id, req.user);
    return apiEnvelope(lead, 'Lead soft-deleted cleanly', { lead });
  }

  @Roles('SUPER_ADMIN')
  @Post(':id/restore')
  async restore(@Param('id') id: string, @Req() req: any) {
    const lead = await this.leadsService.restoreLead(id, req.user);
    return apiEnvelope(lead, 'Lead restored cleanly', { lead });
  }

  @Post(':id/remark')
  async addRemark(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const remark = await this.leadsService.addRemark(id, body.note || body.remark || body.content, req.user);
    return apiEnvelope(remark, 'Remark added', { remark });
  }

  @Post(':id/remarks')
  async addRemarkPlural(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const remark = await this.leadsService.addRemark(id, body.note || body.remark || body.content, req.user);
    return apiEnvelope(remark, 'Remark added', { remark });
  }

  @Get(':id/remarks')
  async getRemarks(@Param('id') id: string) {
    const remarks = await this.leadsService.getRemarks(id);
    return apiEnvelope(remarks, undefined, { remarks });
  }

  @Get(':id/history')
  async getHistory(@Param('id') id: string) {
    const history = await this.leadsService.getFullHistory(id);
    return apiEnvelope(history, undefined, { history });
  }

  @Roles('SUPER_ADMIN', 'SENIOR_MANAGER')
  @Get(':id/lifecycle-history')
  async getLifecycleHistory(@Param('id') id: string) {
    const data = await this.leadsService.getLifecycleStatus(id);
    return apiEnvelope(data, undefined, data);
  }

  @Get(':id/expiry-lifecycle')
  async getExpiryLifecycle(@Param('id') id: string) {
    const data = await this.leadsService.getLifecycleStatus(id);
    return apiEnvelope(data, undefined, data);
  }

  @Roles('SUPER_ADMIN', 'SENIOR_MANAGER')
  @Post(':id/reopen')
  async reopen(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const res = await this.leadsService.reopenLead(id, body || {}, req.user);
    return apiEnvelope(res, 'Lead reopened successfully', res);
  }

  @Roles('SUPER_ADMIN', 'SENIOR_MANAGER')
  @Post(':id/suspend')
  async suspend(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const res = await this.leadsService.suspendLead(id, body || {}, req.user);
    return apiEnvelope(res, 'Lead suspended', res);
  }

  @Roles('SUPER_ADMIN', 'SENIOR_MANAGER')
  @Post(':id/expire')
  async expire(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const res = await this.leadsService.expireLeadOrDecide(id, { action: 'EXPIRE', ...(body || {}) }, req.user);
    return apiEnvelope(res, 'Lead expired', res);
  }

  @Roles('SUPER_ADMIN', 'SENIOR_MANAGER')
  @Post(':id/extend-cycle')
  async extendCycle(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const res = await this.leadsService.expireLeadOrDecide(id, { action: 'EXTEND', ...(body || {}) }, req.user);
    return apiEnvelope(res, 'Lead cycle extended +90 days', res);
  }

  @Roles('SUPER_ADMIN', 'SENIOR_MANAGER')
  @Post(':id/expiry-decision')
  async expiryDecision(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const res = await this.leadsService.expireLeadOrDecide(id, body || {}, req.user);
    return apiEnvelope(res, 'Expiry decision applied', res);
  }

  @Roles('SUPER_ADMIN', 'SENIOR_MANAGER')
  @Post(':id/disqualify')
  async disqualify(@Param('id') id: string, @Body('reason') reason: string, @Req() req: any) {
    const lead = await this.leadsService.disqualifyLead(id, reason, req.user);
    return apiEnvelope(lead, 'Lead disqualified', { lead });
  }

  @Roles('SUPER_ADMIN', 'SENIOR_MANAGER')
  @Put(':id/status')
  async putStatus(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const lead = await this.leadsService.updateStatusStage(
      id,
      body.status || body.stage,
      req.user,
      body.version,
    );
    return apiEnvelope(lead, 'Status updated', { lead });
  }

  @Roles('SUPER_ADMIN', 'SENIOR_MANAGER')
  @Patch(':id/stage')
  async patchStage(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const lead = await this.leadsService.updateStatusStage(
      id,
      body.status || body.stage,
      req.user,
      body.version,
    );
    return apiEnvelope(lead, 'Stage updated', { lead });
  }

  @Roles('SUPER_ADMIN', 'SENIOR_MANAGER')
  @Put(':id/follow-up')
  async updateFollowUp(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const lead = await this.leadsService.updateFollowUpWithReason(
      id,
      body.follow_up_date || body.nextFollowUpDate || body.new_date,
      body.reason,
      req.user,
    );
    return apiEnvelope(lead, 'Follow-up date updated with audit reason', { lead });
  }

  @Roles('SUPER_ADMIN', 'SENIOR_MANAGER')
  @Post(':id/date-change')
  async dateChange(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const lead = await this.leadsService.updateFollowUpWithReason(
      id,
      body.new_date || body.follow_up_date || body.nextFollowUpDate,
      body.reason,
      req.user,
    );
    return apiEnvelope(lead, 'Date change recorded', { lead });
  }

  @Roles('SUPER_ADMIN', 'SENIOR_MANAGER')
  @Put(':id/assign')
  async assign(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const lead = await this.leadsService.assignLead(id, body || {}, req.user);
    return apiEnvelope(lead, 'Lead assigned', { lead });
  }

  @Get(':id/score')
  async getScore(@Param('id') id: string, @Req() req: any) {
    const lead = await this.leadsService.findOne(id, req.user);
    return apiEnvelope(
      { score: lead.score, breakdown: lead.scoreBreakdown },
      undefined,
      { score: lead.score, breakdown: lead.scoreBreakdown },
    );
  }

  @Roles('SUPER_ADMIN', 'SENIOR_MANAGER')
  @Post(':id/score/recalculate')
  async recalculateOne(@Param('id') id: string) {
    const res = await this.leadsService.recalculateSingleScore(id);
    return apiEnvelope(res, 'Lead score recalculated', res);
  }

  @Get([':id/shortlist', ':id/shortlists'])
  async getShortlist(@Param('id') id: string) {
    const shortlists = await this.leadsService.getShortlist(id);
    return apiEnvelope(shortlists, undefined, { shortlists });
  }

  @Roles('SUPER_ADMIN', 'SENIOR_MANAGER', 'COUNSELLOR')
  @Post(':id/shortlist')
  async addToShortlist(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const shortlist = await this.leadsService.addToShortlist(id, body, req.user);
    return apiEnvelope(shortlist, 'School shortlisted', { shortlist });
  }

  @Roles('SUPER_ADMIN', 'SENIOR_MANAGER', 'COUNSELLOR')
  @Put(':id/shortlist/:school_id')
  async updateShortlistNote(
    @Param('id') id: string,
    @Param('school_id') schoolId: string,
    @Body() body: any,
  ) {
    const shortlist = await this.leadsService.updateShortlistNote(id, schoolId, body);
    return apiEnvelope(shortlist, 'Shortlist note updated', { shortlist });
  }

  @Roles('SUPER_ADMIN', 'SENIOR_MANAGER', 'COUNSELLOR')
  @Delete(':id/shortlist/:school_id')
  async removeFromShortlist(@Param('id') id: string, @Param('school_id') schoolId: string) {
    const res = await this.leadsService.removeFromShortlist(id, schoolId);
    return apiEnvelope(res, 'Removed from shortlist', res);
  }

  @Post(':id/submit')
  async submitVerification(@Param('id') id: string, @Req() req: any) {
    const lead = await this.leadsService.submitForVerification(id, req.user);
    return apiEnvelope(lead, 'Lead submitted for verification', { lead });
  }

  @Roles('SUPER_ADMIN', 'SENIOR_MANAGER')
  @Post(':id/verify')
  async verify(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const lead = await this.leadsService.verifyLead(id, body.decision, body.returnRemarks, req.user);
    return apiEnvelope(lead, 'Lead verification recorded', { lead });
  }

  @Post(':id/activity')
  async logActivity(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const activity = await this.leadsService.logActivityConfirmation(id, body, req.user);
    return apiEnvelope({ activity }, 'Activity logged', { activity });
  }
}

@ApiTags('Lead Scoring')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('scoring')
export class ScoringController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get('criteria')
  async getCriteria() {
    const data = await this.leadsService.getScoringCriteria();
    return apiEnvelope(data, undefined, data);
  }

  @Roles('SUPER_ADMIN')
  @Put('criteria')
  async updateCriteria(@Body() body: any, @Req() req: any) {
    const data = await this.leadsService.updateScoringCriteria(body, req.user);
    return apiEnvelope(data, 'Scoring criteria weights updated cleanly (Total = 100)', data);
  }
}

@ApiTags('Auto-Suggest & 8-Criteria Matching')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('match')
export class MatchController {
  constructor(private readonly leadsService: LeadsService) {}

  @Roles('SUPER_ADMIN', 'SENIOR_MANAGER', 'COUNSELLOR')
  @Post('suggest')
  async suggest(@Body() body: any) {
    const data = await this.leadsService.suggestSchools(body, body?.sort_by || 'match_score', Number(body?.limit || 15));
    return apiEnvelope(data, undefined, data);
  }

  @Get('criteria')
  async getCriteria() {
    const data = await this.leadsService.getMatchingCriteria();
    return apiEnvelope(data, undefined, data);
  }

  @Roles('SUPER_ADMIN')
  @Put('criteria')
  async updateCriteria(@Body() body: any, @Req() req: any) {
    const data = await this.leadsService.updateMatchingCriteria(body, req.user);
    return apiEnvelope(data, 'Matching criteria updated cleanly (Total = 100)', data);
  }

  @Roles('SUPER_ADMIN')
  @Post('test')
  async testMatch(@Body() body: any) {
    const data = await this.leadsService.suggestSchools(body, 'match_score', 10);
    return apiEnvelope(data, 'Matching test completed', data);
  }

  @Roles('SUPER_ADMIN')
  @Get('criteria/list')
  async listAvailable() {
    return apiEnvelope(BLUEPRINT_MATCHING_KEYS, undefined, { criteria: BLUEPRINT_MATCHING_KEYS });
  }
}
