import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { AdmissionsService } from './admissions.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Applications & Admissions')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller(['applications', 'admissions'])
export class AdmissionsController {
  constructor(private readonly admissionsService: AdmissionsService) {}

  @Get()
  findAll(@Req() req: any, @Query() query: any) {
    return this.admissionsService.findAll(req.user, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.admissionsService.findOne(id, req.user);
  }

  @Post()
  create(@Body() body: any, @Req() req: any) {
    const isAdmissionsPath = String(req.originalUrl || '').includes('/admissions');
    return this.admissionsService.createAdmission(
      body,
      req.user,
      isAdmissionsPath ? 'admission_done' : 'applied',
    );
  }

  @Put(':id/stage')
  updateStagePut(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.admissionsService.updateStage(id, body, req.user);
  }

  @Patch(':id/stage')
  updateStage(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.admissionsService.updateStage(id, body, req.user);
  }

  @Put(':id/sub-stage')
  @Roles('super_admin', 'manager')
  updateSubStage(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.admissionsService.updateSubStage(
      id,
      body.subStage || body.sub_stage,
      req.user,
      body.version,
    );
  }

  @Patch(':id/sub-stage')
  @Roles('super_admin', 'manager')
  updateSubStagePatch(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.admissionsService.updateSubStage(
      id,
      body.subStage || body.sub_stage,
      req.user,
      body.version,
    );
  }

  @Post(':id/sub-stage')
  @Roles('super_admin', 'manager')
  updateSubStagePost(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.admissionsService.updateSubStage(
      id,
      body.subStage || body.sub_stage,
      req.user,
      body.version,
    );
  }

  @Post(':id/conference-call')
  conferenceCall(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.admissionsService.logConferenceCall(id, body, req.user);
  }

  @Post(':id/visit')
  visitAndRegistration(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.admissionsService.logVisitAndRegistration(id, body, req.user);
  }

  @Post(':id/select')
  @Roles('super_admin', 'manager')
  selection(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.admissionsService.logSelection(id, body, req.user);
  }

  @Post(':id/admission')
  @Roles('super_admin', 'manager')
  confirmAdmission(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.admissionsService.confirmChildAdmission(id, body, req.user);
  }

  @Post(':id/cancel')
  @Roles('super_admin', 'manager')
  cancel(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.admissionsService.cancelAdmission(id, body?.reason, req.user);
  }

  @Get(':id/receipt-pdf')
  async downloadReceiptPdf(@Param('id') id: string, @Res() res: Response) {
    const pdfBuffer = await this.admissionsService.generateAdmissionPdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="BoardingEdu_Receipt_${id}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }
}
