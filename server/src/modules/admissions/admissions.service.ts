import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CommissionsService } from '../commissions/commissions.service';
import { LeadStatus, Role, VerificationStatus } from '@prisma/client';
import * as puppeteer from 'puppeteer';

@Injectable()
export class AdmissionsService {
  constructor(
    private prisma: PrismaService,
    private commissionsService: CommissionsService,
  ) {}

  private formatAdmission(adm: any) {
    const counsellor = adm.counsellor;
    const manager = adm.manager || counsellor?.team?.manager;
    return {
      ...adm,
      _id: adm.id,
      admissionId: adm.admissionNumber,
      confirmedRevenue: adm.feeAgreed || 250000,
      feeAgreed: adm.feeAgreed || 250000,
      admissionDate: adm.confirmedAt || adm.createdAt,
      admissionStatus: adm.status || 'Admission Confirmed',
      proofDocument: adm.proofDocument || adm.receiptNumber,
      leadId: adm.lead
        ? {
            _id: adm.lead.id,
            id: adm.lead.id,
            leadId: adm.lead.leadNumber,
            studentName: adm.lead.studentName,
            studentId: {
              name: adm.lead.studentName,
              admissionClass: adm.lead.applyingForGrade,
            },
            parentId: {
              name: adm.lead.parentName,
              mobile: adm.lead.parentPhone,
            },
          }
        : null,
      schoolId: adm.school
        ? {
            _id: adm.school.id,
            id: adm.school.id,
            schoolId: adm.school.schoolCode,
            name: adm.school.name,
            city: adm.school.city,
          }
        : null,
      assignedCounsellor: counsellor
        ? {
            _id: counsellor.id,
            id: counsellor.id,
            name: counsellor.fullName,
            fullName: counsellor.fullName,
            employeeId: counsellor.employeeId,
          }
        : null,
      assignedManager: manager
        ? {
            _id: manager.id,
            id: manager.id,
            name: manager.fullName,
            fullName: manager.fullName,
          }
        : { name: 'Vikram Rawat' },
    };
  }

  async findAll(user?: any) {
    const where: any = {};
    if (user?.role === Role.COUNSELLOR) {
      where.counsellorId = user.id;
    }

    const admissions = await this.prisma.admission.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        school: true,
        lead: true,
        manager: true,
        counsellor: {
          include: { team: { include: { manager: true } } },
        },
        commissions: true,
      },
    });

    const formatted = admissions.map((a) => this.formatAdmission(a));
    return {
      success: true,
      admissions: formatted,
      data: formatted,
    };
  }

  async createAdmission(data: any, user?: any) {
    const lead = await this.prisma.lead.findFirst({
      where: {
        OR: [{ id: data.leadId }, { leadNumber: data.leadId }],
      },
      include: {
        assignedCounsellor: { include: { team: true } },
      },
    });

    if (!lead) throw new NotFoundException('Lead not found');

    const existing = await this.prisma.admission.findFirst({
      where: { leadId: lead.id, status: { not: 'Cancelled' } },
    });
    if (existing) {
      throw new BadRequestException('Admission is already confirmed for this lead');
    }

    let schoolId = data.schoolId || lead.preferredSchoolId;
    if (schoolId) {
      const schoolObj = await this.prisma.school.findFirst({
        where: { OR: [{ id: schoolId }, { schoolCode: schoolId }, { name: schoolId }] },
      });
      if (schoolObj) schoolId = schoolObj.id;
    }
    if (!schoolId) {
      const firstSchool = await this.prisma.school.findFirst({ orderBy: { rank: 'asc' } });
      schoolId = firstSchool?.id;
    }

    const schoolRecord = await this.prisma.school.findUnique({ where: { id: schoolId } });

    const admissionCount = await this.prisma.admission.count();
    const admissionNumber = `ADM-2026-${String(admissionCount + 1).padStart(3, '0')}`;
    const receiptNumber = data.proofDocument || `RCP-2026-${String(admissionCount + 1).padStart(4, '0')}`;
    const revenue = Number(data.confirmedRevenue || data.feeAgreed || 250000);
    const counsellorId = lead.assignedCounsellorId || user?.id;

    const admission = await this.prisma.admission.create({
      data: {
        admissionNumber,
        receiptNumber,
        leadId: lead.id,
        schoolId: schoolId!,
        counsellorId,
        managerId: lead.assignedManagerId || lead.assignedCounsellor?.team?.managerId || null,
        teamId: lead.teamId || lead.assignedCounsellor?.teamId || null,
        studentName: lead.studentName,
        parentName: lead.parentName,
        schoolName: schoolRecord?.name || 'The Doon School',
        admissionClass: lead.applyingForGrade || 'Class 6',
        academicYear: data.academicYear || '2026-27',
        feeAgreed: revenue,
        proofDocument: data.proofDocument || receiptNumber,
        status: 'Admission Confirmed',
        commissionGenerated: true,
      },
      include: {
        school: true,
        lead: true,
        manager: true,
        counsellor: {
          include: { team: { include: { manager: true } } },
        },
      },
    });

    const remarksJson = Array.isArray(lead.remarksJson) ? [...(lead.remarksJson as any[])] : [];
    remarksJson.push({
      author: user?.fullName || 'Manager',
      role: user?.role || 'manager',
      note: `Admission Confirmed (${admissionNumber}) - Fee Proof: ${receiptNumber}`,
      createdAt: new Date().toISOString(),
    });

    await this.prisma.lead.update({
      where: { id: lead.id },
      data: {
        status: LeadStatus.ADMISSION_CONFIRMED,
        verificationStatus: VerificationStatus.APPROVED,
        preferredSchoolId: schoolId,
        remarksJson,
      },
    });

    const commissions = await this.commissionsService.generateAdmissionCommissions(admission.id);

    if (counsellorId) {
      await this.prisma.notification.create({
        data: {
          userId: counsellorId,
          title: 'Admission Confirmed & Commission Generated',
          message: `Admission ${admissionNumber} confirmed for ${lead.studentName}. ₹5,000 commission credited to your ledger.`,
          type: 'SUCCESS',
        },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        userId: user?.id || counsellorId,
        userName: user?.fullName || 'Manager',
        userRole: user?.role || 'SENIOR_MANAGER',
        action: 'CONFIRM_ADMISSION',
        module: 'Admissions',
        entity: 'Admission',
        entityId: admission.id,
        details: {
          admissionNumber,
          studentName: lead.studentName,
          confirmedRevenue: revenue,
        },
      },
    });

    return {
      success: true,
      message: 'Admission confirmed & 3-way commission generated automatically!',
      admission: this.formatAdmission(admission),
      commissions,
    };
  }

  async cancelAdmission(id: string, reason?: string, user?: any) {
    const admission = await this.prisma.admission.findFirst({
      where: { OR: [{ id }, { admissionNumber: id }] },
      include: { commissions: true, lead: true },
    });
    if (!admission) throw new NotFoundException('Admission not found');

    const updated = await this.prisma.admission.update({
      where: { id: admission.id },
      data: {
        status: 'Cancelled',
        cancellationReason: reason || 'Admission Cancelled',
        cancelledAt: new Date(),
      },
      include: {
        school: true,
        lead: true,
        manager: true,
        counsellor: { include: { team: { include: { manager: true } } } },
      },
    });

    await this.prisma.lead.update({
      where: { id: admission.leadId },
      data: { status: LeadStatus.LOST },
    });

    for (const comm of admission.commissions) {
      if (comm.status !== 'REVERSED' && comm.amount > 0) {
        await this.commissionsService.reverseCommission(
          comm.id,
          reason || 'Admission Cancelled',
          user,
        );
      }
    }

    await this.prisma.auditLog.create({
      data: {
        userId: user?.id || null,
        userName: user?.fullName || 'Admin',
        userRole: user?.role || 'SUPER_ADMIN',
        action: 'CANCEL_ADMISSION',
        module: 'Admissions',
        entity: 'Admission',
        entityId: admission.id,
        details: { admissionNumber: admission.admissionNumber, reason },
        isSpecialFlag: true,
      },
    });

    return {
      success: true,
      message: 'Admission cancelled and all linked commissions reversed.',
      admission: this.formatAdmission(updated),
    };
  }

  async generateAdmissionPdf(admissionId: string): Promise<Buffer> {
    const admission = await this.prisma.admission.findFirst({
      where: { OR: [{ id: admissionId }, { admissionNumber: admissionId }] },
      include: {
        school: true,
        lead: true,
        counsellor: true,
      },
    });

    if (!admission) throw new NotFoundException('Admission not found');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #172B4D; }
          .header { text-align: center; border-bottom: 3px solid #123B70; padding-bottom: 20px; margin-bottom: 30px; }
          .title { font-size: 24px; font-weight: bold; color: #123B70; margin: 0; }
          .subtitle { font-size: 13px; color: #64748b; margin-top: 5px; }
          .badge { display: inline-block; background: #e0f2fe; color: #0284c7; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: bold; margin-top: 10px; }
          .grid { display: flex; justify-content: space-between; margin-bottom: 25px; }
          .box { width: 48%; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; }
          .box h3 { margin: 0 0 10px 0; font-size: 14px; color: #123B70; text-transform: uppercase; }
          .field { margin-bottom: 6px; font-size: 13px; }
          .field strong { color: #334155; }
          .table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          .table th { background: #123B70; color: white; text-align: left; padding: 10px; font-size: 12px; }
          .table td { border-bottom: 1px solid #e2e8f0; padding: 12px 10px; font-size: 13px; }
          .footer { margin-top: 50px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="title">BOARDINGEDU ADMISSION CONFIRMATION</h1>
          <div class="subtitle">Uttarakhand Boarding Schools Official Residential Placement Slip</div>
          <div class="badge">ADMISSION #: ${admission.admissionNumber} &bull; RECEIPT #: ${admission.receiptNumber}</div>
        </div>

        <div class="grid">
          <div class="box">
            <h3>Student & Parent Dossier</h3>
            <div class="field"><strong>Student Name:</strong> ${admission.lead.studentName}</div>
            <div class="field"><strong>Applying Grade:</strong> ${admission.lead.applyingForGrade}</div>
            <div class="field"><strong>Parent Name:</strong> ${admission.lead.parentName}</div>
            <div class="field"><strong>Contact:</strong> ${admission.lead.parentPhone}</div>
          </div>
          <div class="box">
            <h3>Institution & Placement</h3>
            <div class="field"><strong>School:</strong> ${admission.school.name}</div>
            <div class="field"><strong>City:</strong> ${admission.school.city}, Uttarakhand</div>
            <div class="field"><strong>Academic Session:</strong> ${admission.academicYear}</div>
            <div class="field"><strong>Assigned Counsellor:</strong> ${admission.counsellor.fullName}</div>
          </div>
        </div>

        <table class="table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Term</th>
              <th>Status</th>
              <th style="text-align: right;">Annual Fee (INR)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Residential Tuition & Boarding Fees</td>
              <td>${admission.academicYear}</td>
              <td><span style="color: #16a34a; font-weight: bold;">${admission.status.toUpperCase()}</span></td>
              <td style="text-align: right; font-weight: bold;">₹${admission.feeAgreed.toLocaleString('en-IN')}</td>
            </tr>
          </tbody>
        </table>

        <div class="footer">
          Generated automatically by Uttarakhand Boarding Schools CRM Core. Valid without physical signature.
          <br/>BoardingEdu (P) Ltd. &bull; Dehradun &bull; Mussoorie &bull; Nainital
        </div>
      </body>
      </html>
    `;

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
    });

    await browser.close();
    return Buffer.from(pdfBuffer);
  }
}
