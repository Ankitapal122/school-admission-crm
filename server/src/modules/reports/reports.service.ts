import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../../prisma/prisma.service';
import { QueueEngineService } from '../queues/queue-engine.service';
import {
  apiEnvelope,
  sanitizeSpreadsheetCell,
  toBlueprintRole,
} from '../../common/utils/crm.utils';

function formatExcelDate(d?: Date | string | null): string {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '—';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = String(date.getDate()).padStart(2, '0');
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

function autoFitColumns(rows: any[]) {
  if (!rows || !rows.length) return [];
  const colWidths: Record<string, number> = {};
  const keys = Object.keys(rows[0]);
  for (const key of keys) {
    colWidths[key] = key.length;
  }
  for (const row of rows) {
    for (const key of keys) {
      const val = row[key];
      const len = val !== null && val !== undefined ? String(val).length : 0;
      if (len > colWidths[key]) {
        colWidths[key] = Math.min(len, 45);
      }
    }
  }
  return keys.map((k) => ({ wch: Math.max(colWidths[k] + 3, 12) }));
}

export type ReportKey =
  | 'leads'
  | 'pipeline'
  | 'admissions'
  | 'full-admission-process'
  | 'school-wise'
  | 'commission'
  | 'revenue'
  | 'performance/jr'
  | 'performance/sr'
  | 'login-logout'
  | 'audit'
  | 'follow-ups'
  | 'duplicates'
  | 'source-conversion'
  | 'counsellor-funnel'
  | 'time-to-conversion'
  | 'lost-lead-analysis'
  | 'school-revenue'
  | 'whatsapp-activity'
  | 'call-activity'
  | 'commission-reversal';

@Injectable()
export class ReportsService implements OnModuleInit {
  private readonly cacheDir = path.join(process.cwd(), 'reports_cache');

  constructor(
    private prisma: PrismaService,
    private queueEngine: QueueEngineService,
  ) {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  onModuleInit() {
    this.queueEngine.registerHandler('GENERATE_REPORT', async (payload, jobId) => {
      const { reportKey, query, user } = payload;
      const format = String(query?.format || 'json').toLowerCase();
      const data = await this.computeReportData(reportKey, query || {}, user);

      let ext = 'json';
      let mime = 'application/json';
      let outBuf: Buffer;

      if (format === 'excel' || format === 'xlsx') {
        ext = 'xlsx';
        mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        outBuf = this.buildExcelBuffer(reportKey, data);
      } else if (format === 'pdf') {
        ext = 'pdf';
        mime = 'application/pdf';
        outBuf = await this.buildPdfBuffer(reportKey, data);
      } else {
        outBuf = Buffer.from(JSON.stringify(data, null, 2));
      }

      const filePath = path.join(this.cacheDir, `${jobId}.${ext}`);
      fs.writeFileSync(filePath, outBuf);
      return {
        reportKey,
        format: ext,
        mime,
        rowCount: Array.isArray(data.rows) ? data.rows.length : 1,
        downloadUrl: `/api/reports/download/${jobId}`,
      };
    });
  }

  private buildDateWhere(query: any, field = 'createdAt') {
    const cond: any = {};
    if (query.date_from) cond.gte = new Date(query.date_from);
    if (query.date_to) {
      const end = new Date(query.date_to);
      if (String(query.date_to).length <= 10) end.setHours(23, 59, 59, 999);
      cond.lte = end;
    }
    return Object.keys(cond).length ? { [field]: cond } : {};
  }

  private async scopeLeadWhere(query: any, user?: any) {
    const role = toBlueprintRole(user?.role);
    const where: any = { deletedAt: null, ...this.buildDateWhere(query, 'createdAt') };
    if (query.school_id || query.schoolId) {
      where.preferredSchoolId = query.school_id || query.schoolId;
    }
    if (role === 'jr_counsellor' && user?.id) {
      where.assignedCounsellorId = user.id;
    } else if (role === 'manager' && user?.id) {
      const teamMembers = await this.prisma.user.findMany({
        where: { OR: [{ managerId: user.id }, { id: user.id }], deletedAt: null },
        select: { id: true },
      });
      where.OR = [
        { assignedManagerId: user.id },
        { assignedCounsellorId: { in: teamMembers.map((m) => m.id) } },
      ];
    } else if (query.counsellor_id || query.counsellorId) {
      where.assignedCounsellorId = query.counsellor_id || query.counsellorId;
    }
    return where;
  }

  async handleReportRequest(reportKey: ReportKey, query: any = {}, user?: any) {
    const asyncMode = String(query.async || '').toLowerCase() === 'true';
    if (asyncMode) {
      const job = await this.queueEngine.enqueueJob({
        queueName: 'reports',
        jobType: 'GENERATE_REPORT',
        payload: { reportKey, query, user },
        userId: user?.id,
      });
      return apiEnvelope(job, `Async report job queued (${reportKey})`, {
        async: true,
        job_id: job?.jobId,
        jobId: job?.jobId,
      });
    }

    const report = await this.computeReportData(reportKey, query, user);
    return {
      success: true,
      reportKey,
      format: 'json',
      ...report,
      data: report,
    };
  }

  async computeReportData(reportKey: ReportKey, query: any = {}, user?: any): Promise<any> {
    const role = toBlueprintRole(user?.role);

    switch (reportKey) {
      case 'leads': {
        const where = await this.scopeLeadWhere(query, user);
        const leads = await this.prisma.lead.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          include: {
            assignedCounsellor: { select: { fullName: true, employeeId: true } },
            assignedManager: { select: { fullName: true } },
            applications: {
              select: {
                admissionNumber: true,
                schoolName: true,
                stage: true,
              },
            },
          },
        });
        const byStatus: Record<string, number> = {};
        const bySource: Record<string, number> = {};
        const byCity: Record<string, number> = {};
        for (const l of leads) {
          byStatus[l.status] = (byStatus[l.status] || 0) + 1;
          const src = l.leadSource || 'call';
          bySource[src] = (bySource[src] || 0) + 1;
          const city = l.city || 'Unknown';
          byCity[city] = (byCity[city] || 0) + 1;
        }
        // Deduplicate leads by unique leadNumber / id
        const seen = new Set<string>();
        const uniqueLeads: any[] = [];
        for (const l of leads) {
          const key = (l.leadNumber || l.id || '').trim().toUpperCase();
          if (key && !seen.has(key)) {
            seen.add(key);
            uniqueLeads.push(l);
          }
        }

        const rows = uniqueLeads.map((l) => {
          let primaryMobile = l.parentPhone || '';
          const digits = primaryMobile.replace(/\D/g, '');
          if (digits.length === 10) primaryMobile = `+91${digits}`;
          else if (digits.length === 12 && digits.startsWith('91')) primaryMobile = `+${digits}`;

          let altMobile = l.alternateMobile || '—';
          if (altMobile !== '—') {
            const altDigits = altMobile.replace(/\D/g, '');
            if (altDigits.length === 10) altMobile = `+91${altDigits}`;
            else if (altDigits.length === 12 && altDigits.startsWith('91')) altMobile = `+${altDigits}`;
          }

          let guardianMobile = l.guardianMobile || '—';
          if (guardianMobile !== '—') {
            const gDigits = guardianMobile.replace(/\D/g, '');
            if (gDigits.length === 10) guardianMobile = `+91${gDigits}`;
            else if (gDigits.length === 12 && gDigits.startsWith('91')) guardianMobile = `+${gDigits}`;
          }

          return {
            'LEAD ID': l.leadNumber,
            'ACADEMIC YEAR': l.academicYear || '2026-27',
            'STUDENT NAME': l.studentName,
            "FATHER'S NAME": l.fatherName || l.parentName || '—',
            "FATHER'S OCCUPATION": l.fatherOccupation || '—',
            "MOTHER'S NAME": l.motherName || '—',
            "MOTHER'S OCCUPATION": l.motherOccupation || '—',
            'GUARDIAN NAME': l.guardianName || '—',
            'GUARDIAN MOBILE': guardianMobile,
            'MOBILE PRIMARY': primaryMobile,
            'MOBILE ALT': altMobile,
            'WHATSAPP NUMBER': l.whatsappNumber || primaryMobile,
            'PARENT EMAIL': l.parentEmail || '—',
            'GENDER': l.studentGender || '—',
            'DOB': formatExcelDate(l.studentDob),
            'CURRENT GRADE': l.currentGrade || '—',
            'APPLYING CLASS': l.applyingForGrade || (l.classGrade ? `Class ${l.classGrade}` : '—'),
            'RESIDENT CITY': l.city || '—',
            'PREFERRED LOCATION': l.preferredLocation || '—',
            'PREFERRED BOARD': l.preferredBoard || '—',
            'SCHOOL TYPE PREFERENCE': l.boardingPreference || 'Boarding',
            'ANNUAL BUDGET': l.annualBudget || (l.budgetMax ? `₹${(l.budgetMax / 100000).toFixed(1)} Lakhs` : '—'),
            'GENUINE LEAD?': l.isGenuine ? 'Yes (Genuine)' : 'No (Junk)',
            'PARENT REQUIREMENTS': l.parentRequirements || '—',
            'STATUS': l.status,
            'PRIORITY': l.priority || 'MEDIUM',
            'LEAD SCORE': l.score || 0,
            'ASSIGNED COUNSELLOR': l.assignedCounsellor?.fullName || 'Unassigned',
            'ASSIGNED MANAGER': l.assignedManager?.fullName || 'Unassigned',
            'APPLICATIONS': l.applications?.map((a: any) => `${a.admissionNumber} (${a.schoolName || 'School'})`).join('; ') || 'None',
            'DPDP CONSENT': l.dpdpConsent ? 'Consented' : 'Pending',
            'CREATED AT': formatExcelDate(l.createdAt),
          };
        });

        return {
          title: 'Student Leads Master Directory',
          summary: { total: uniqueLeads.length, byStatus, bySource, byCity },
          rows,
        };
      }

      case 'pipeline': {
        const where = await this.scopeLeadWhere(query, user);
        const leads = await this.prisma.lead.findMany({ where, select: { status: true, score: true } });
        const stages = new Map<string, number>();
        for (const l of leads) {
          stages.set(l.status, (stages.get(l.status) || 0) + 1);
        }
        const rows = Array.from(stages.entries()).map(([stage, count]) => ({
          Stage: stage,
          Count: count,
          Percentage: leads.length ? Number(((count / leads.length) * 100).toFixed(1)) : 0,
        }));
        return {
          title: '12-Stage Pipeline Funnel Report',
          summary: { totalLeads: leads.length, stagesCount: rows.length },
          rows,
        };
      }

      case 'admissions': {
        const where: any = { deletedAt: null, ...this.buildDateWhere(query, 'createdAt') };
        if (role === 'jr_counsellor' && user?.id) where.counsellorId = user.id;
        if (query.school_id) where.schoolId = query.school_id;
        if (query.counsellor_id) where.counsellorId = query.counsellor_id;

        const apps = await this.prisma.admission.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          include: {
            lead: { select: { leadNumber: true, studentName: true } },
            school: { select: { schoolCode: true, name: true, city: true } },
            counsellor: { select: { fullName: true } },
            commissions: { select: { status: true } },
          },
        });
        const bySubStage: Record<string, number> = {};
        let totalFeeAgreed = 0;
        for (const a of apps) {
          bySubStage[a.subStage] = (bySubStage[a.subStage] || 0) + 1;
          totalFeeAgreed += Number(a.feeAgreed || 0);
        }
        return {
          title: 'Sheet 3: Applications & Admissions Master',
          summary: { totalApplications: apps.length, bySubStage, totalFeeAgreed },
          rows: apps.map((a) => {
            const commStatus = a.commissions?.[0]?.status;
            let commissionDisplay = a.commissionGenerated ? 'Yes' : 'No';
            if (commStatus === 'reversed' || commStatus === 'REVERSED') {
              commissionDisplay = 'Reversed';
            }

            return {
              'ID': a.id,
              'APP ID': a.admissionNumber,
              'LEAD ID': a.lead?.leadNumber || a.leadId.slice(0, 8),
              'SCHOOL ID': a.school?.schoolCode || a.schoolId.slice(0, 6),
              'STUDENT NAME': a.studentName || a.lead?.studentName || '',
              'SCHOOL NAME': a.school?.name || a.schoolName || '',
              'STAGE': a.stage === 'admission_done' ? 'Admission Done' : a.stage === 'selected' ? 'Selected' : 'Applied',
              'SUB-STAGE': a.subStage === 'C_formalities_done' ? 'C: Formalities Done' : (a.subStage || '—'),
              'CONFERENCE CALL': a.conferenceCallStatus ? (a.conferenceCallStatus.toLowerCase().includes('done') ? 'Done ✓' : a.conferenceCallStatus) : '—',
              'TEST DATE': formatExcelDate(a.testDate),
              'VISIT DATE': formatExcelDate(a.visitDate),
              'REG. NUMBER': a.registrationNumber || '—',
              'SELECTED DATE': formatExcelDate(a.selectedDate),
              'ADMISSION DATE': formatExcelDate(a.admissionDate),
              'CHILD DROP DATE': formatExcelDate(a.childDropDate),
              'COMMISSION': commissionDisplay,
              'SCHOOL APP NO.': a.schoolAppNo || '—',
              'NEXT FOLLOW-UP': formatExcelDate(a.nextFollowUpDate),
              'CREATED AT': formatExcelDate(a.createdAt),
              'DELETED AT': a.deletedAt ? formatExcelDate(a.deletedAt) : '—',
            };
          }),
        };
      }

      case 'full-admission-process': {
        const where: any = { deletedAt: null, ...this.buildDateWhere(query, 'createdAt') };
        if (role === 'jr_counsellor' && user?.id) where.counsellorId = user.id;
        if (query.school_id) where.schoolId = query.school_id;
        if (query.counsellor_id) where.counsellorId = query.counsellor_id;

        const apps = await this.prisma.admission.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          include: {
            lead: {
              include: {
                assignedCounsellor: { select: { fullName: true } },
                assignedManager: { select: { fullName: true } },
                tours: { orderBy: { scheduledAt: 'desc' }, take: 1 },
              },
            },
            school: { select: { schoolCode: true, name: true, board: true, city: true, minFeeAnnual: true, maxFeeAnnual: true } },
            counsellor: { select: { fullName: true } },
            installments: { orderBy: { installmentNumber: 'asc' } },
            commissions: { select: { commissionCode: true, amount: true, jrAmount: true, srAmount: true, netProfit: true, status: true } },
          },
        });

        const rows = apps.map((a) => {
          const l = a.lead;
          const s = a.school;
          const comm = a.commissions?.[0];
          const latestTour = l?.tours?.[0];
          const totalFee = Number(a.feeAgreed || 0);
          const paidFee = (a.installments || [])
            .filter((i) => i.status === 'PAID')
            .reduce((sum, i) => sum + Number(i.amount || 0), 0);
          const paymentStatus =
            paidFee >= totalFee && totalFee > 0
              ? 'Full Paid'
              : paidFee > 0
              ? 'Partial Paid'
              : 'Payment Pending';

          return {
            'APP ID': a.admissionNumber,
            'LEAD ID': l?.leadNumber || a.leadId.slice(0, 8),
            'ACADEMIC YEAR': l?.academicYear || '2026-27',
            'STUDENT NAME': a.studentName || l?.studentName || '—',
            'PARENT NAME': l?.fatherName || l?.parentName || '—',
            'PARENT PHONE': l?.parentPhone || '—',
            'CITY': l?.city || '—',
            'ANNUAL BUDGET': l?.annualBudget || '—',
            'SCHOOL CODE': s?.schoolCode || a.schoolId.slice(0, 6),
            'SCHOOL NAME': s?.name || a.schoolName || '—',
            'BOARD': s?.board || '—',
            'CURRENT STAGE': a.stage === 'admission_done' ? 'Admission Done' : a.stage === 'selected' ? 'Selected' : (a.stage || 'Applied'),
            'SUB-STAGE': a.subStage === 'C_formalities_done' ? 'C: Formalities Done' : (a.subStage || '—'),
            'VERIFIED GENUINE': l?.isGenuine ? 'Yes (Genuine)' : 'No',
            'CONFERENCE CALL': a.conferenceCallStatus || '—',
            'TEST DATE': formatExcelDate(a.testDate),
            'CAMPUS / ZOOM TOUR DATE': formatExcelDate(a.visitDate || latestTour?.scheduledAt),
            'REGISTRATION NUMBER': a.registrationNumber || '—',
            'SCHOOL APP NUMBER': a.schoolAppNo || '—',
            'SELECTION DATE': formatExcelDate(a.selectedDate),
            'ADMISSION CONFIRMED DATE': formatExcelDate(a.admissionDate),
            'TOTAL FEE AGREED': totalFee,
            'TOTAL FEE PAID': paidFee,
            'BALANCE DUE': Math.max(totalFee - paidFee, 0),
            'PAYMENT STATUS': paymentStatus,
            'INSTALLMENTS PLAN': a.installments?.length ? `${a.installments.length} Tier Milestones` : 'Single Payment',
            'LATEST UTR': a.installments?.find((i) => i.utrNumber)?.utrNumber || '—',
            'COMMISSION ELIGIBLE': a.commissionGenerated ? 'Yes (Sub-Stage C)' : 'No',
            'COMPANY COMMISSION': Number(comm?.amount || 0),
            'JR COUNSELLOR SHARE': Number(comm?.jrAmount || 0),
            'SR MANAGER SHARE': Number(comm?.srAmount || 0),
            'NET PROFIT': Number(comm?.netProfit || 0),
            'COMMISSION STATUS': comm?.status || 'Pending',
            'ASSIGNED COUNSELLOR': a.counsellor?.fullName || l?.assignedCounsellor?.fullName || '—',
            'ASSIGNED MANAGER': l?.assignedManager?.fullName || '—',
            'PROCESS INITIATED AT': formatExcelDate(a.createdAt),
          };
        });

        return {
          title: 'End-to-End Admission Full Process Lifecycle Report',
          summary: { totalApplications: apps.length },
          rows,
        };
      }

      case 'school-wise': {
        const apps = await this.prisma.admission.findMany({
          where: {
            deletedAt: null,
            ...this.buildDateWhere(query, 'createdAt'),
            ...(query.school_id ? { schoolId: query.school_id } : {}),
          },
          include: { school: { select: { id: true, schoolCode: true, name: true, city: true, board: true } } },
        });
        const map = new Map<string, any>();
        for (const a of apps) {
          const key = a.schoolId;
          const entry = map.get(key) || {
            SchoolCode: a.school?.schoolCode || '',
            SchoolName: a.school?.name || a.schoolName || '',
            City: a.school?.city || '',
            Board: a.school?.board || '',
            Applications: 0,
            AdmissionsDone: 0,
            StageCCompleted: 0,
            TotalFeeAgreed: 0,
          };
          entry.Applications += 1;
          if (a.stage === 'admission_done' || a.status === 'Admission Confirmed') entry.AdmissionsDone += 1;
          if (a.subStage === 'C_formalities_done') entry.StageCCompleted += 1;
          entry.TotalFeeAgreed += Number(a.feeAgreed || 0);
          map.set(key, entry);
        }
        const rows = Array.from(map.values()).sort((x, y) => y.Applications - x.Applications);
        return {
          title: 'School-Wise Application & Placement Report',
          summary: { totalSchoolsWithActivity: rows.length, totalApplications: apps.length },
          rows,
        };
      }

      case 'commission': {
        const where: any = { deletedAt: null, ...this.buildDateWhere(query, 'createdAt') };
        if (role === 'jr_counsellor' && user?.id) where.beneficiaryId = user.id;
        if (query.school_id) where.schoolId = query.school_id;
        if (query.counsellor_id) where.beneficiaryId = query.counsellor_id;

        const rows = await this.prisma.commission.findMany({
          where,
          orderBy: { createdAt: 'desc' },
        });
        return {
          title: 'Commission Ledger Report',
          summary: {
            count: rows.length,
            totalCompanyAmount: rows.reduce((s, r) => s + Number(r.amount || 0), 0),
            totalJrAmount: rows.reduce((s, r) => s + Number(r.jrAmount || 0), 0),
            totalSrAmount: rows.reduce((s, r) => s + Number(r.srAmount || 0), 0),
            totalNetProfit: rows.reduce((s, r) => s + Number(r.netProfit || 0), 0),
          },
          rows: rows.map((r) => ({
            CommissionID: r.commissionCode,
            School: r.schoolName || '',
            Student: r.studentName || '',
            CompanyAmount: r.amount,
            JrShare: r.jrAmount,
            SrShare: r.srAmount,
            NetProfit: r.netProfit,
            Status: r.status,
            FNF: r.fnfFlag || '',
            CreatedAt: r.createdAt.toISOString(),
          })),
        };
      }

      case 'revenue': {
        if (role !== 'super_admin') {
          throw new ForbiddenException('Revenue report is restricted to Super Admin');
        }
        const rows = await this.prisma.commission.findMany({
          where: { deletedAt: null, ...this.buildDateWhere(query, 'createdAt') },
          orderBy: { createdAt: 'asc' },
        });
        const taxRow = await this.prisma.systemSetting.findUnique({ where: { key: 'gst_tds' } });
        const tax = (taxRow?.value as any) || { gstRate: 18, tdsRate: 5 };
        const byMonth = new Map<string, any>();
        for (const r of rows) {
          const ym = r.createdAt.toISOString().slice(0, 7);
          const item = byMonth.get(ym) || {
            Month: ym,
            CompanyRevenue: 0,
            TeamPayouts: 0,
            NetProfit: 0,
            GSTEstimated: 0,
            Entries: 0,
          };
          item.Entries += 1;
          item.CompanyRevenue += Number(r.amount || 0);
          item.TeamPayouts += Number(r.jrAmount || 0) + Number(r.srAmount || 0);
          item.NetProfit += Number(r.netProfit || 0);
          item.GSTEstimated = Math.round((item.CompanyRevenue * Number(tax.gstRate || 18)) / 100);
          byMonth.set(ym, item);
        }
        const monthlyRows = Array.from(byMonth.values());
        return {
          title: 'Monthly Revenue & Net Company Profit Report',
          summary: {
            totalRevenue: monthlyRows.reduce((s, x) => s + x.CompanyRevenue, 0),
            totalNetProfit: monthlyRows.reduce((s, x) => s + x.NetProfit, 0),
            gstRate: tax.gstRate || 18,
          },
          rows: monthlyRows,
        };
      }

      case 'performance/jr': {
        const usersWhere: any = {
          role: { in: ['jr_counsellor', 'COUNSELLOR'] },
          deletedAt: null,
        };
        if (role === 'jr_counsellor' && user?.id) usersWhere.id = user.id;
        if (role === 'manager' && user?.id) usersWhere.managerId = user.id;
        if (query.counsellor_id) usersWhere.id = query.counsellor_id;

        const jrs = await this.prisma.user.findMany({
          where: usersWhere,
          select: { id: true, fullName: true, employeeId: true, email: true },
        });
        const rows = [];
        for (const jr of jrs) {
          const [leadsCount, callsCount, waCount, admissionsCount, pendingLogs] =
            await Promise.all([
              this.prisma.lead.count({ where: { assignedCounsellorId: jr.id, deletedAt: null } }),
              this.prisma.callLog.count({ where: { calledBy: jr.id, ...this.buildDateWhere(query, 'calledAt') } }),
              this.prisma.whatsappLog.count({ where: { sentBy: jr.id, ...this.buildDateWhere(query, 'sentAt') } }),
              this.prisma.admission.count({
                where: {
                  counsellorId: jr.id,
                  subStage: 'C_formalities_done',
                  deletedAt: null,
                },
              }),
              this.prisma.pendingLoggingQueue.count({ where: { userId: jr.id, status: 'pending' } }),
            ]);
          rows.push({
            EmployeeID: jr.employeeId,
            Counsellor: jr.fullName,
            AssignedLeads: leadsCount,
            CallsLogged: callsCount,
            WhatsAppsSent: waCount,
            ConfirmedAdmissions: admissionsCount,
            ConversionRatePct: leadsCount ? Number(((admissionsCount / leadsCount) * 100).toFixed(1)) : 0,
            PendingQueueItems: pendingLogs,
          });
        }
        return {
          title: 'Jr. Counsellor Performance Leaderboard',
          summary: { counsellorsEvaluated: rows.length },
          rows,
        };
      }

      case 'performance/sr': {
        if (role === 'jr_counsellor') {
          throw new ForbiddenException('Sr. Performance report is restricted to Manager & Admin');
        }
        const mgrWhere: any = { role: { in: ['manager', 'SENIOR_MANAGER'] }, deletedAt: null };
        if (role === 'manager' && user?.id) mgrWhere.id = user.id;
        const mgrs = await this.prisma.user.findMany({
          where: mgrWhere,
          select: { id: true, fullName: true, employeeId: true },
        });
        const rows = [];
        for (const m of mgrs) {
          const [teamSize, verifiedLeads, teamAdmissions] = await Promise.all([
            this.prisma.user.count({ where: { managerId: m.id, deletedAt: null } }),
            this.prisma.lead.count({
              where: { assignedManagerId: m.id, verificationStatus: 'APPROVED', deletedAt: null },
            }),
            this.prisma.admission.count({ where: { managerId: m.id, deletedAt: null } }),
          ]);
          rows.push({
            EmployeeID: m.employeeId,
            Manager: m.fullName,
            TeamSize: teamSize,
            VerifiedLeads: verifiedLeads,
            TeamAdmissions: teamAdmissions,
          });
        }
        return {
          title: 'Manager / Sr. Counsellor Team Performance Report',
          summary: { managersEvaluated: rows.length },
          rows,
        };
      }

      case 'login-logout': {
        if (role !== 'super_admin') {
          throw new ForbiddenException('Login/logout audit is restricted to Super Admin');
        }
        const sessions = await this.prisma.refreshTokenSession.findMany({
          where: this.buildDateWhere(query, 'loginAt'),
          orderBy: { loginAt: 'desc' },
          take: 200,
          include: { user: { select: { fullName: true, employeeId: true, role: true } } },
        });
        return {
          title: 'Employee Login & Session Activity Report',
          summary: { totalSessions: sessions.length },
          rows: sessions.map((s) => ({
            EmployeeID: s.user?.employeeId || '',
            User: s.user?.fullName || '',
            Role: s.user?.role || '',
            IP: s.ipAddress || '',
            Device: s.deviceInfo || '',
            LoginAt: s.loginAt.toISOString(),
            LogoutAt: s.logoutAt ? s.logoutAt.toISOString() : '',
            Active: s.isActive ? 'Yes' : 'No',
            RevokedReason: s.revokedReason || '',
          })),
        };
      }

      case 'audit': {
        if (role !== 'super_admin') {
          throw new ForbiddenException('Audit report is restricted to Super Admin');
        }
        const logs = await this.prisma.auditLog.findMany({
          where: this.buildDateWhere(query, 'createdAt'),
          orderBy: { createdAt: 'desc' },
          take: 300,
        });
        return {
          title: 'System Audit Trail Summary',
          summary: {
            totalEvents: logs.length,
            specialFlags: logs.filter((l) => l.isSpecialFlag).length,
          },
          rows: logs.map((l) => ({
            Action: l.action,
            Module: l.module,
            Entity: l.entity,
            User: l.userName || 'System',
            Role: l.userRole || '',
            SpecialFlag: l.isSpecialFlag ? 'YES' : 'No',
            Archived: l.isArchived ? 'Yes' : 'No',
            Timestamp: l.createdAt.toISOString(),
          })),
        };
      }

      case 'follow-ups': {
        const where: any = { ...this.buildDateWhere(query, 'scheduledAt') };
        if (role === 'jr_counsellor' && user?.id) where.counsellorId = user.id;
        const followUps = await this.prisma.followUp.findMany({
          where,
          orderBy: { scheduledAt: 'desc' },
          include: {
            lead: { select: { leadNumber: true, studentName: true } },
            counsellor: { select: { fullName: true } },
          },
        });
        const now = new Date();
        const overdue = followUps.filter((f) => f.status !== 'COMPLETED' && f.scheduledAt < now).length;
        return {
          title: 'Follow-Up Compliance & Reschedule Report',
          summary: { total: followUps.length, overdue },
          rows: followUps.map((f) => ({
            Code: f.followUpCode,
            Lead: f.lead?.leadNumber || '',
            Student: f.lead?.studentName || '',
            Counsellor: f.counsellor?.fullName || '',
            Type: f.type,
            Status: f.status,
            ScheduledAt: f.scheduledAt.toISOString(),
          })),
        };
      }

      case 'duplicates': {
        const mergedLeads = await this.prisma.lead.findMany({
          where: { isMerged: true },
          orderBy: { updatedAt: 'desc' },
          include: { mergedInto: { select: { leadNumber: true, studentName: true } } },
        });
        return {
          title: 'Duplicate Detection & Merge Audit Report',
          summary: { totalMerged: mergedLeads.length },
          rows: mergedLeads.map((m) => ({
            MergedLeadID: m.leadNumber,
            Student: m.studentName,
            Phone: m.parentPhone,
            PrimaryLeadID: m.mergedInto?.leadNumber || m.mergedIntoId || '',
            OverrideReason: m.overrideReason || 'Merged duplicate',
            MergedAt: m.updatedAt.toISOString(),
          })),
        };
      }

      case 'source-conversion': {
        const where = await this.scopeLeadWhere(query, user);
        const leads = await this.prisma.lead.findMany({
          where,
          select: { leadSource: true, status: true },
        });
        const map = new Map<string, any>();
        for (const l of leads) {
          const src = l.leadSource || 'call';
          const entry = map.get(src) || { Source: src, TotalLeads: 0, Converted: 0, ConversionRatePct: 0 };
          entry.TotalLeads += 1;
          if (['admission_done', 'commission_received', 'ADMISSION_CONFIRMED', 'ENROLLED'].includes(l.status)) {
            entry.Converted += 1;
          }
          entry.ConversionRatePct = Number(((entry.Converted / entry.TotalLeads) * 100).toFixed(1));
          map.set(src, entry);
        }
        return {
          title: 'Lead Source Conversion Effectiveness',
          summary: { sourcesCount: map.size, totalLeads: leads.length },
          rows: Array.from(map.values()),
        };
      }

      case 'counsellor-funnel': {
        const where = await this.scopeLeadWhere(query, user);
        const leads = await this.prisma.lead.findMany({
          where,
          include: { assignedCounsellor: { select: { fullName: true } } },
        });
        const map = new Map<string, any>();
        for (const l of leads) {
          const key = l.assignedCounsellor?.fullName || 'Unassigned';
          const row = map.get(key) || {
            Counsellor: key,
            Total: 0,
            New: 0,
            Shortlisted: 0,
            Applied: 0,
            AdmissionDone: 0,
          };
          row.Total += 1;
          if (['new', 'NEW_LEAD'].includes(l.status)) row.New += 1;
          if (l.status === 'shortlisted') row.Shortlisted += 1;
          if (['applied', 'conference_call', 'test_interview', 'visit_registration', 'selected'].includes(l.status)) row.Applied += 1;
          if (['admission_done', 'commission_received', 'ADMISSION_CONFIRMED'].includes(l.status)) row.AdmissionDone += 1;
          map.set(key, row);
        }
        return {
          title: 'Counsellor Stage-by-Stage Funnel',
          summary: { counsellors: map.size },
          rows: Array.from(map.values()),
        };
      }

      case 'time-to-conversion': {
        const apps = await this.prisma.admission.findMany({
          where: {
            deletedAt: null,
            subStage: 'C_formalities_done',
            ...this.buildDateWhere(query, 'createdAt'),
          },
          include: {
            lead: { select: { leadNumber: true, studentName: true, createdAt: true } },
            school: { select: { name: true } },
          },
        });
        const rows = apps.map((a) => {
          const days = Math.max(
            0,
            Math.round(
              ((a.admissionDate || a.confirmedAt || a.createdAt).getTime() -
                (a.lead?.createdAt || a.createdAt).getTime()) /
                86400000,
            ),
          );
          return {
            AppID: a.admissionNumber,
            LeadID: a.lead?.leadNumber || '',
            Student: a.studentName || '',
            School: a.school?.name || a.schoolName || '',
            DaysToConvert: days,
          };
        });
        const avg = rows.length
          ? Number((rows.reduce((s, r) => s + r.DaysToConvert, 0) / rows.length).toFixed(1))
          : 0;
        return {
          title: 'Lead-to-Admission Time Velocity Report',
          summary: { totalConverted: rows.length, averageDays: avg },
          rows,
        };
      }

      case 'lost-lead-analysis': {
        const leads = await this.prisma.lead.findMany({
          where: {
            deletedAt: null,
            status: { in: ['expired', 'disqualified', 'closed', 'LOST', 'suspended'] },
            ...this.buildDateWhere(query, 'updatedAt'),
          },
        });
        return {
          title: 'Lost, Expired & Disqualified Lead Analysis',
          summary: { totalLostOrInactive: leads.length },
          rows: leads.map((l) => ({
            LeadID: l.leadNumber,
            Student: l.studentName,
            Status: l.status,
            ExpiryStatus: l.expiryStatus || '',
            ForceExpired: l.forceExpired ? 'Yes' : 'No',
            Reason: l.disqualifyReason || l.expiryDay90Action || 'Inactive',
          })),
        };
      }

      case 'school-revenue': {
        if (role !== 'super_admin') {
          throw new ForbiddenException('School revenue report is restricted to Super Admin');
        }
        const comms = await this.prisma.commission.findMany({
          where: { deletedAt: null, isReversal: false },
          include: { school: { select: { name: true, city: true, schoolCode: true } } },
        });
        const map = new Map<string, any>();
        for (const c of comms) {
          const key = c.school?.name || c.schoolName || 'Other';
          const row = map.get(key) || {
            SchoolCode: c.school?.schoolCode || '',
            School: key,
            City: c.school?.city || '',
            Admissions: 0,
            CompanyRevenue: 0,
            NetProfit: 0,
          };
          row.Admissions += 1;
          row.CompanyRevenue += Number(c.amount || 0);
          row.NetProfit += Number(c.netProfit || 0);
          map.set(key, row);
        }
        const rows = Array.from(map.values()).sort((a, b) => b.CompanyRevenue - a.CompanyRevenue);
        return {
          title: 'Partner School Revenue Ranking',
          summary: { schools: rows.length, totalRevenue: rows.reduce((s, r) => s + r.CompanyRevenue, 0) },
          rows,
        };
      }

      case 'whatsapp-activity': {
        const where: any = this.buildDateWhere(query, 'sentAt');
        if (role === 'jr_counsellor' && user?.id) where.sentBy = user.id;
        const logs = await this.prisma.whatsappLog.findMany({
          where,
          orderBy: { sentAt: 'desc' },
          include: {
            lead: { select: { leadNumber: true, studentName: true } },
            sender: { select: { fullName: true } },
          },
        });
        return {
          title: 'WhatsApp Communication Activity & Confirmation Report',
          summary: {
            total: logs.length,
            confirmed: logs.filter((l) => l.status === 'confirmed').length,
            pending: logs.filter((l) => l.status === 'pending').length,
          },
          rows: logs.map((l) => ({
            LogID: l.logId,
            Lead: l.lead?.leadNumber || '',
            Student: l.lead?.studentName || '',
            RecipientType: l.recipientType,
            Status: l.status,
            SentBy: l.sender?.fullName || '',
            SentAt: l.sentAt.toISOString(),
          })),
        };
      }

      case 'call-activity': {
        const where: any = this.buildDateWhere(query, 'calledAt');
        if (role === 'jr_counsellor' && user?.id) where.calledBy = user.id;
        const logs = await this.prisma.callLog.findMany({
          where,
          orderBy: { calledAt: 'desc' },
          include: {
            lead: { select: { leadNumber: true, studentName: true } },
            caller: { select: { fullName: true } },
          },
        });
        const byOutcome: Record<string, number> = {};
        for (const l of logs) byOutcome[l.outcome] = (byOutcome[l.outcome] || 0) + 1;
        return {
          title: 'Manual Call Outcome & Duration Report',
          summary: { totalCalls: logs.length, byOutcome },
          rows: logs.map((l) => ({
            LogID: l.logId,
            Lead: l.lead?.leadNumber || '',
            Student: l.lead?.studentName || '',
            Outcome: l.outcome,
            DurationSec: l.durationSeconds,
            Status: l.status,
            Caller: l.caller?.fullName || '',
            CalledAt: l.calledAt.toISOString(),
          })),
        };
      }

      case 'commission-reversal': {
        if (role !== 'super_admin') {
          throw new ForbiddenException('Commission reversal report is restricted to Super Admin');
        }
        const rows = await this.prisma.commission.findMany({
          where: {
            OR: [{ isReversal: true }, { status: { in: ['reversed', 'REVERSED', 'adjusted'] } }],
          },
          orderBy: { createdAt: 'desc' },
        });
        return {
          title: 'Commission Reversal & FNF Clawback Report',
          summary: {
            totalEvents: rows.length,
            totalOriginalAmount: rows.reduce((s, r) => s + Number(r.originalAmount || 0), 0),
          },
          rows: rows.map((r) => ({
            CommissionID: r.commissionCode,
            Student: r.studentName || '',
            School: r.schoolName || '',
            OriginalAmount: r.originalAmount,
            LedgerAmount: r.amount,
            Status: r.status,
            FNFFlag: r.fnfFlag || '',
            Reason: r.reversalReason || '',
          })),
        };
      }

      default:
        throw new BadRequestException(`Unknown report type: ${reportKey}`);
    }
  }

  buildExcelBuffer(reportKey: string, data: any): Buffer {
    const rawRows = Array.isArray(data.rows) && data.rows.length ? data.rows : [data.summary || {}];
    const cleanRows = rawRows.map((row: any) => {
      const obj: Record<string, any> = {};
      for (const [k, v] of Object.entries(row)) {
        obj[k] = typeof v === 'string' ? sanitizeSpreadsheetCell(v) : v;
      }
      return obj;
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(cleanRows);
    ws['!cols'] = autoFitColumns(cleanRows);
    let sheetName = reportKey.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30) || 'Report';
    if (reportKey === 'leads') sheetName = 'Sheet 1 - Leads';
    else if (reportKey === 'admissions') sheetName = 'Sheet 3 - Applications';
    else if (reportKey === 'full-admission-process') sheetName = 'Admission Full Process';
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  async buildMasterCrmWorkbookBuffer(user: any): Promise<Buffer> {
    const wb = XLSX.utils.book_new();

    const addCleanSheet = (sheetName: string, rows: any[]) => {
      const cleanRows = (rows.length ? rows : [{ Status: 'No records available' }]).map((r) => {
        const obj: Record<string, any> = {};
        for (const [k, v] of Object.entries(r)) {
          obj[k] = typeof v === 'string' ? sanitizeSpreadsheetCell(v) : v;
        }
        return obj;
      });
      const ws = XLSX.utils.json_to_sheet(cleanRows);
      ws['!cols'] = autoFitColumns(cleanRows);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    };

    // 1. Sheet 1: Leads
    try {
      const leadsData = await this.computeReportData('leads', {}, user);
      addCleanSheet('Sheet 1 - Leads', leadsData.rows || []);
    } catch (e) {
      addCleanSheet('Sheet 1 - Leads', [{ Error: 'Could not load leads' }]);
    }

    // 2. Sheet 2: Schools
    try {
      const schools = await this.prisma.school.findMany({
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
      });
      const schoolRows = schools.map((s) => ({
        'SCHOOL CODE': s.schoolCode,
        'SCHOOL NAME': s.name,
        'CITY': s.city,
        'STATE': s.state || '—',
        'BOARD': s.board,
        'TYPE': s.genderType === 'co_ed' ? 'Co-Ed Boarding' : `${s.genderType} Boarding`,
        'CATEGORY': s.category,
        'ANNUAL FEE': s.feesDisplay || (s.minFeeAnnual ? `₹${s.minFeeAnnual.toLocaleString('en-IN')} - ₹${s.maxFeeAnnual.toLocaleString('en-IN')}` : '—'),
        'COMMISSION SLAB': s.defaultCommission ? `₹${s.defaultCommission.toLocaleString('en-IN')}` : 'Standard',
        'ACTIVE STATUS': s.status || 'Active',
        'CONTACT EMAIL': s.admissionsEmail || '—',
        'CONTACT PHONE': s.phone || '—',
      }));
      addCleanSheet('Sheet 2 - Schools', schoolRows);
    } catch (e) {
      addCleanSheet('Sheet 2 - Schools', [{ Error: 'Could not load schools' }]);
    }

    // 3. Sheet 3: Applications & Admissions (Matching Screenshot)
    try {
      const admissionsData = await this.computeReportData('admissions', {}, user);
      addCleanSheet('Sheet 3 - Applications', admissionsData.rows || []);
    } catch (e) {
      addCleanSheet('Sheet 3 - Applications', [{ Error: 'Could not load admissions' }]);
    }

    // 4. Sheet 4: Fee Milestones
    try {
      const installments = await this.prisma.admissionInstallment.findMany({
        include: {
          admission: {
            select: {
              admissionNumber: true,
              studentName: true,
              schoolName: true,
            },
          },
        },
        orderBy: { dueDate: 'asc' },
      });
      const feeRows = installments.map((i) => ({
        'MILESTONE ID': i.id.slice(0, 8),
        'APP ID': i.admission?.admissionNumber || '—',
        'STUDENT NAME': i.admission?.studentName || '—',
        'SCHOOL': i.admission?.schoolName || '—',
        'INSTALLMENT NO': `Inst #${i.installmentNumber || 1}`,
        'DESCRIPTION': i.title,
        'PERCENTAGE': `${i.percentage}%`,
        'AMOUNT DUE': Number(i.amount || 0),
        'DUE DATE': formatExcelDate(i.dueDate),
        'PAID AMOUNT': i.status === 'PAID' ? Number(i.amount || 0) : 0,
        'PAID DATE': formatExcelDate(i.paidAt),
        'UTR NUMBER': i.utrNumber || '—',
        'PAYMENT MODE': i.paymentMode || '—',
        'STATUS': i.status,
      }));
      addCleanSheet('Sheet 4 - Fee Milestones', feeRows);
    } catch (e) {
      addCleanSheet('Sheet 4 - Fee Milestones', [{ Error: 'Could not load installments' }]);
    }

    // 5. Sheet 5: Virtual Tours & Campus Visits
    try {
      const tours = await this.prisma.schoolTour.findMany({
        include: {
          lead: {
            select: {
              leadNumber: true,
              studentName: true,
              assignedCounsellor: { select: { fullName: true } },
            },
          },
          school: { select: { name: true } },
        },
        orderBy: { scheduledAt: 'desc' },
      });
      const tourRows = tours.map((t) => ({
        'TOUR ID': t.id.slice(0, 8),
        'LEAD ID': t.lead?.leadNumber || '—',
        'STUDENT NAME': t.lead?.studentName || '—',
        'SCHOOL': t.school?.name || t.schoolName || '—',
        'SCHEDULED DATE': formatExcelDate(t.scheduledAt),
        'TOUR TYPE': t.tourType === 'ONLINE_ZOOM' ? 'Virtual (Zoom)' : 'Campus Visit',
        'ZOOM / MEETING LINK': t.zoomMeetingUrl || '—',
        'STATUS': t.status,
        'COUNSELLOR': t.lead?.assignedCounsellor?.fullName || '—',
        'FEEDBACK': t.postTourFeedback || '—',
        'PROCEED ADMISSION': t.proceedAdmission ? 'Yes' : 'Pending',
      }));
      addCleanSheet('Sheet 5 - Tours & Visits', tourRows);
    } catch (e) {
      addCleanSheet('Sheet 5 - Tours & Visits', [{ Error: 'Could not load tours' }]);
    }

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  async buildPdfBuffer(reportKey: string, data: any): Promise<Buffer> {
    const rows = Array.isArray(data.rows) ? data.rows.slice(0, 200) : [];
    const cols = rows.length ? Object.keys(rows[0]).slice(0, 8) : [];

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 32 });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(Buffer.from(c)));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.rect(32, 28, 778, 44).fill('#123B70');
      doc
        .fillColor('#FFFFFF')
        .font('Helvetica-Bold')
        .fontSize(14)
        .text(`BoardingEdu CRM — ${data.title || reportKey}`, 44, 38, { width: 754 });
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#DBEAFE')
        .text(`Generated: ${new Date().toLocaleString('en-IN')}   |   Records: ${rows.length}`, 44, 56, { width: 754 });

      let y = 84;
      if (cols.length > 0) {
        const colW = Math.floor(778 / cols.length);
        const drawHeader = () => {
          doc.rect(32, y, 778, 20).fill('#1E40AF');
          doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
          cols.forEach((c, idx) => {
            doc.text(String(c).slice(0, 22), 36 + idx * colW, y + 6, { width: colW - 6, ellipsis: true });
          });
          y += 20;
        };
        drawHeader();

        rows.forEach((r: any, rIdx: number) => {
          if (y > 535) {
            doc.addPage();
            y = 32;
            drawHeader();
          }
          const bg = rIdx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
          doc.rect(32, y, 778, 18).fillAndStroke(bg, '#E2E8F0');
          doc.fillColor('#0F172A').font('Helvetica').fontSize(7.5);
          cols.forEach((c, idx) => {
            const val = String(r[c] ?? '—').replace(/₹/g, 'Rs. ');
            doc.text(val.slice(0, 32), 36 + idx * colW, y + 5, { width: colW - 6, ellipsis: true });
          });
          y += 18;
        });
      } else {
        doc.fillColor('#64748B').font('Helvetica').fontSize(11).text('No records available for this report.', 36, y + 10);
      }

      doc.end();
    });
  }

  getCachedReportFile(jobId: string) {
    const cleanId = path.basename(jobId);
    for (const ext of ['xlsx', 'pdf', 'json']) {
      const candidate = path.join(this.cacheDir, `${cleanId}.${ext}`);
      if (fs.existsSync(candidate)) {
        const mime =
          ext === 'xlsx'
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : ext === 'pdf'
            ? 'application/pdf'
            : 'application/json';
        return { filePath: candidate, ext, mime };
      }
    }
    throw new NotFoundException('Generated report file not found or expired');
  }
}
