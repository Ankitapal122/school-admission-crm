import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import * as fs from 'fs';
import { Response } from 'express';
import { ReportKey, ReportsService } from './reports.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Reports (20 Endpoints)')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  private async serve(
    reportKey: ReportKey,
    query: any,
    user: any,
    res: Response,
  ) {
    const fmt = String(query?.format || 'json').toLowerCase();
    const isAsync = String(query?.async || '').toLowerCase() === 'true';
    if (isAsync || (fmt !== 'excel' && fmt !== 'xlsx' && fmt !== 'pdf')) {
      const result = await this.reportsService.handleReportRequest(
        reportKey,
        query,
        user,
      );
      return res.json(result);
    }

    const data = await this.reportsService.computeReportData(
      reportKey,
      query,
      user,
    );
    if (fmt === 'excel' || fmt === 'xlsx') {
      const buf = this.reportsService.buildExcelBuffer(reportKey, data);
      res.set({
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="report_${reportKey.replace('/', '_')}.xlsx"`,
        'Content-Length': buf.length,
      });
      return res.end(buf);
    }

    const pdf = await this.reportsService.buildPdfBuffer(reportKey, data);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="report_${reportKey.replace('/', '_')}.pdf"`,
      'Content-Length': pdf.length,
    });
    return res.end(pdf);
  }

  @Get('leads')
  leads(@Query() q: any, @Req() r: any, @Res() res: Response) {
    return this.serve('leads', q, r.user, res);
  }

  @Get('pipeline')
  pipeline(@Query() q: any, @Req() r: any, @Res() res: Response) {
    return this.serve('pipeline', q, r.user, res);
  }

  @Get('admissions')
  admissions(@Query() q: any, @Req() r: any, @Res() res: Response) {
    return this.serve('admissions', q, r.user, res);
  }

  @Get('school-wise')
  schoolWise(@Query() q: any, @Req() r: any, @Res() res: Response) {
    return this.serve('school-wise', q, r.user, res);
  }

  @Get('commission')
  commission(@Query() q: any, @Req() r: any, @Res() res: Response) {
    return this.serve('commission', q, r.user, res);
  }

  @Get('revenue')
  @Roles('super_admin')
  revenue(@Query() q: any, @Req() r: any, @Res() res: Response) {
    return this.serve('revenue', q, r.user, res);
  }

  @Get('performance/jr')
  perfJr(@Query() q: any, @Req() r: any, @Res() res: Response) {
    return this.serve('performance/jr', q, r.user, res);
  }

  @Get('performance/sr')
  @Roles('super_admin', 'manager')
  perfSr(@Query() q: any, @Req() r: any, @Res() res: Response) {
    return this.serve('performance/sr', q, r.user, res);
  }

  @Get('login-logout')
  @Roles('super_admin')
  loginLogout(@Query() q: any, @Req() r: any, @Res() res: Response) {
    return this.serve('login-logout', q, r.user, res);
  }

  @Get('audit')
  @Roles('super_admin')
  audit(@Query() q: any, @Req() r: any, @Res() res: Response) {
    return this.serve('audit', q, r.user, res);
  }

  @Get('follow-ups')
  followUps(@Query() q: any, @Req() r: any, @Res() res: Response) {
    return this.serve('follow-ups', q, r.user, res);
  }

  @Get('duplicates')
  @Roles('super_admin', 'manager')
  duplicates(@Query() q: any, @Req() r: any, @Res() res: Response) {
    return this.serve('duplicates', q, r.user, res);
  }

  @Get('source-conversion')
  sourceConversion(@Query() q: any, @Req() r: any, @Res() res: Response) {
    return this.serve('source-conversion', q, r.user, res);
  }

  @Get('counsellor-funnel')
  @Roles('super_admin', 'manager')
  counsellorFunnel(@Query() q: any, @Req() r: any, @Res() res: Response) {
    return this.serve('counsellor-funnel', q, r.user, res);
  }

  @Get('time-to-conversion')
  timeToConversion(@Query() q: any, @Req() r: any, @Res() res: Response) {
    return this.serve('time-to-conversion', q, r.user, res);
  }

  @Get('lost-lead-analysis')
  lostLead(@Query() q: any, @Req() r: any, @Res() res: Response) {
    return this.serve('lost-lead-analysis', q, r.user, res);
  }

  @Get('school-revenue')
  @Roles('super_admin')
  schoolRevenue(@Query() q: any, @Req() r: any, @Res() res: Response) {
    return this.serve('school-revenue', q, r.user, res);
  }

  @Get('whatsapp-activity')
  whatsappActivity(@Query() q: any, @Req() r: any, @Res() res: Response) {
    return this.serve('whatsapp-activity', q, r.user, res);
  }

  @Get('call-activity')
  callActivity(@Query() q: any, @Req() r: any, @Res() res: Response) {
    return this.serve('call-activity', q, r.user, res);
  }

  @Get('commission-reversal')
  @Roles('super_admin')
  commissionReversal(@Query() q: any, @Req() r: any, @Res() res: Response) {
    return this.serve('commission-reversal', q, r.user, res);
  }

  @Get('download/:jobId')
  downloadReport(@Param('jobId') jobId: string, @Res() res: Response) {
    const file = this.reportsService.getCachedReportFile(jobId);
    const stream = fs.createReadStream(file.filePath);
    res.set({
      'Content-Type': file.mime,
      'Content-Disposition': `attachment; filename="report_${jobId}.${file.ext}"`,
    });
    stream.pipe(res);
  }
}
