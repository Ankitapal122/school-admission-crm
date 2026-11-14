import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { SchoolsService } from './schools.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { apiEnvelope } from '../../common/utils/crm.utils';

@ApiTags('Schools (500 Partner Campus Master)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('schools')
export class SchoolsController {
  constructor(private readonly schoolsService: SchoolsService) {}

  @Get()
  async getSchools(@Query() query: any, @Res({ passthrough: true }) res: Response) {
    if (query.format === 'csv' || query.format === 'excel') {
      const buf = await this.schoolsService.exportSchools(query.format === 'csv' ? 'csv' : 'xlsx');
      res.set({
        'Content-Type':
          query.format === 'csv'
            ? 'text/csv'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="schools_500.${query.format === 'csv' ? 'csv' : 'xlsx'}"`,
      });
      res.end(buf);
      return;
    }
    const data = await this.schoolsService.findAll(query);
    return apiEnvelope(data, undefined, data);
  }

  @Roles('SUPER_ADMIN')
  @Get('export')
  async exportAll(@Query('format') format: string, @Res() res: Response) {
    const isCsv = format === 'csv';
    const buf = await this.schoolsService.exportSchools(isCsv ? 'csv' : 'xlsx');
    res.set({
      'Content-Type': isCsv
        ? 'text/csv'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="schools_export.${isCsv ? 'csv' : 'xlsx'}"`,
    });
    res.end(buf);
  }

  @Get(':id')
  async getSchool(@Param('id') id: string) {
    const school = await this.schoolsService.findOne(id);
    return apiEnvelope(school, undefined, { school });
  }

  @Roles('SUPER_ADMIN')
  @Post()
  async createSchool(@Body() body: any, @Req() req: any) {
    const school = await this.schoolsService.create(body, req.user);
    return apiEnvelope(school, 'School created cleanly', { school });
  }

  @Roles('SUPER_ADMIN')
  @Put(':id')
  async updateSchool(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const school = await this.schoolsService.update(id, body, req.user);
    return apiEnvelope(school, 'School updated cleanly', { school });
  }

  @Roles('SUPER_ADMIN')
  @Delete(':id')
  async deleteSchool(@Param('id') id: string, @Req() req: any) {
    const school = await this.schoolsService.softDelete(id, req.user);
    return apiEnvelope(school, 'School soft-deleted cleanly', { school });
  }

  @Roles('SUPER_ADMIN')
  @Post(':id/check-active-applications')
  async checkActiveApps(@Param('id') id: string) {
    const data = await this.schoolsService.checkActiveApplications(id);
    return apiEnvelope(data, undefined, data);
  }

  @Get(':id/commission')
  async getCommissionRates(@Param('id') id: string) {
    const s = await this.schoolsService.findOne(id);
    const data = {
      schoolCode: s.schoolCode,
      name: s.name,
      company_commission: s.defaultCommission,
      jr_commission: s.jrCommission,
      sr_commission: s.srCommission,
      net_profit: s.netProfit,
      payment_terms_days: s.paymentTermsDays,
    };
    return apiEnvelope(data, undefined, data);
  }

  @Roles('SUPER_ADMIN')
  @Put(':id/commission')
  async updateCommissionRates(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const school = await this.schoolsService.update(id, body, req.user);
    return apiEnvelope(school, 'School commission rates updated', { school });
  }
}
