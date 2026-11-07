import { Controller, Get, Post, Put, Patch, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { CrmCoreService } from './crm-core.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller()
export class CrmCoreController {
  constructor(private readonly crmCoreService: CrmCoreService) {}

  // USERS
  @Get('users')
  async getUsers() {
    return this.crmCoreService.getUsers();
  }

  @Post('users')
  async createUser(@Body() body: any, @Req() req: any) {
    return this.crmCoreService.createUser(body, req.user);
  }

  @Patch('users/:id/toggle-status')
  async toggleUserStatus(@Param('id') id: string, @Req() req: any) {
    return this.crmCoreService.toggleUserStatus(id, req.user);
  }

  @Post('users/:id/reset-password')
  async adminResetPassword(
    @Param('id') id: string,
    @Body('newPassword') newPassword: string,
    @Req() req: any,
  ) {
    return this.crmCoreService.adminResetPassword(id, newPassword, req.user);
  }

  // TEAMS
  @Get('teams')
  async getTeams() {
    return this.crmCoreService.getTeams();
  }

  @Post('teams')
  async createTeam(@Body() body: any, @Req() req: any) {
    return this.crmCoreService.createTeam(body, req.user);
  }

  @Put('teams/:id')
  async updateTeam(@Param('id') id: string, @Body() body: any) {
    return this.crmCoreService.updateTeam(id, body);
  }

  @Patch('teams/:id/toggle-status')
  async toggleTeamStatus(@Param('id') id: string) {
    return this.crmCoreService.toggleTeamStatus(id);
  }

  // FOLLOW-UPS & TASKS
  @Get('followups')
  async getFollowUps(@Req() req: any) {
    return this.crmCoreService.getFollowUps(req.user);
  }

  @Post('followups')
  async createFollowUp(@Body() body: any, @Req() req: any) {
    return this.crmCoreService.createFollowUp(body, req.user);
  }

  @Get('tasks')
  async getTasks(@Req() req: any) {
    return this.crmCoreService.getTasks(req.user);
  }

  @Post('tasks')
  async createTask(@Body() body: any, @Req() req: any) {
    return this.crmCoreService.createTask(body, req.user);
  }

  // REPORTS & DASHBOARD STATS
  @Get('reports/dashboard-stats')
  async getDashboardStats(@Req() req: any, @Query('role') previewRole?: string) {
    return this.crmCoreService.getDashboardStats(req.user, previewRole);
  }

  // AI INTELLIGENCE
  @Post('ai/recommend-schools')
  async recommendSchools(@Body() body: any) {
    return this.crmCoreService.recommendSchools(body);
  }

  @Post('ai/generate-message')
  async generateMessage(@Body() body: any) {
    return this.crmCoreService.generateMessage(body);
  }

  // COMMUNICATIONS
  @Get('communications')
  async getCommunications() {
    return this.crmCoreService.getCommunications();
  }

  @Post('communications/whatsapp')
  async sendWhatsApp(@Body() body: any, @Req() req: any) {
    return this.crmCoreService.sendCommunication('WhatsApp', body, req.user);
  }

  @Post('communications/email')
  async sendEmail(@Body() body: any, @Req() req: any) {
    return this.crmCoreService.sendCommunication('Email', body, req.user);
  }

  // NOTIFICATIONS
  @Get('notifications')
  async getNotifications(@Req() req: any) {
    return this.crmCoreService.getNotifications(req.user.id);
  }

  @Patch('notifications/:id/read')
  async markNotificationRead(@Param('id') id: string) {
    return this.crmCoreService.markNotificationRead(id);
  }

  // SETTINGS, ROLES & AUDIT LOGS
  @Get('settings')
  async getSettings() {
    return this.crmCoreService.getSettings();
  }

  @Put('settings')
  async updateSettings(@Body() body: any, @Req() req: any) {
    return this.crmCoreService.updateSettings(body, req.user);
  }

  @Get('audit-logs')
  async getAuditLogs() {
    return this.crmCoreService.getAuditLogs();
  }

  @Get('roles')
  async getRoles() {
    return this.crmCoreService.getRolesAndPermissions();
  }
}
