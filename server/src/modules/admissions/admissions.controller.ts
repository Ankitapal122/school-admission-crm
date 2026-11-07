import { Controller, Post, Get, Body, Param, Res, UseGuards, Req } from '@nestjs/common';
import { AdmissionsService } from './admissions.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Response } from 'express';

@UseGuards(JwtAuthGuard)
@Controller('admissions')
export class AdmissionsController {
  constructor(private readonly admissionsService: AdmissionsService) {}

  @Get()
  async getAdmissions(@Req() req: any) {
    return this.admissionsService.findAll(req.user);
  }

  @Post()
  async createAdmission(@Body() body: any, @Req() req: any) {
    return this.admissionsService.createAdmission(body, req.user);
  }

  @Post(':id/cancel')
  async cancelAdmission(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Req() req: any,
  ) {
    return this.admissionsService.cancelAdmission(id, reason, req.user);
  }

  @Get(':id/receipt-pdf')
  async downloadReceiptPdf(@Param('id') id: string, @Res() res: Response) {
    const pdfBuffer = await this.admissionsService.generateAdmissionPdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="admission_receipt_${id}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }
}
