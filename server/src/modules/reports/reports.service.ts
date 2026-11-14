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
import * as puppeteer from 'puppeteer';
import { PrismaService } from '../../prisma/prisma.service';
import { QueueEngineService } from '../queues/queue-engine.service';
import {
  apiEnvelope,
  sanitizeSpreadsheetCell,
  toBlueprintRole,
} from '../../common/utils/crm.utils';

export type ReportKey =
  | 'leads'
  | 'pipeline'
  | 'admissions'
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
        return {
          title: 'Leads Acquisition & Status Report',
          summary: { total: leads.length, byStatus, bySource, byCity },
          rows: leads.map((l) => ({
            LeadID: l.leadNumber,
            Student: l.studentName,
            Parent: l.parentName,
            Phone: l.parentPhone,
            Class: l.applyingForGrade,
            City: l.city || '',
            Source: l.leadSource || '',
            Status: l.status,
            Score: l.score,
            Counsellor: l.assignedCounsellor?.fullName || 'Unassigned',
            CreatedAt: l.createdAt.toISOString(),
          })),
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
            school: { select: { name: true, city: true } },
            counsellor: { select: { fullName: true } },
          },
        });
        const bySubStage: Record<string, number> = {};
        let totalFeeAgreed = 0;
        for (const a of apps) {
          bySubStage[a.subStage] = (bySubStage[a.subStage] || 0) + 1;
          totalFeeAgreed += Number(a.feeAgreed || 0);
        }
        return {
          title: 'Admissions & Sub-Stage (A/B/C) Report',
          summary: { totalApplications: apps.length, bySubStage, totalFeeAgreed },
          rows: apps.map((a) => ({
            AppID: a.admissionNumber,
            Student: a.studentName || '',
            School: a.school?.name || a.schoolName || '',
            Stage: a.stage,
            SubStage: a.subStage,
            FeeAgreed: a.feeAgreed,
            CommissionGenerated: a.commissionGenerated ? 'Yes' : 'No',
            Counsellor: a.counsellor?.fullName || '',
            CreatedAt: a.createdAt.toISOString(),
          })),
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
    XLSX.utils.book_append_sheet(wb, ws, reportKey.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30) || 'Report');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  async buildPdfBuffer(reportKey: string, data: any): Promise<Buffer> {
    const rows = Array.isArray(data.rows) ? data.rows.slice(0, 200) : [];
    const cols = rows.length ? Object.keys(rows[0]) : [];
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
      body { font-family: Arial, sans-serif; padding: 28px; color: #172B4D; }
      h1 { color: #123B70; font-size: 20px; margin-bottom: 4px; }
      .meta { color: #64748b; font-size: 12px; margin-bottom: 18px; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th { background: #123B70; color: #fff; padding: 7px; text-align: left; }
      td { border-bottom: 1px solid #e2e8f0; padding: 6px 7px; }
    </style></head><body>
      <h1>BoardingEdu CRM — ${data.title || reportKey}</h1>
      <div class="meta">Generated: ${new Date().toISOString()} &bull; Records: ${rows.length}</div>
      <table><thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r: any) => `<tr>${cols.map((c) => `<td>${String(r[c] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>
    </body></html>`;

    try {
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdf = await page.pdf({ format: 'A4', printBackground: true });
        return Buffer.from(pdf);
      } finally {
        await browser.close();
      }
    } catch {
      const text = `BoardingEdu Report: ${data.title || reportKey} (${rows.length} rows)`;
      return Buffer.from(
        `%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n4 0 obj << /Length ${text.length + 45} >> stream\nBT /F1 12 Tf 40 720 Td (${text.replace(/[()\\]/g, '')}) Tj ET\nendstream\nendobj\n5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\nxref\n0 6\n0000000000 65535 f \ntrailer << /Size 6 /Root 1 0 R >>\nstartxref\n0\n%%EOF`,
      );
    }
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
