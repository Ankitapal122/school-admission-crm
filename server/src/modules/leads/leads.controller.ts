import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role, LeadStatus } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  async getLeads(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('verificationStatus') verificationStatus?: string,
    @Query('priority') priority?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Req() req?: any,
  ) {
    return this.leadsService.findAll({
      search,
      status,
      verificationStatus,
      priority,
      user: req.user,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 100,
    });
  }

  @Get('kanban')
  async getKanbanPipeline(@Req() req: any) {
    return this.leadsService.getKanbanPipeline(req.user);
  }

  @Post('check-duplicate')
  async checkDuplicate(@Body() body: any) {
    return this.leadsService.checkDuplicate(body);
  }

  @Post()
  async createLead(@Body() body: any, @Req() req: any) {
    return this.leadsService.create(body, req.user);
  }

  @Patch(':id/stage')
  async updateStage(@Param('id') id: string, @Body('stage') stage: LeadStatus) {
    return this.leadsService.updateStage(id, stage);
  }

  @Roles(Role.SUPER_ADMIN, Role.SENIOR_MANAGER)
  @Patch(':id/verify')
  async verifyLead(
    @Param('id') id: string,
    @Body('action') action: string,
    @Body('remarks') remarks?: string,
    @Body('notes') notes?: string,
    @Body('status') status?: string,
    @Req() req?: any,
  ) {
    const act = action || status || 'APPROVE';
    return this.leadsService.verifyLead(id, act, remarks || notes, req.user);
  }

  @Roles(Role.SUPER_ADMIN, Role.SENIOR_MANAGER)
  @Patch(':id/reassign')
  async reassignLead(
    @Param('id') id: string,
    @Body('newCounsellorId') newCounsellorId: string,
    @Body('reason') reason?: string,
    @Req() req?: any,
  ) {
    return this.leadsService.reassignLead(id, newCounsellorId, reason, req.user);
  }

  @Post(':id/remarks')
  async addRemark(
    @Param('id') id: string,
    @Body('note') note: string,
    @Req() req?: any,
  ) {
    return this.leadsService.addRemark(id, note, req.user);
  }
}
