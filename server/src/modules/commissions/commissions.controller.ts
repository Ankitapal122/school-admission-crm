import { Controller, Get, Post, Patch, Param, Body, UseGuards, Req } from '@nestjs/common';
import { CommissionsService } from './commissions.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('commissions')
export class CommissionsController {
  constructor(private readonly commissionsService: CommissionsService) {}

  @Get()
  async getCommissions(@Req() req: any) {
    return this.commissionsService.getLedger(req.user.id, req.user.role);
  }

  @Get('ledger')
  async getLedger(@Req() req: any) {
    return this.commissionsService.getLedger(req.user.id, req.user.role);
  }

  @Get('rules')
  async getRules() {
    return this.commissionsService.getRules();
  }

  @Roles(Role.SUPER_ADMIN)
  @Post('rules')
  async createRule(@Body() body: any, @Req() req: any) {
    return this.commissionsService.createRule(body, req.user);
  }

  @Roles(Role.SUPER_ADMIN, Role.SENIOR_MANAGER)
  @Patch(':id/approve')
  async approveCommissionPatch(@Param('id') id: string, @Req() req: any) {
    return this.commissionsService.approveCommission(id, req.user);
  }

  @Roles(Role.SUPER_ADMIN, Role.SENIOR_MANAGER)
  @Post(':id/approve')
  async approveCommissionPost(@Param('id') id: string, @Req() req: any) {
    return this.commissionsService.approveCommission(id, req.user);
  }

  @Roles(Role.SUPER_ADMIN)
  @Patch(':id/pay')
  async markAsPaidPatch(
    @Param('id') id: string,
    @Body('paymentReference') paymentReference: string,
    @Body('paymentMode') paymentMode: string,
    @Req() req: any,
  ) {
    return this.commissionsService.markAsPaid(id, paymentReference, paymentMode, req.user);
  }

  @Roles(Role.SUPER_ADMIN)
  @Post(':id/pay')
  async markAsPaidPost(
    @Param('id') id: string,
    @Body('paymentReference') paymentReference: string,
    @Body('paymentMode') paymentMode: string,
    @Req() req: any,
  ) {
    return this.commissionsService.markAsPaid(id, paymentReference, paymentMode, req.user);
  }

  @Roles(Role.SUPER_ADMIN, Role.SENIOR_MANAGER)
  @Post(':id/reverse')
  async reverseCommission(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Req() req: any,
  ) {
    return this.commissionsService.reverseCommission(id, reason, req.user);
  }
}
