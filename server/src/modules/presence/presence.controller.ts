import { Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PresenceService } from './presence.service';

@ApiTags('Presence')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('presence')
export class PresenceController {
  constructor(private readonly presence: PresenceService) {}

  /** Any logged-in user pings this every ~30s while the CRM tab is active. */
  @Post('heartbeat')
  heartbeat(@Req() req: any) {
    return this.presence.heartbeat(req.user.id);
  }

  /** Admin: everyone. Manager: own team only. */
  @Roles('SUPER_ADMIN', 'SENIOR_MANAGER', 'super_admin', 'manager')
  @Get('team')
  team(@Query() query: any, @Req() req: any) {
    return this.presence.getTeam(req.user, query);
  }

  /** Admin: per-manager rollup (counsellors online/idle/offline). */
  @Roles('SUPER_ADMIN', 'super_admin')
  @Get('managers')
  managers(@Query() query: any) {
    return this.presence.getManagerRollup(query);
  }
}
