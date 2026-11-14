import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { CrmCoreService } from './crm-core.service';
import { LeadsService } from '../leads/leads.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DynamicRateLimitGuard, CrmRateLimit } from '../../common/guards/dynamic-rate-limit.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('CRM Core (Users, Roles, FollowUps, Settings, Import, Jobs, Audit)')
@ApiBearerAuth()
@Controller()
export class CrmCoreController {
  constructor(
    private readonly crmCoreService: CrmCoreService,
    private readonly leadsService: LeadsService,
  ) {}

  // ============================================================================
  // PROFILE & USERS MANAGEMENT (static /me & /team BEFORE :id)
  // ============================================================================
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Get('users/me')
  getMyProfile(@Req() req: any) {
    return this.crmCoreService.getMyProfile(req.user.id);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Put('users/me')
  updateMyProfile(@Body() body: any, @Req() req: any) {
    return this.crmCoreService.updateMyProfile(req.user.id, body);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Put('users/me/password')
  changeMyPassword(@Body() body: any, @Req() req: any) {
    return this.crmCoreService.changeMyPassword(
      req.user.id,
      body,
      req.user.sessionFamily,
    );
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin', 'manager')
  @Get('users/team/:managerId')
  getTeamUsers(@Param('managerId') managerId: string) {
    return this.crmCoreService.getTeamUsers(managerId);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin', 'manager')
  @Get('users')
  getUsers(@Query() query: any, @Req() req: any) {
    return this.crmCoreService.getUsers(query, req.user);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin')
  @Post('users')
  createUser(@Body() body: any, @Req() req: any) {
    return this.crmCoreService.createUser(body, req.user);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin', 'manager')
  @Get('users/:id')
  getUserById(@Param('id') id: string) {
    return this.crmCoreService.getUserById(id);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin')
  @Put('users/:id')
  updateUser(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.crmCoreService.updateUser(id, body, req.user);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin')
  @Patch('users/:id/toggle-status')
  toggleUserStatus(@Param('id') id: string, @Req() req: any) {
    return this.crmCoreService.toggleUserStatus(id, req.user);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin')
  @Put('users/:id/suspend')
  suspendUser(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.crmCoreService.suspendUserFnf(id, body, req.user);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin')
  @Post('users/:id/unlock')
  unlockUser(@Param('id') id: string, @Req() req: any) {
    return this.crmCoreService.unlockUser(id, req.user);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin')
  @Post('users/:id/force-logout')
  forceLogoutUser(@Param('id') id: string, @Req() req: any) {
    return this.crmCoreService.forceLogoutUser(id, req.user);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin')
  @Patch('users/:id/role')
  changeUserRole(
    @Param('id') id: string,
    @Body() body: { role: string },
    @Req() req: any,
  ) {
    return this.crmCoreService.changeUserRole(id, body.role, req.user);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin')
  @Put('users/:id/role')
  changeUserRolePut(
    @Param('id') id: string,
    @Body() body: { role: string },
    @Req() req: any,
  ) {
    return this.crmCoreService.changeUserRole(id, body.role, req.user);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin')
  @Post('users/:id/reset-password')
  resetPassword(
    @Param('id') id: string,
    @Body() body: { newPassword: string },
    @Req() req: any,
  ) {
    return this.crmCoreService.adminResetPassword(id, body.newPassword, req.user);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin')
  @Put('users/:id/reset-password')
  resetPasswordPut(
    @Param('id') id: string,
    @Body() body: { newPassword: string },
    @Req() req: any,
  ) {
    return this.crmCoreService.adminResetPassword(id, body.newPassword, req.user);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin', 'manager')
  @Get('users/:id/login-history')
  getLoginHistory(@Param('id') id: string) {
    return this.crmCoreService.getUserLoginHistory(id);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin')
  @Delete('users/:id')
  deleteUser(@Param('id') id: string, @Req() req: any) {
    return this.crmCoreService.softDeleteUser(id, req.user);
  }

  // ============================================================================
  // ROLES & PERMISSIONS MATRIX
  // ============================================================================
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin')
  @Get('roles')
  getRoles() {
    return this.crmCoreService.getRolesAndPermissions();
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin')
  @Put('roles/:role/permissions')
  updateRolePermissions(
    @Param('role') role: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    return this.crmCoreService.updateRolePermissions(role, body, req.user);
  }

  // ============================================================================
  // TEAMS MANAGEMENT
  // ============================================================================
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Get('teams')
  getTeams() {
    return this.crmCoreService.getTeams();
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin', 'manager')
  @Post('teams')
  createTeam(@Body() body: any, @Req() req: any) {
    return this.crmCoreService.createTeam(body, req.user);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin', 'manager')
  @Put('teams/:id')
  updateTeam(@Param('id') id: string, @Body() body: any) {
    return this.crmCoreService.updateTeam(id, body);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin', 'manager')
  @Patch('teams/:id/toggle-status')
  toggleTeamStatus(@Param('id') id: string) {
    return this.crmCoreService.toggleTeamStatus(id);
  }

  // ============================================================================
  // FOLLOW-UPS & TASKS (/follow-ups/* & legacy /followups)
  // ============================================================================
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Get('follow-ups/today')
  getFollowUpsToday(@Req() req: any) {
    return this.crmCoreService.getFollowUps(req.user, 'today');
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Get('follow-ups/overdue')
  getFollowUpsOverdue(@Req() req: any) {
    return this.crmCoreService.getFollowUps(req.user, 'overdue');
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Get(['follow-ups', 'followups'])
  getFollowUps(@Req() req: any) {
    return this.crmCoreService.getFollowUps(req.user, 'all');
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Post(['follow-ups', 'followups'])
  createFollowUp(@Body() body: any, @Req() req: any) {
    return this.crmCoreService.createFollowUp(body, req.user);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Put('follow-ups/:id/reschedule')
  rescheduleFollowUp(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    return this.crmCoreService.rescheduleFollowUp(id, body, req.user);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Put('follow-ups/:id/complete')
  completeFollowUp(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    return this.crmCoreService.completeFollowUp(id, body, req.user);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Get('tasks')
  getTasks(@Req() req: any) {
    return this.crmCoreService.getTasks(req.user);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Post('tasks')
  createTask(@Body() body: any, @Req() req: any) {
    return this.crmCoreService.createTask(body, req.user);
  }

  // ============================================================================
  // LEGACY DASHBOARD / AI ALIASES
  // ============================================================================
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Get('reports/dashboard-stats')
  getDashboardStats(@Req() req: any, @Query('previewRole') previewRole?: string) {
    return this.crmCoreService.getDashboardStats(req.user, previewRole);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Post('ai/recommend-schools')
  recommendSchools(@Body() body: any) {
    return this.leadsService.suggestSchools(body, body.sort_by || 'match_score', 15);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Post('ai/generate-message')
  generateMessage(@Body() body: any) {
    return this.crmCoreService.generateAiMessage(body);
  }

  // ============================================================================
  // UNIFIED SCORING / MATCHING WEIGHT ALIASES -> DELEGATE TO LeadsService
  // ============================================================================
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Get(['settings/lead-scoring-weights', 'scoring/weights'])
  getLeadScoringWeightsAlias() {
    return this.leadsService.getScoringCriteria();
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin')
  @Put(['settings/lead-scoring-weights', 'scoring/weights'])
  updateLeadScoringWeightsAlias(@Body() body: any, @Req() req: any) {
    return this.leadsService.updateScoringCriteria(body, req.user);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Get(['matching-weights', 'matching/weights'])
  getMatchingWeightsAlias() {
    return this.leadsService.getMatchingCriteria();
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin')
  @Put(['matching-weights', 'matching/weights'])
  updateMatchingWeightsAlias(@Body() body: any, @Req() req: any) {
    return this.leadsService.updateMatchingCriteria(body, req.user);
  }

  // ============================================================================
  // SYSTEM SETTINGS (static subpaths BEFORE :key)
  // ============================================================================
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Get('settings/rate-limits')
  getRateLimits() {
    return this.crmCoreService.getSettingByKey('rate_limits');
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin')
  @Put('settings/rate-limits')
  updateRateLimits(@Body() body: any, @Req() req: any) {
    return this.crmCoreService.putSystemSetting(
      'rate_limits',
      body.value ?? body,
      'security',
      'Dynamic rate limit configuration',
      req.user,
    );
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Get('settings/gst-tds')
  getGstTds() {
    return this.crmCoreService.getSettingByKey('gst_tds');
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin')
  @Put('settings/gst-tds')
  updateGstTds(@Body() body: any, @Req() req: any) {
    return this.crmCoreService.putSystemSetting(
      'gst_tds',
      body.value ?? body,
      'finance',
      'GST & TDS commission deduction rules',
      req.user,
    );
  }

  // BULK IMPORT (static /settings/import-excel/* BEFORE /settings/:key!)
  private extractUploadBuffer(file: any, body: any): Buffer | undefined {
    if (file?.buffer) return file.buffer;
    if (typeof body?.base64Data === 'string' && body.base64Data.trim()) {
      const b64 = body.base64Data.includes(',') ? body.base64Data.split(',')[1] : body.base64Data;
      return Buffer.from(b64, 'base64');
    }
    if (typeof body?.csvText === 'string' && body.csvText.trim()) {
      return Buffer.from(body.csvText, 'utf8');
    }
    return undefined;
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin', 'manager')
  @Post('settings/import-excel/preview')
  @UseInterceptors(FileInterceptor('file'))
  previewImport(
    @UploadedFile() file: any,
    @Body() body: any,
  ) {
    const entity = (body?.type || body?.entity || 'leads') === 'schools' ? 'schools' : 'leads';
    const fileBuf = this.extractUploadBuffer(file, body);
    return this.crmCoreService.previewBulkImport(
      fileBuf || body?.rows || [],
      file?.originalname || body?.fileName || body?.filename || 'import.xlsx',
      entity,
    );
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard, DynamicRateLimitGuard)
  @CrmRateLimit({ settingKey: 'bulk_import_per_hour', defaultLimit: 2, windowMs: 3600000 })
  @Roles('super_admin', 'manager')
  @Post('settings/import-excel/confirm')
  @UseInterceptors(FileInterceptor('file'))
  confirmImport(
    @UploadedFile() file: any,
    @Body() body: any,
    @Req() req: any,
  ) {
    const entity = (body?.type || body?.entity || 'leads') === 'schools' ? 'schools' : 'leads';
    const mode = body?.mode === 'strict' ? 'strict' : 'lenient';
    return this.crmCoreService.confirmBulkImport(
      {
        previewId: body?.previewId || body?.preview_id,
        fileBuffer: this.extractUploadBuffer(file, body),
        fileName: file?.originalname || body?.fileName || body?.filename || 'import.xlsx',
        rows: body?.rows,
        mode,
        entity,
      },
      req.user,
    );
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Get('settings/import-excel/errors/:token')
  downloadErrorCsv(@Param('token') token: string, @Res() res: Response) {
    const csv = this.crmCoreService.getImportErrorCsv(token);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="import_errors_${token}.csv"`,
    });
    res.send(csv);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard, DynamicRateLimitGuard)
  @CrmRateLimit({ settingKey: 'bulk_import_per_hour', defaultLimit: 2, windowMs: 3600000 })
  @Post(['bulk-import/:entity', 'import/:entity'])
  @UseInterceptors(FileInterceptor('file'))
  legacyBulkImport(
    @Param('entity') entityParam: string,
    @UploadedFile() file: any,
    @Body() body: any,
    @Req() req: any,
  ) {
    const entity = entityParam === 'schools' ? 'schools' : 'leads';
    const mode = body?.mode === 'strict' ? 'strict' : 'lenient';
    return this.crmCoreService.confirmBulkImport(
      {
        fileBuffer: this.extractUploadBuffer(file, body),
        fileName: file?.originalname || body?.fileName || body?.filename || 'import.xlsx',
        rows: body?.rows,
        mode,
        entity,
      },
      req.user,
    );
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Get('settings')
  getAllSettings() {
    return this.crmCoreService.getAllSettings();
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin')
  @Put('settings')
  updateSettingsRoot(@Body() body: any, @Req() req: any) {
    return this.crmCoreService.putSystemSetting(
      body.key || 'general_config',
      body.value ?? body,
      body.category || 'general',
      body.description,
      req.user,
    );
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Get('settings/:key')
  getSettingByKey(@Param('key') key: string) {
    return this.crmCoreService.getSettingByKey(key);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin')
  @Put('settings/:key')
  updateSettingByKey(
    @Param('key') key: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    return this.crmCoreService.putSystemSetting(
      key,
      body.value !== undefined ? body.value : body,
      body.category || 'general',
      body.description,
      req.user,
    );
  }

  // ============================================================================
  // WHATSAPP TEMPLATES WRITE ROUTES (GET /whatsapp-templates is in CommunicationsController)
  // ============================================================================
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin')
  @Post('whatsapp-templates')
  createWhatsappTemplate(@Body() body: any, @Req() req: any) {
    return this.crmCoreService.createWhatsappTemplate(body, req.user);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin')
  @Patch('whatsapp-templates/:id')
  updateWhatsappTemplate(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    return this.crmCoreService.updateWhatsappTemplate(id, body, req.user);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin')
  @Put('whatsapp-templates/:id')
  updateWhatsappTemplatePut(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    return this.crmCoreService.updateWhatsappTemplate(id, body, req.user);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin')
  @Delete('whatsapp-templates/:id')
  deleteWhatsappTemplate(@Param('id') id: string) {
    return this.crmCoreService.deleteWhatsappTemplate(id);
  }

  // ============================================================================
  // BACKGROUND JOBS, AUDIT LOG, S3 ARCHIVAL & DATA INTEGRITY
  // ============================================================================
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Get('jobs/my-jobs')
  listMyJobs(@Req() req: any) {
    return this.crmCoreService.listMyJobs(req.user.id);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Get('jobs/:id/status')
  getJobStatus(@Param('id') id: string) {
    return this.crmCoreService.getJobStatus(id);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin', 'manager')
  @Post('jobs/trigger')
  triggerJob(@Body() body: any, @Req() req: any) {
    return this.crmCoreService.triggerJob(
      body.type || body.jobType,
      body.payload || {},
      req.user,
    );
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin')
  @Get(['audit-log', 'audit-logs'])
  getAuditLogs(@Query() query: any) {
    return this.crmCoreService.getAuditLogs(query);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin')
  @Get('audit-log/:module')
  getAuditLogsByModule(@Param('module') moduleName: string, @Query() query: any) {
    return this.crmCoreService.getAuditLogs({ ...query, module: moduleName });
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin')
  @Post('audit/retention-check')
  @HttpCode(200)
  runAuditRetention(@Body() body: any) {
    return this.crmCoreService.runAuditRetentionCheck(body?.olderThanDays);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin')
  @Post('data-integrity/check')
  runDataIntegrityPost(@Query('async') asyncFlag: string, @Req() req: any) {
    return this.crmCoreService.runDataIntegrityCheck(req.user, asyncFlag === 'true');
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('super_admin')
  @Get('data-integrity/check')
  runDataIntegrity(@Query('async') asyncFlag: string, @Req() req: any) {
    return this.crmCoreService.runDataIntegrityCheck(req.user, asyncFlag === 'true');
  }
}
