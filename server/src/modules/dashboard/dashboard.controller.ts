import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { DashboardService } from './dashboard.service';
import { apiEnvelope, normalizeCanonicalRole } from '../../common/utils/crm.utils';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('jr')
  async jrDashboard(@Req() req: any) {
    const data = await this.dashboardService.getJrDashboard(req.user);
    return apiEnvelope(data, undefined, data);
  }

  @Roles('SUPER_ADMIN', 'SENIOR_MANAGER')
  @Get('sr')
  async srDashboard(@Req() req: any) {
    const data = await this.dashboardService.getSrDashboard(req.user);
    return apiEnvelope(data, undefined, data);
  }

  @Roles('SUPER_ADMIN')
  @Get('admin')
  async adminDashboard(@Req() req: any) {
    const data = await this.dashboardService.getAdminDashboard(req.user);
    return apiEnvelope(data, undefined, data);
  }

  @Get('pending-confirmations')
  async pendingConfirmations(@Req() req: any) {
    const data = await this.dashboardService.getPendingConfirmations(req.user);
    return apiEnvelope(data, undefined, data);
  }

  @Get('stats')
  async unifiedStats(@Req() req: any) {
    const canon = normalizeCanonicalRole(req.user.role);
    const data =
      canon === 'SUPER_ADMIN'
        ? await this.dashboardService.getAdminDashboard(req.user)
        : canon === 'SENIOR_MANAGER'
          ? await this.dashboardService.getSrDashboard(req.user)
          : await this.dashboardService.getJrDashboard(req.user);
    return apiEnvelope(data, undefined, data);
  }
}
