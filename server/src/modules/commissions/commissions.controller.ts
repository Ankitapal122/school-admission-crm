import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { CommissionsService } from './commissions.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Commissions')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller(['commissions', 'commission'])
export class CommissionsController {
  constructor(private readonly commissionsService: CommissionsService) {}

  @Get()
  getLedgerRoot(@Req() req: any, @Query() query: any) {
    return this.commissionsService.getLedger(req.user, query);
  }

  @Get('ledger')
  getLedger(@Req() req: any, @Query() query: any) {
    return this.commissionsService.getLedger(req.user, query);
  }

  @Get('summary')
  @Roles('super_admin', 'manager')
  getSummary(@Req() req: any, @Query() query: any) {
    return this.commissionsService.getSummary(query, req.user);
  }

  @Get('pending')
  getPending(@Req() req: any) {
    return this.commissionsService.getPendingPayouts(req.user);
  }

  @Get('school-wise')
  @Roles('super_admin', 'manager')
  getSchoolWise() {
    return this.commissionsService.getSchoolWiseSummary();
  }

  @Get('jr/:userId')
  getJrCommissions(@Param('userId') userId: string, @Req() req: any) {
    return this.commissionsService.getUserCommissions(userId, 'jr', req.user);
  }

  @Get('sr/:userId')
  @Roles('super_admin', 'manager')
  getSrCommissions(@Param('userId') userId: string, @Req() req: any) {
    return this.commissionsService.getUserCommissions(userId, 'sr', req.user);
  }

  @Post(':id/receive')
  @Roles('super_admin')
  receiveCommission(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.commissionsService.markAsReceived(id, body, req.user);
  }

  @Patch(':id/approve')
  @Roles('super_admin', 'manager')
  approveCommission(@Param('id') id: string, @Req() req: any) {
    return this.commissionsService.approveCommission(id, req.user);
  }

  @Post(':id/approve')
  @Roles('super_admin', 'manager')
  approveCommissionPost(@Param('id') id: string, @Req() req: any) {
    return this.commissionsService.approveCommission(id, req.user);
  }

  @Post(':id/payout')
  @Roles('super_admin')
  payoutCommission(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.commissionsService.markAsPaid(
      id,
      body.paymentReference || body.payment_reference || body.utrNumber,
      body.paymentMode || body.payment_mode || 'NEFT/RTGS/IMPS',
      req.user,
      body,
    );
  }

  @Patch(':id/pay')
  @Roles('super_admin')
  payCommissionPatch(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.commissionsService.markAsPaid(
      id,
      body.paymentReference || body.payment_reference || body.utrNumber,
      body.paymentMode || body.payment_mode || 'NEFT/RTGS/IMPS',
      req.user,
      body,
    );
  }

  @Post(':id/pay')
  @Roles('super_admin')
  payCommission(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.commissionsService.markAsPaid(
      id,
      body.paymentReference || body.payment_reference || body.utrNumber,
      body.paymentMode || body.payment_mode || 'NEFT/RTGS/IMPS',
      req.user,
      body,
    );
  }

  @Post(':id/reverse')
  @Roles('super_admin')
  reverseCommission(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.commissionsService.reverseCommission(
      id,
      body.reason,
      req.user,
      body.already_paid ?? body.alreadyPaid,
    );
  }

  @Patch(':id/reverse')
  @Roles('super_admin')
  reverseCommissionPatch(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.commissionsService.reverseCommission(
      id,
      body.reason,
      req.user,
      body.already_paid ?? body.alreadyPaid,
    );
  }

  @Post(':id/adjust')
  @Roles('super_admin')
  adjustCommission(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.commissionsService.createAdjustment(id, body, req.user);
  }
}
