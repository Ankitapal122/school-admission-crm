import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { QueueEngineService } from '../queues/queue-engine.service';
import {
  KANBAN_STAGES,
  matchingRoleVariants,
  normalizeCanonicalRole,
  normalizeIndianPhone,
  parseClassGrade,
  toBlueprintLeadStatus,
} from '../../common/utils/crm.utils';
import {
  BLUEPRINT_MATCHING_KEYS,
  BLUEPRINT_SCORING_KEYS,
  parseAndValidateSum100Criteria,
} from './dto/weights-validation.dto';
import * as XLSX from 'xlsx';

@Injectable()
export class LeadsService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private queueEngine: QueueEngineService,
  ) {}

  onModuleInit() {
    this.queueEngine.registerHandler('RECALCULATE_LEAD_SCORES', async (payload) => {
      return this.recalculateAllLeadScoresSync(payload?.requestedBy);
    });
    this.queueEngine.registerHandler('DAILY_LIFECYCLE_CHECK', async () => {
      return this.runLifecycleCycleSweep();
    });
  }

  private async nextSeqCode(seqName: string, prefix: string, pad = 6): Promise<string> {
    const rows: any[] = await this.prisma.$queryRawUnsafe(`SELECT nextval('${seqName}')::bigint AS n`);
    const num = Number(rows[0]?.n || 1);
    return `${prefix}${String(num).padStart(pad, '0')}`;
  }

  private async resolveLead(idOrNumber: string, includeDeleted = false) {
    const lead = await this.prisma.lead.findFirst({
      where: {
        OR: [{ id: idOrNumber }, { leadNumber: idOrNumber }],
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
    });
    if (!lead) {
      throw new NotFoundException(`Lead "${idOrNumber}" not found.`);
    }
    return lead;
  }

  private async buildScopeWhere(user: any): Promise<any> {
    const canon = normalizeCanonicalRole(user.role);
    if (canon === 'SUPER_ADMIN') {
      return { deletedAt: null };
    }
    if (canon === 'SENIOR_MANAGER') {
      const teamMembers = await this.prisma.user.findMany({
        where: { managerId: user.id, deletedAt: null },
        select: { id: true },
      });
      const memberIds = [user.id, ...teamMembers.map((u) => u.id)];
      return {
        deletedAt: null,
        OR: [
          { assignedManagerId: user.id },
          { assignedCounsellorId: { in: memberIds } },
          { createdById: { in: memberIds } },
          { assignedCounsellorId: null },
        ],
      };
    }
    return {
      deletedAt: null,
      OR: [{ assignedCounsellorId: user.id }, { createdById: user.id }],
    };
  }

  private parseBudgetMax(budgetRange?: string | null, min?: number | null, max?: number | null): number {
    if (max && Number.isFinite(max)) return max;
    if (min && Number.isFinite(min)) return min * 1.3;
    const raw = String(budgetRange || '');
    const nums = raw.match(/\d+(\.\d+)?/g)?.map((n) => parseFloat(n)) || [];
    if (nums.length === 0) return 500000;
    const largest = Math.max(...nums);
    return /l|lakh/i.test(raw) ? largest * 100000 : largest < 100 ? largest * 100000 : largest;
  }

  private async getScoringWeights(): Promise<Record<string, number>> {
    const rows = await this.prisma.leadScoringConfig.findMany();
    const map: Record<string, number> = {
      budget_match: 25,
      engagement: 25,
      source_quality: 20,
      timeline_urgency: 15,
      class_demand: 15,
    };
    for (const r of rows) {
      map[r.criteriaKey] = r.weight;
    }
    return map;
  }

  async computeLeadScore(lead: any): Promise<{ score: number; breakdown: Record<string, number> }> {
    const w = await this.getScoringWeights();
    const maxBudget = this.parseBudgetMax(lead.annualBudget, lead.budgetMin, lead.budgetMax);
    const budgetFactor = maxBudget >= 600000 ? 1 : maxBudget >= 350000 ? 0.8 : 0.55;

    const waCount = Number(lead.waSentCount || 0);
    const callCount = Number(lead.callAttempts || 0);
    const outcomeBonus = lead.lastCallOutcome === 'interested' ? 0.4 : 0;
    const engagementFactor = Math.min(1, 0.35 + (waCount + callCount) * 0.15 + outcomeBonus);

    const src = String(lead.leadSource || 'call').toLowerCase();
    const sourceFactor =
      src === 'referral' || src === 'walk_in'
        ? 1
        : src === 'website' || src === 'call'
          ? 0.8
          : 0.6;

    const session = String(lead.academicYear || lead.admissionSession || '2026-27');
    const timelineFactor = session.includes('2026') || session.includes('2025') ? 0.95 : 0.65;

    const cls = parseClassGrade(lead.classGrade || lead.applyingForGrade, 6);
    const classFactor = cls >= 5 && cls <= 11 ? 0.9 : 0.7;

    const breakdown = {
      budget_match: Math.round(w.budget_match * budgetFactor),
      engagement: Math.round(w.engagement * engagementFactor),
      source_quality: Math.round(w.source_quality * sourceFactor),
      timeline_urgency: Math.round(w.timeline_urgency * timelineFactor),
      class_demand: Math.round(w.class_demand * classFactor),
    };
    const score = Math.min(
      100,
      Object.values(breakdown).reduce((a, b) => a + b, 0),
    );
    return { score, breakdown };
  }

  private async pickAssignee(methodInput?: string, explicitAssigneeId?: string): Promise<string | null> {
    if (explicitAssigneeId) return explicitAssigneeId;
    const setting = await this.prisma.systemSetting.findUnique({ where: { key: 'assignment_default' } });
    const cfg = (setting?.value as any) || { method: 'round_robin', auto_assign_on_create: false };
    const method = methodInput || (cfg.auto_assign_on_create ? cfg.method : null);
    if (!method || method === 'manual') return null;

    const counsellors = await this.prisma.user.findMany({
      where: {
        role: { in: matchingRoleVariants('COUNSELLOR') as any },
        isActive: true,
        status: 'active',
        deletedAt: null,
      },
      orderBy: { employeeId: 'asc' },
    });
    if (counsellors.length === 0) return null;

    if (method === 'overload_balance') {
      const counts = await Promise.all(
        counsellors.map(async (c) => ({
          id: c.id,
          count: await this.prisma.lead.count({
            where: {
              assignedCounsellorId: c.id,
              deletedAt: null,
              status: { notIn: ['closed', 'merged', 'expired', 'disqualified'] },
            },
          }),
        })),
      );
      counts.sort((a, b) => a.count - b.count);
      return counts[0]?.id || counsellors[0].id;
    }

    // Default: round_robin
    const idx = Number(cfg.round_robin_pointer || 0) % counsellors.length;
    const chosen = counsellors[idx];
    await this.prisma.systemSetting.upsert({
      where: { key: 'assignment_default' },
      update: { value: { ...cfg, round_robin_pointer: idx + 1 } },
      create: { key: 'assignment_default', value: { ...cfg, round_robin_pointer: idx + 1 }, category: 'assignment' },
    });
    return chosen.id;
  }

  async findAll(query: any, user: any) {
    const baseScope = await this.buildScopeWhere(user);
    const where: any = { ...baseScope };

    if (query.status) {
      const rawStatuses = String(query.status).split(',').map((s) => s.trim());
      where.status = { in: rawStatuses };
    }
    if (query.classGrade || query.class) {
      where.classGrade = parseClassGrade(query.classGrade || query.class);
    }
    if (query.source) where.leadSource = query.source;
    if (query.board) where.preferredBoard = query.board;
    if (query.counsellor_id || query.assignedCounsellorId) {
      where.assignedCounsellorId = query.counsellor_id || query.assignedCounsellorId;
    }
    if (query.minScore || query.maxScore) {
      where.score = {};
      if (query.minScore) where.score.gte = Number(query.minScore);
      if (query.maxScore) where.score.lte = Number(query.maxScore);
    }
    if (query.date_from || query.date_to || query.old_leads_only === 'true') {
      where.createdAt = {};
      if (query.date_from) where.createdAt.gte = new Date(query.date_from);
      if (query.date_to) where.createdAt.lte = new Date(query.date_to + (query.date_to.length === 10 ? 'T23:59:59.999Z' : ''));
      if (query.old_leads_only === 'true' && !query.date_to) {
        const yesterdayEnd = new Date();
        yesterdayEnd.setHours(0, 0, 0, 0);
        where.createdAt.lt = yesterdayEnd;
      }
    }
    if (query.search) {
      const term = String(query.search).trim();
      where.AND = [
        {
          OR: [
            { leadNumber: { contains: term, mode: 'insensitive' } },
            { studentName: { contains: term, mode: 'insensitive' } },
            { parentName: { contains: term, mode: 'insensitive' } },
            { fatherName: { contains: term, mode: 'insensitive' } },
            { parentPhone: { contains: term, mode: 'insensitive' } },
            { city: { contains: term, mode: 'insensitive' } },
            { preferredLocation: { contains: term, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(200, Math.max(1, Number(query.limit || 50)));
    const skip = (page - 1) * limit;

    const [leads, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        include: {
          assignedCounsellor: { select: { id: true, fullName: true, employeeId: true } },
          assignedManager: { select: { id: true, fullName: true } },
          createdBy: { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: query.format === 'excel' || query.format === 'csv' ? 0 : skip,
        take: query.format === 'excel' || query.format === 'csv' ? 5000 : limit,
      }),
      this.prisma.lead.count({ where }),
    ]);

    return {
      leads,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(idOrNumber: string, user: any) {
    const lead = await this.resolveLead(idOrNumber);
    const canon = normalizeCanonicalRole(user.role);
    if (
      canon === 'COUNSELLOR' &&
      lead.assignedCounsellorId !== user.id &&
      lead.createdById !== user.id
    ) {
      throw new ForbiddenException('You can only view leads assigned to or created by you.');
    }

    const detail = await this.prisma.lead.findUnique({
      where: { id: lead.id },
      include: {
        assignedCounsellor: { select: { id: true, fullName: true, email: true, phone: true } },
        assignedManager: { select: { id: true, fullName: true, email: true } },
        createdBy: { select: { id: true, fullName: true } },
        remarks: { orderBy: { createdAt: 'desc' } },
        shortlists: {
          where: { deletedAt: null },
          include: { school: true },
          orderBy: { priorityOrder: 'asc' },
        },
        applications: {
          where: { deletedAt: null },
          include: { school: true, commissions: true },
          orderBy: { createdAt: 'desc' },
        },
        whatsappLogs: { orderBy: { sentAt: 'desc' }, take: 25 },
        callLogs: { orderBy: { calledAt: 'desc' }, take: 25 },
        followUpHistory: {
          include: { user: { select: { fullName: true } } },
          orderBy: { createdAt: 'desc' },
        },
        lifecycleHistory: { orderBy: { eventDate: 'desc' } },
        reopenedHistory: { orderBy: { reopenedAt: 'desc' } },
      },
    });

    const computed = await this.computeLeadScore(detail);
    return {
      ...detail,
      scoreBreakdown: computed.breakdown,
    };
  }

  async checkDuplicate(body: {
    mobile?: string;
    parentPhone?: string;
    mobile_primary?: string;
    studentName?: string;
    student_name?: string;
    admissionClass?: string;
    classGrade?: number;
    class?: any;
  }) {
    const phoneInput = body.mobile || body.parentPhone || body.mobile_primary || '';
    const normPhone = phoneInput ? normalizeIndianPhone(phoneInput, false) : null;
    const studentName = (body.studentName || body.student_name || '').trim();
    const classGrade = parseClassGrade(body.classGrade ?? body.class ?? body.admissionClass, 0);

    if (!normPhone && !studentName) {
      return { isDuplicate: false, is_duplicate: false, matches: [] };
    }

    const matches = await this.prisma.lead.findMany({
      where: {
        deletedAt: null,
        status: { notIn: ['merged', 'MERGED'] },
        ...(normPhone ? { parentPhone: normPhone } : {}),
        ...(studentName ? { studentName: { equals: studentName, mode: 'insensitive' } } : {}),
        ...(classGrade > 0 ? { classGrade } : {}),
      },
      select: {
        id: true,
        leadNumber: true,
        studentName: true,
        parentPhone: true,
        applyingForGrade: true,
        classGrade: true,
        status: true,
        forceExpired: true,
        createdAt: true,
      },
      take: 10,
    });

    return {
      isDuplicate: matches.length > 0,
      is_duplicate: matches.length > 0,
      matches: matches.map((m) => ({
        ...m,
        lead_id: m.leadNumber,
        match_score: 100,
      })),
    };
  }

  async checkExpiredMatch(body: any) {
    const phoneInput = body.mobile || body.mobile_primary || body.parentPhone || '';
    const normPhone = phoneInput ? normalizeIndianPhone(phoneInput, false) : null;
    const studentName = (body.studentName || body.student_name || '').trim();
    const classGrade = parseClassGrade(body.class ?? body.classGrade ?? body.admissionClass, 0);

    if (!normPhone) {
      return { has_expired_match: false, expired_lead: null };
    }

    const match = await this.prisma.lead.findFirst({
      where: {
        deletedAt: null,
        status: { in: ['expired', 'suspended'] },
        parentPhone: normPhone,
        ...(studentName ? { studentName: { contains: studentName, mode: 'insensitive' } } : {}),
        ...(classGrade > 0 ? { classGrade } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (!match) {
      return { has_expired_match: false, expired_lead: null };
    }

    const daysAgo = Math.max(
      1,
      Math.floor((Date.now() - new Date(match.updatedAt).getTime()) / 86_400_000),
    );
    return {
      has_expired_match: true,
      expired_lead: {
        id: match.id,
        lead_id: match.leadNumber,
        student_name: match.studentName,
        expired_at: match.updatedAt,
        days_ago: daysAgo,
        force_expired: match.forceExpired,
      },
      action_required: match.forceExpired ? 'create_new_only' : 'reopen_or_create_new',
    };
  }

  async createLead(body: any, user: any) {
    const rawPrimary =
      body.mobile_primary ||
      body.parentPhone ||
      body.fatherPhone ||
      body.mobile ||
      body.motherPhone;
    const parentPhone = normalizeIndianPhone(rawPrimary, true)!;
    const alternateMobile = normalizeIndianPhone(
      body.mobile_alternate || body.alternateMobile || body.motherPhone,
      false,
    );
    const whatsappNumber =
      normalizeIndianPhone(body.whatsapp_number || body.whatsappNumber, false) || parentPhone;
    const guardianMobile = normalizeIndianPhone(
      body.guardian_mobile || body.guardianMobile,
      false,
    );

    const studentName = String(body.student_name || body.studentName || '').trim();
    if (!studentName) throw new BadRequestException('student_name is required.');

    const classGrade = parseClassGrade(
      body.class_grade ?? body.classGrade ?? body.applyingForGrade ?? body.admissionClass,
      6,
    );
    const applyingForGrade = String(
      body.applyingForGrade || body.admissionClass || `Class ${classGrade}`,
    );

    const parentName =
      String(
        body.parentName ||
          body.parent_name ||
          [body.father_name || body.fatherName, body.mother_name || body.motherName]
            .filter(Boolean)
            .join(' & ') ||
          body.guardian_name ||
          body.guardianName ||
          'Parent',
      ).trim();

    const dup = await this.checkDuplicate({
      mobile: parentPhone,
      studentName,
      classGrade,
    });

    const leadNumber = await this.nextSeqCode('seq_lead_id', 'LD', 6);
    const followUpDate = body.follow_up_date || body.nextFollowUpDate
      ? new Date(body.follow_up_date || body.nextFollowUpDate)
      : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    const canonRole = normalizeCanonicalRole(user.role);
    let assignedCounsellorId = body.assigned_to || body.assignedCounsellorId || null;
    if (!assignedCounsellorId && canonRole === 'COUNSELLOR') {
      assignedCounsellorId = user.id;
    } else if (!assignedCounsellorId) {
      assignedCounsellorId = await this.pickAssignee(body.assignment_method);
    }

    const assignedManagerId =
      body.assignedManagerId ||
      (canonRole === 'SENIOR_MANAGER' ? user.id : user.managerId || null);

    const tempLeadObj = {
      annualBudget: body.budget_range || body.annualBudget || '4L-6L',
      budgetMin: body.budgetMin ? Number(body.budgetMin) : null,
      budgetMax: body.budgetMax ? Number(body.budgetMax) : null,
      leadSource: body.source || body.leadSource || 'call',
      academicYear: body.academic_year || body.academicYear || body.admissionSession || '2026-27',
      classGrade,
      waSentCount: 0,
      callAttempts: 0,
    };
    const { score, breakdown } = await this.computeLeadScore(tempLeadObj);

    const created = await this.prisma.lead.create({
      data: {
        leadNumber,
        academicYear: tempLeadObj.academicYear,
        admissionSession: tempLeadObj.academicYear,
        studentName,
        studentGender: body.gender || body.studentGender || 'co_ed',
        currentGrade: body.currentGrade || body.current_grade || null,
        applyingForGrade,
        classGrade,
        previousClassPercentage: body.previous_class_percentage || body.previousClassPercentage || null,
        parentName,
        fatherName: body.father_name || body.fatherName || null,
        fatherOccupation: body.father_occupation || body.fatherOccupation || null,
        motherName: body.mother_name || body.motherName || null,
        motherOccupation: body.mother_occupation || body.motherOccupation || null,
        guardianName: body.guardian_name || body.guardianName || null,
        guardianMobile,
        parentPhone,
        alternateMobile,
        whatsappNumber,
        parentEmail: body.email || body.parentEmail || null,
        preferredContactTime: body.preferred_contact_time || body.preferredContactTime || 'anytime',
        city: body.city_resident || body.city || null,
        preferredLocation: body.city_preferred || body.preferredLocation || null,
        boardingPreference: body.school_type || body.boardingPreference || 'boarding',
        annualBudget: tempLeadObj.annualBudget,
        budgetMin: tempLeadObj.budgetMin,
        budgetMax: tempLeadObj.budgetMax,
        preferredBoard: body.board || body.preferredBoard || 'CBSE',
        leadSource: tempLeadObj.leadSource,
        sourceDetail: body.source_detail || body.sourceDetail || null,
        status: 'new',
        verificationStatus: 'DRAFT',
        score,
        scoreBreakdown: breakdown,
        dpdpConsent: Boolean(body.consent_given ?? body.dpdpConsent),
        dpdpConsentAt: body.consent_given || body.dpdpConsent ? new Date() : null,
        notes: body.initial_remark || body.remarks || body.notes || null,
        overrideReason: body.overrideReason || body.override_reason || null,
        nextFollowUpDate: followUpDate,
        createdById: user.id,
        assignedCounsellorId,
        assignedManagerId,
        teamId: user.teamId || null,
        version: 1,
      },
    });

    const initialRemark = body.initial_remark || body.remarks || body.notes;
    if (initialRemark) {
      await this.prisma.leadRemark.create({
        data: {
          leadId: created.id,
          userId: user.id,
          userName: user.fullName || 'System',
          userRole: canonRole,
          content: String(initialRemark),
        },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        userName: user.fullName,
        userRole: canonRole,
        action: 'CREATE',
        module: 'leads',
        entity: 'Lead',
        entityId: created.id,
        newValue: { leadNumber, studentName, parentPhone, isDuplicate: dup.isDuplicate },
      },
    });

    if (assignedCounsellorId && assignedCounsellorId !== user.id) {
      await this.notifications.notifyUser({
        userId: assignedCounsellorId,
        type: 'lead_assigned',
        title: `New Lead Assigned: ${leadNumber}`,
        message: `${studentName} (${applyingForGrade}) has been assigned to you.`,
        relatedEntityId: created.id,
        relatedEntityType: 'lead',
        link: `/leads/${created.id}`,
      });
    }

    return {
      lead: created,
      lead_id: created.leadNumber,
      is_duplicate: dup.isDuplicate,
      duplicateMatches: dup.matches,
      lead_score: created.score,
      follow_up_date: created.nextFollowUpDate,
      version: created.version,
    };
  }

  async updateLead(idOrNumber: string, body: any, user: any) {
    const existing = await this.resolveLead(idOrNumber);
    const canonRole = normalizeCanonicalRole(user.role);

    if (
      canonRole === 'COUNSELLOR' &&
      existing.assignedCounsellorId !== user.id &&
      existing.createdById !== user.id
    ) {
      throw new ForbiddenException('You can only edit your own leads.');
    }

    if (body.version === undefined || body.version === null) {
      throw new BadRequestException('Optimistic locking version is required on update.');
    }
    const expectedVersion = Number(body.version);

    // Role restriction: Jr. Counsellor can only edit basic parent/student info
    if (
      canonRole === 'COUNSELLOR' &&
      (body.status !== undefined ||
        body.assignedCounsellorId !== undefined ||
        body.assigned_to !== undefined ||
        body.verificationStatus !== undefined ||
        body.forceExpired !== undefined)
    ) {
      throw new ForbiddenException(
        'Jr. Counsellors may only update basic parent/student fields. Status and assignment require Manager approval.',
      );
    }

    const updateData: any = { version: { increment: 1 } };
    if (body.studentName !== undefined || body.student_name !== undefined) {
      updateData.studentName = body.student_name ?? body.studentName;
    }
    if (body.parentName !== undefined || body.parent_name !== undefined) {
      updateData.parentName = body.parent_name ?? body.parentName;
    }
    if (body.fatherName !== undefined || body.father_name !== undefined) {
      updateData.fatherName = body.father_name ?? body.fatherName;
    }
    if (body.fatherOccupation !== undefined || body.father_occupation !== undefined) {
      updateData.fatherOccupation = body.father_occupation ?? body.fatherOccupation;
    }
    if (body.motherName !== undefined || body.mother_name !== undefined) {
      updateData.motherName = body.mother_name ?? body.motherName;
    }
    if (body.motherOccupation !== undefined || body.mother_occupation !== undefined) {
      updateData.motherOccupation = body.mother_occupation ?? body.motherOccupation;
    }
    if (body.guardianName !== undefined || body.guardian_name !== undefined) {
      updateData.guardianName = body.guardian_name ?? body.guardianName;
    }
    if (body.guardianMobile !== undefined || body.guardian_mobile !== undefined) {
      updateData.guardianMobile = normalizeIndianPhone(body.guardian_mobile ?? body.guardianMobile, false);
    }
    if (body.parentPhone !== undefined || body.mobile_primary !== undefined) {
      updateData.parentPhone = normalizeIndianPhone(body.mobile_primary ?? body.parentPhone, true);
    }
    if (body.alternateMobile !== undefined || body.mobile_alternate !== undefined) {
      updateData.alternateMobile = normalizeIndianPhone(body.mobile_alternate ?? body.alternateMobile, false);
    }
    if (body.whatsappNumber !== undefined || body.whatsapp_number !== undefined) {
      updateData.whatsappNumber = normalizeIndianPhone(body.whatsapp_number ?? body.whatsappNumber, false);
    }
    if (body.parentEmail !== undefined || body.email !== undefined) {
      updateData.parentEmail = body.email ?? body.parentEmail;
    }
    if (body.preferredContactTime !== undefined || body.preferred_contact_time !== undefined) {
      updateData.preferredContactTime = body.preferred_contact_time ?? body.preferredContactTime;
    }
    if (body.city !== undefined || body.city_resident !== undefined) {
      updateData.city = body.city_resident ?? body.city;
    }
    if (body.preferredLocation !== undefined || body.city_preferred !== undefined) {
      updateData.preferredLocation = body.city_preferred ?? body.preferredLocation;
    }
    if (body.annualBudget !== undefined || body.budget_range !== undefined) {
      updateData.annualBudget = body.budget_range ?? body.annualBudget;
    }
    if (body.preferredBoard !== undefined || body.board !== undefined) {
      updateData.preferredBoard = body.board ?? body.preferredBoard;
    }
    if (body.boardingPreference !== undefined || body.school_type !== undefined) {
      updateData.boardingPreference = body.school_type ?? body.boardingPreference;
    }
    if (body.classGrade !== undefined || body.class_grade !== undefined || body.applyingForGrade !== undefined) {
      const g = parseClassGrade(body.class_grade ?? body.classGrade ?? body.applyingForGrade, existing.classGrade);
      updateData.classGrade = g;
      updateData.applyingForGrade = body.applyingForGrade || `Class ${g}`;
    }
    if (body.previousClassPercentage !== undefined || body.previous_class_percentage !== undefined) {
      updateData.previousClassPercentage = body.previous_class_percentage ?? body.previousClassPercentage;
    }
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.status !== undefined && canonRole !== 'COUNSELLOR') {
      updateData.status = body.status;
    }

    const res = await this.prisma.lead.updateMany({
      where: { id: existing.id, version: expectedVersion, deletedAt: null },
      data: updateData,
    });

    if (res.count === 0) {
      throw new ConflictException(
        'Optimistic locking conflict: record was modified by another user. Please refresh and retry.',
      );
    }

    const updated = await this.prisma.lead.findUnique({ where: { id: existing.id } });
    const scoreData = await this.computeLeadScore(updated);
    const finalLead = await this.prisma.lead.update({
      where: { id: existing.id },
      data: { score: scoreData.score, scoreBreakdown: scoreData.breakdown },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        userName: user.fullName,
        userRole: canonRole,
        action: 'UPDATE',
        module: 'leads',
        entity: 'Lead',
        entityId: existing.id,
        oldValue: existing,
        newValue: finalLead,
      },
    });

    return finalLead;
  }

  async addRemark(idOrNumber: string, note: string, user: any) {
    if (!note || !String(note).trim()) {
      throw new BadRequestException('Remark note cannot be empty.');
    }
    const lead = await this.resolveLead(idOrNumber);
    const remark = await this.prisma.leadRemark.create({
      data: {
        leadId: lead.id,
        userId: user.id,
        userName: user.fullName || 'CRM User',
        userRole: normalizeCanonicalRole(user.role),
        content: String(note).trim(),
      },
    });
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        userName: user.fullName,
        userRole: normalizeCanonicalRole(user.role),
        action: 'CREATE',
        module: 'lead_remarks',
        entity: 'LeadRemark',
        entityId: remark.id,
        newValue: { leadId: lead.id, content: remark.content },
      },
    });
    return remark;
  }

  async getRemarks(idOrNumber: string) {
    const lead = await this.resolveLead(idOrNumber);
    return this.prisma.leadRemark.findMany({
      where: { leadId: lead.id },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getFullHistory(idOrNumber: string) {
    const lead = await this.resolveLead(idOrNumber);
    const [remarks, audit, lifecycle, reopened, followUpChanges, calls, wa] = await Promise.all([
      this.prisma.leadRemark.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: 'desc' } }),
      this.prisma.auditLog.findMany({ where: { entityId: lead.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.leadExpiryLog.findMany({ where: { leadId: lead.id }, orderBy: { eventDate: 'desc' } }),
      this.prisma.reopenedLeadHistory.findMany({ where: { leadId: lead.id }, orderBy: { reopenedAt: 'desc' } }),
      this.prisma.followUpHistory.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: 'desc' } }),
      this.prisma.callLog.findMany({ where: { leadId: lead.id }, orderBy: { calledAt: 'desc' } }),
      this.prisma.whatsappLog.findMany({ where: { leadId: lead.id }, orderBy: { sentAt: 'desc' } }),
    ]);
    return { remarks, audit, lifecycle, reopened, followUpChanges, calls, whatsapp: wa };
  }

  async updateStatusStage(idOrNumber: string, newStage: string, user: any, expectedVersion?: number) {
    const lead = await this.resolveLead(idOrNumber);
    const canon = toBlueprintLeadStatus(newStage);
    const valid = new Set([...KANBAN_STAGES, 'expired', 'suspended', 'reopened', 'disqualified']);
    if (!valid.has(canon)) {
      throw new BadRequestException(`Invalid pipeline stage "${newStage}".`);
    }

    if (expectedVersion !== undefined) {
      const res = await this.prisma.lead.updateMany({
        where: { id: lead.id, version: Number(expectedVersion), deletedAt: null },
        data: { status: canon as any, version: { increment: 1 } },
      });
      if (res.count === 0) {
        throw new ConflictException('Optimistic locking conflict on stage update. Refresh and retry.');
      }
    } else {
      await this.prisma.lead.update({
        where: { id: lead.id },
        data: { status: canon as any, version: { increment: 1 } },
      });
    }

    const updated = await this.prisma.lead.findUnique({ where: { id: lead.id } });
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        userName: user.fullName,
        userRole: normalizeCanonicalRole(user.role),
        action: 'UPDATE',
        module: 'leads',
        entity: 'Lead',
        entityId: lead.id,
        oldValue: { status: lead.status },
        newValue: { status: canon },
      },
    });
    return updated;
  }

  async assignLead(idOrNumber: string, body: any, user: any) {
    const lead = await this.resolveLead(idOrNumber);
    const assigneeId = await this.pickAssignee(
      body.method,
      body.assigned_to || body.assignedTo || body.counsellorId,
    );
    if (!assigneeId) {
      throw new BadRequestException('No active counsellor available for assignment.');
    }

    const updated = await this.prisma.lead.update({
      where: { id: lead.id },
      data: {
        assignedCounsellorId: assigneeId,
        assignedManagerId: body.manager_id || body.managerId || lead.assignedManagerId || user.id,
        version: { increment: 1 },
      },
      include: { assignedCounsellor: { select: { id: true, fullName: true } } },
    });

    await this.notifications.notifyUser({
      userId: assigneeId,
      type: 'lead_assigned',
      title: `Lead Assigned: ${lead.leadNumber}`,
      message: `${lead.studentName} assigned via ${body.method || 'manual'} by ${user.fullName}.`,
      relatedEntityId: lead.id,
      relatedEntityType: 'lead',
      link: `/leads/${lead.id}`,
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        userName: user.fullName,
        userRole: normalizeCanonicalRole(user.role),
        action: 'UPDATE',
        module: 'leads',
        entity: 'Lead',
        entityId: lead.id,
        oldValue: { assignedTo: lead.assignedCounsellorId },
        newValue: { assignedTo: assigneeId, method: body.method || 'manual' },
      },
    });

    return updated;
  }

  async updateFollowUpWithReason(
    idOrNumber: string,
    newDateRaw: string,
    reason: string,
    user: any,
  ) {
    if (!reason || reason.trim().length < 3) {
      throw new BadRequestException('A mandatory reason is required to change a follow-up date.');
    }
    const lead = await this.resolveLead(idOrNumber);
    const newDate = new Date(newDateRaw);
    if (Number.isNaN(newDate.getTime())) {
      throw new BadRequestException('Invalid follow-up date.');
    }

    await this.prisma.followUpHistory.create({
      data: {
        leadId: lead.id,
        oldDate: lead.nextFollowUpDate,
        newDate,
        reason: reason.trim(),
        changedBy: user.id,
      },
    });

    const updated = await this.prisma.lead.update({
      where: { id: lead.id },
      data: {
        nextFollowUpDate: newDate,
        version: { increment: 1 },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        userName: user.fullName,
        userRole: normalizeCanonicalRole(user.role),
        action: 'UPDATE',
        module: 'follow_ups',
        entity: 'Lead',
        entityId: lead.id,
        oldValue: { nextFollowUpDate: lead.nextFollowUpDate },
        newValue: { nextFollowUpDate: newDate, reason },
      },
    });

    return updated;
  }

  /**
   * ACID Duplicate Lead Merge via Prisma $transaction.
   */
  async mergeLeads(body: any, user: any) {
    const primaryRef = body.target_lead_id || body.primaryLeadId;
    const secondaryRef = body.source_lead_id || body.secondaryLeadId;
    const reason = body.reason || 'Confirmed duplicate applicant merge';
    if (!primaryRef || !secondaryRef || primaryRef === secondaryRef) {
      throw new BadRequestException('Distinct primaryLeadId/target_lead_id and secondaryLeadId/source_lead_id are required.');
    }

    const primary = await this.resolveLead(primaryRef);
    const secondary = await this.resolveLead(secondaryRef);

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Copy/transfer remarks
      await tx.leadRemark.updateMany({
        where: { leadId: secondary.id },
        data: { leadId: primary.id },
      });
      if (secondary.notes) {
        await tx.leadRemark.create({
          data: {
            leadId: primary.id,
            userId: user.id,
            userName: user.fullName,
            userRole: normalizeCanonicalRole(user.role),
            content: `[Merged Note from ${secondary.leadNumber}]: ${secondary.notes}`,
          },
        });
      }

      // 2. Re-link applications carefully avoiding (leadId, schoolId) conflicts
      const secApps = await tx.admission.findMany({ where: { leadId: secondary.id } });
      for (const app of secApps) {
        const collision = await tx.admission.findFirst({
          where: { leadId: primary.id, schoolId: app.schoolId, deletedAt: null },
        });
        if (!collision) {
          await tx.admission.update({
            where: { id: app.id },
            data: { leadId: primary.id, version: { increment: 1 } },
          });
        } else {
          await tx.admission.update({
            where: { id: app.id },
            data: { deletedAt: new Date(), cancellationReason: `Merged into ${primary.leadNumber}` },
          });
        }
      }

      // 3. Re-link commissions, shortlists (skipping dupes), followUps, logs in parallel
      await Promise.all([
        tx.commission.updateMany({ where: { leadId: secondary.id }, data: { leadId: primary.id } }),
        tx.followUp.updateMany({ where: { leadId: secondary.id }, data: { leadId: primary.id } }),
        tx.followUpHistory.updateMany({ where: { leadId: secondary.id }, data: { leadId: primary.id } }),
        tx.whatsappLog.updateMany({ where: { leadId: secondary.id }, data: { leadId: primary.id } }),
        tx.callLog.updateMany({ where: { leadId: secondary.id }, data: { leadId: primary.id } }),
        tx.pendingLoggingQueue.updateMany({ where: { leadId: secondary.id }, data: { leadId: primary.id } }),
        tx.leadExpiryLog.updateMany({ where: { leadId: secondary.id }, data: { leadId: primary.id } }),
        tx.reopenedLeadHistory.updateMany({ where: { leadId: secondary.id }, data: { leadId: primary.id } }),
      ]);

      const secShortlists = await tx.shortlist.findMany({ where: { leadId: secondary.id, deletedAt: null } });
      for (const sl of secShortlists) {
        const exists = await tx.shortlist.findFirst({ where: { leadId: primary.id, schoolId: sl.schoolId } });
        if (!exists) {
          await tx.shortlist.update({ where: { id: sl.id }, data: { leadId: primary.id } });
        } else {
          await tx.shortlist.update({ where: { id: sl.id }, data: { deletedAt: new Date() } });
        }
      }

      // 4. Mark secondary lead merged & increment primary version
      const mergedSecondary = await tx.lead.update({
        where: { id: secondary.id },
        data: {
          status: 'merged',
          isMerged: true,
          mergedIntoId: primary.id,
          version: { increment: 1 },
        },
      });
      const updatedPrimary = await tx.lead.update({
        where: { id: primary.id },
        data: { version: { increment: 1 } },
      });

      // 5. Audit log inside transaction
      await tx.auditLog.create({
        data: {
          userId: user.id,
          userName: user.fullName,
          userRole: normalizeCanonicalRole(user.role),
          action: 'MERGE',
          module: 'leads',
          entity: 'Lead',
          entityId: primary.id,
          isSpecialFlag: true,
          oldValue: { secondaryLeadId: secondary.id, secondaryLeadNumber: secondary.leadNumber },
          newValue: { primaryLeadId: primary.id, primaryLeadNumber: primary.leadNumber, reason },
        },
      });

      return { primary: updatedPrimary, secondary: mergedSecondary };
    }, { maxWait: 15000, timeout: 45000 });

    await this.notifications.notifyRoles(['SUPER_ADMIN', 'SENIOR_MANAGER'], {
      type: 'merge_alert',
      title: `Duplicate Leads Merged: ${secondary.leadNumber} → ${primary.leadNumber}`,
      message: `${user.fullName} merged ${secondary.studentName} into ${primary.leadNumber}.`,
      relatedEntityId: primary.id,
      relatedEntityType: 'lead',
      link: `/leads/${primary.id}`,
    });

    return {
      ...result,
      message: `Successfully merged ${secondary.leadNumber} into ${primary.leadNumber} cleanly.`,
    };
  }

  // =========================================================================
  // 90-90-90-360 EXPIRY LIFECYCLE, SUSPEND, EXTEND, DISQUALIFY & REOPEN
  // =========================================================================

  async getLifecycleStatus(idOrNumber: string) {
    const lead = await this.resolveLead(idOrNumber);
    const ageDays = Math.floor((Date.now() - new Date(lead.createdAt).getTime()) / 86_400_000);
    const cycle =
      lead.forceExpired || ageDays >= 360
        ? 'DAY_360_FORCE_EXPIRED'
        : ageDays >= 270
          ? 'DAY_270_LAST_CHANCE'
          : ageDays >= 180
            ? 'DAY_180_URGENT'
            : ageDays >= 90
              ? 'DAY_90_REVIEW'
              : 'ACTIVE_0_90';

    const history = await this.prisma.leadExpiryLog.findMany({
      where: { leadId: lead.id },
      orderBy: { eventDate: 'desc' },
    });

    return {
      leadId: lead.id,
      leadNumber: lead.leadNumber,
      ageDays,
      cycle,
      status: lead.status,
      forceExpired: lead.forceExpired,
      expiryStatus: lead.expiryStatus,
      expiryExtendedUntil: lead.expiryExtendedUntil,
      history,
    };
  }

  async listLifecycleBucket(bucket: 'expired' | 'suspended' | 'reopened', user: any) {
    const scope = await this.buildScopeWhere(user);
    return this.prisma.lead.findMany({
      where: { ...scope, status: bucket },
      include: {
        assignedCounsellor: { select: { id: true, fullName: true } },
        lifecycleHistory: { orderBy: { eventDate: 'desc' }, take: 3 },
        reopenedHistory: { orderBy: { reopenedAt: 'desc' }, take: 3 },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
  }

  async suspendLead(idOrNumber: string, body: any, user: any) {
    const lead = await this.resolveLead(idOrNumber);
    const reason = body.reason || body.notes || 'parent_requested';
    const suspendDays = Number(body.suspend_days || body.suspendDays || 90);
    const suspendedUntil = new Date(Date.now() + suspendDays * 86_400_000);

    const logId = await this.nextSeqCode('seq_lifecycle_log_id', 'LC', 3);
    const daysInPrevious = Math.floor((Date.now() - new Date(lead.updatedAt).getTime()) / 86_400_000);

    await this.prisma.$transaction([
      this.prisma.lead.update({
        where: { id: lead.id },
        data: {
          status: 'suspended',
          suspendedUntil,
          expiryStatus: 'SUSPENDED',
          version: { increment: 1 },
        },
      }),
      this.prisma.leadExpiryLog.create({
        data: {
          logId,
          leadId: lead.id,
          eventType: 'suspended',
          reason: `${reason} (${body.notes || `${suspendDays} days`})`,
          previousStatus: lead.status,
          daysInPrevious,
          newStatus: 'suspended',
          actionBy: user.id,
          notificationSentTo: ['manager', 'jr_counsellor'],
        },
      }),
    ]);

    return { suspended: true, leadId: lead.id, suspendedUntil };
  }

  async expireLeadOrDecide(
    idOrNumber: string,
    body: { action?: string; reason?: string; force?: boolean },
    user: any,
  ) {
    const lead = await this.resolveLead(idOrNumber);
    const action = String(body?.action || 'EXPIRE').toUpperCase();
    const logId = await this.nextSeqCode('seq_lifecycle_log_id', 'LC', 3);
    const daysInPrevious = Math.floor((Date.now() - new Date(lead.updatedAt).getTime()) / 86_400_000);

    if (action === 'EXTEND') {
      const extendedUntil = new Date(Date.now() + 90 * 86_400_000);
      await this.prisma.$transaction([
        this.prisma.lead.update({
          where: { id: lead.id },
          data: {
            expiryStatus: 'ACTIVE',
            expiryDay90Action: 'EXTENDED_90',
            expiryExtendedUntil: extendedUntil,
            version: { increment: 1 },
          },
        }),
        this.prisma.leadExpiryLog.create({
          data: {
            logId,
            leadId: lead.id,
            eventType: 'extended',
            reason: body.reason || 'Manager approved +90 day cycle extension',
            previousStatus: lead.status,
            daysInPrevious,
            newStatus: lead.status,
            actionBy: user.id,
            notificationSentTo: ['manager'],
          },
        }),
      ]);
      return { extended: true, extendedUntil };
    }

    const forceExpired = body.force !== false;
    await this.prisma.$transaction([
      this.prisma.lead.update({
        where: { id: lead.id },
        data: {
          status: 'expired',
          expiryStatus: 'EXPIRED',
          expiryDay90Action: 'EXPIRED',
          forceExpired,
          version: { increment: 1 },
        },
      }),
      this.prisma.leadExpiryLog.create({
        data: {
          logId,
          leadId: lead.id,
          eventType: forceExpired ? 'force_expired' : 'expired',
          reason: body.reason || (forceExpired ? 'Force-expired at Day 360 / Manager EXPIRE decision' : '90-day inactivity expiry'),
          previousStatus: lead.status,
          daysInPrevious,
          newStatus: 'expired',
          actionBy: user.id,
          notificationSentTo: ['manager', 'super_admin'],
        },
      }),
    ]);

    return { expired: true, forceExpired, leadId: lead.id };
  }

  /**
   * Reopen expired or suspended lead — strictly blocks ONLY force_expired === true!
   */
  async reopenLead(idOrNumber: string, body: any, user: any) {
    const lead = await this.resolveLead(idOrNumber);

    if (lead.forceExpired) {
      throw new BadRequestException({
        success: false,
        message: 'This lead was force-expired at Day 360 and cannot be reopened. Please create a new lead.',
        error: {
          code: 'FORCE_EXPIRED_LEAD',
          details: 'This lead was force-expired at Day 360 and cannot be reopened. Please create a new lead.',
        },
      });
    }

    const reason = String(body?.reason || 'Parent re-engaged').trim();
    const assignTo = body?.assign_to || body?.assignTo || lead.assignedCounsellorId || user.id;
    const { score, breakdown } = await this.computeLeadScore(lead);
    const nextFollowUp = new Date(Date.now() + 3 * 86_400_000);
    const logId = await this.nextSeqCode('seq_lifecycle_log_id', 'LC', 3);

    await this.prisma.$transaction([
      this.prisma.lead.update({
        where: { id: lead.id },
        data: {
          status: 'reopened',
          expiryStatus: 'ACTIVE',
          score,
          scoreBreakdown: breakdown,
          assignedCounsellorId: assignTo,
          nextFollowUpDate: nextFollowUp,
          suspendedUntil: null,
          version: { increment: 1 },
        },
      }),
      this.prisma.reopenedLeadHistory.create({
        data: {
          leadId: lead.id,
          previousStatus: lead.status,
          reopenedBy: user.id,
          reason,
          assignedTo: assignTo,
          recalculatedScore: score,
        },
      }),
      this.prisma.leadExpiryLog.create({
        data: {
          logId,
          leadId: lead.id,
          eventType: 'reopened',
          reason,
          previousStatus: lead.status,
          daysInPrevious: Math.floor((Date.now() - new Date(lead.updatedAt).getTime()) / 86_400_000),
          newStatus: 'reopened',
          actionBy: user.id,
          notificationSentTo: ['manager', 'jr_counsellor'],
        },
      }),
      this.prisma.auditLog.create({
        data: {
          userId: user.id,
          userName: user.fullName,
          userRole: normalizeCanonicalRole(user.role),
          action: 'REOPEN',
          module: 'leads',
          entity: 'Lead',
          entityId: lead.id,
          oldValue: { status: lead.status },
          newValue: { status: 'reopened', reason, assignedTo: assignTo, score },
        },
      }),
    ]);

    await this.notifications.notifyUser({
      userId: assignTo,
      type: 'lead_reopened',
      title: `Lead Reopened: ${lead.leadNumber}`,
      message: `${lead.studentName} was reopened (${reason}). New score: ${score}.`,
      relatedEntityId: lead.id,
      relatedEntityType: 'lead',
      link: `/leads/${lead.id}`,
    });

    return {
      lead_id: lead.leadNumber,
      leadId: lead.id,
      new_status: 'reopened',
      recalculated_score: score,
      follow_up_date: nextFollowUp,
    };
  }

  async disqualifyLead(idOrNumber: string, reason: string, user: any) {
    if (!reason || reason.trim().length < 3) {
      throw new BadRequestException('Disqualification reason is mandatory.');
    }
    const lead = await this.resolveLead(idOrNumber);
    const updated = await this.prisma.lead.update({
      where: { id: lead.id },
      data: {
        status: 'disqualified',
        disqualifyReason: reason.trim(),
        version: { increment: 1 },
      },
    });
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        userName: user.fullName,
        userRole: normalizeCanonicalRole(user.role),
        action: 'UPDATE',
        module: 'leads',
        entity: 'Lead',
        entityId: lead.id,
        oldValue: { status: lead.status },
        newValue: { status: 'disqualified', reason },
      },
    });
    return updated;
  }

  async softDeleteLead(idOrNumber: string, user: any) {
    const lead = await this.resolveLead(idOrNumber);
    const updated = await this.prisma.lead.update({
      where: { id: lead.id },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        userName: user.fullName,
        userRole: normalizeCanonicalRole(user.role),
        action: 'DELETE',
        module: 'leads',
        entity: 'Lead',
        entityId: lead.id,
        oldValue: { deletedAt: null },
        newValue: { deletedAt: updated.deletedAt },
      },
    });
    return updated;
  }

  async restoreLead(idOrNumber: string, user: any) {
    const lead = await this.resolveLead(idOrNumber, true);
    const updated = await this.prisma.lead.update({
      where: { id: lead.id },
      data: { deletedAt: null, version: { increment: 1 } },
    });
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        userName: user.fullName,
        userRole: normalizeCanonicalRole(user.role),
        action: 'RESTORE',
        module: 'leads',
        entity: 'Lead',
        entityId: lead.id,
        newValue: { restored: true },
      },
    });
    return updated;
  }

  async runLifecycleCycleSweep() {
    const leads = await this.prisma.lead.findMany({
      where: {
        deletedAt: null,
        forceExpired: false,
        status: { notIn: ['closed', 'merged', 'admission_done', 'commission_received', 'disqualified'] },
      },
    });
    const now = Date.now();
    let flagged = 0;
    for (const l of leads) {
      const days = Math.floor((now - new Date(l.updatedAt).getTime()) / 86_400_000);
      if (days >= 360) {
        const logId = await this.nextSeqCode('seq_lifecycle_log_id', 'LC', 3);
        await this.prisma.lead.update({
          where: { id: l.id },
          data: { status: 'expired', forceExpired: true, expiryStatus: 'EXPIRED' },
        });
        await this.prisma.leadExpiryLog.create({
          data: {
            logId,
            leadId: l.id,
            eventType: 'force_expired',
            reason: 'Auto force-expired at Day 360 limit',
            previousStatus: l.status,
            daysInPrevious: days,
            newStatus: 'expired',
            notificationSentTo: ['manager', 'super_admin'],
          },
        });
        flagged++;
      } else if (days >= 90 && l.expiryStatus === 'ACTIVE') {
        await this.prisma.lead.update({
          where: { id: l.id },
          data: { expiryStatus: 'DAY_90_PENDING_REVIEW' },
        });
        flagged++;
      }
    }
    return { scanned: leads.length, flagged };
  }

  // =========================================================================
  // LEAD SCORING (5 FACTORS = 100) & RECALCULATION
  // =========================================================================

  async getScoringCriteria() {
    const criteria = await this.prisma.leadScoringConfig.findMany({
      orderBy: { criteriaKey: 'asc' },
    });
    const total = criteria.reduce((s, c) => s + c.weight, 0);
    const map: Record<string, number> = {};
    criteria.forEach((c) => (map[c.criteriaKey] = c.weight));
    const weights = {
      budgetFit: map.budget_match ?? 25,
      parentEngagement: map.engagement ?? 25,
      locationPreference: map.source_quality ?? 20,
      academicReadiness: map.class_demand ?? 15,
      decisionTimeline: map.timeline_urgency ?? 15,
      ...map,
    };
    return { success: true, criteria, weights, total, isValid: total === 100 };
  }

  async updateScoringCriteria(body: any, user: any) {
    const normalized = parseAndValidateSum100Criteria(body, BLUEPRINT_SCORING_KEYS, 'Lead Scoring');
    await this.prisma.$transaction(async (tx) => {
      for (const item of normalized) {
        await tx.leadScoringConfig.upsert({
          where: { criteriaKey: item.criteriaKey },
          update: {
            criteriaName: item.criteriaName,
            weight: item.weight,
            updatedBy: user.id,
          },
          create: {
            criteriaKey: item.criteriaKey,
            criteriaName: item.criteriaName,
            weight: item.weight,
            updatedBy: user.id,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          userId: user.id,
          userName: user.fullName,
          userRole: normalizeCanonicalRole(user.role),
          action: 'UPDATE',
          module: 'scoring',
          entity: 'LeadScoringConfig',
          newValue: normalized,
        },
      });
    });

    const refreshed = await this.getScoringCriteria();
    return {
      ...refreshed,
      message: 'Lead scoring weights saved successfully! Total: 100 ✓',
    };
  }

  async recalculateSingleScore(idOrNumber: string) {
    const lead = await this.resolveLead(idOrNumber);
    const { score, breakdown } = await this.computeLeadScore(lead);
    const updated = await this.prisma.lead.update({
      where: { id: lead.id },
      data: { score, scoreBreakdown: breakdown },
    });
    return { lead_id: updated.leadNumber, leadId: updated.id, score, breakdown };
  }

  async triggerRecalculateAllScores(user: any) {
    return this.queueEngine.enqueueJob({
      queueName: 'scoring',
      jobType: 'RECALCULATE_LEAD_SCORES',
      payload: { requestedBy: user.id },
      userId: user.id,
    });
  }

  async recalculateAllLeadScoresSync(requestedBy?: string) {
    const leads = await this.prisma.lead.findMany({ where: { deletedAt: null } });
    for (const l of leads) {
      const { score, breakdown } = await this.computeLeadScore(l);
      await this.prisma.lead.update({
        where: { id: l.id },
        data: { score, scoreBreakdown: breakdown },
      });
    }
    if (requestedBy) {
      await this.notifications.notifyUser({
        userId: requestedBy,
        type: 'recalculate_complete',
        title: 'Lead Scores Recalculated',
        message: `Successfully recalculated scores for ${leads.length} leads using current 100-point weights.`,
      });
    }
    return { recalculated: leads.length };
  }

  // =========================================================================
  // 8-CRITERIA MATCHING WEIGHTS (= 100), AUTO-SUGGEST & SHORTLISTS
  // =========================================================================

  async getMatchingCriteria() {
    const criteria = await this.prisma.matchingCriteriaWeight.findMany({
      orderBy: { criteriaKey: 'asc' },
    });
    const total = criteria.reduce((s, c) => s + c.weight, 0);
    const map: Record<string, number> = {};
    criteria.forEach((c) => (map[c.criteriaKey] = c.weight));
    const weights = {
      feeBudget: map.fees_range ?? 15,
      boardCurriculum: map.board ?? 15,
      locationDistance: map.state ?? 10,
      academicScore: map.ranking ?? 10,
      sportsFacility: map.facilities ?? 10,
      hostelRating: map.school_type ?? 10,
      entranceExamScore: map.class ?? 15,
      parentIncomeRatio: map.gender ?? 15,
      ...map,
    };
    return { success: true, criteria, items: criteria, weights, total, isValid: total === 100 };
  }

  async updateMatchingCriteria(body: any, user: any) {
    const normalized = parseAndValidateSum100Criteria(
      body,
      BLUEPRINT_MATCHING_KEYS,
      'Matching Criteria',
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.matchingCriteriaWeight.deleteMany({
        where: { criteriaKey: { notIn: normalized.map((x) => x.criteriaKey) } },
      });
      for (const item of normalized) {
        await tx.matchingCriteriaWeight.upsert({
          where: { criteriaKey: item.criteriaKey },
          update: {
            criteriaName: item.criteriaName,
            weight: item.weight,
            updatedBy: user.id,
          },
          create: {
            criteriaKey: item.criteriaKey,
            criteriaName: item.criteriaName,
            weight: item.weight,
            updatedBy: user.id,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          userId: user.id,
          userName: user.fullName,
          userRole: normalizeCanonicalRole(user.role),
          action: 'UPDATE',
          module: 'matching',
          entity: 'MatchingCriteriaWeight',
          newValue: normalized,
        },
      });
    });

    const refreshed = await this.getMatchingCriteria();
    return {
      ...refreshed,
      message: 'School matching criteria weights saved successfully! Total: 100 ✓',
    };
  }

  async suggestSchools(leadOrSample: any, sortBy = 'match_score', limit = 15) {
    const lead =
      leadOrSample.lead_id || leadOrSample.leadId || typeof leadOrSample === 'string'
        ? await this.resolveLead(
            typeof leadOrSample === 'string'
              ? leadOrSample
              : leadOrSample.lead_id || leadOrSample.leadId,
          )
        : leadOrSample;

    const { criteria } = await this.getMatchingCriteria();
    const weights: Record<string, number> = {
      class: 15,
      board: 15,
      fees_range: 15,
      state: 10,
      gender: 15,
      school_type: 10,
      facilities: 10,
      ranking: 10,
    };
    for (const c of criteria) weights[c.criteriaKey] = c.weight;

    const schools = await this.prisma.school.findMany({
      where: { deletedAt: null, status: 'active' },
      orderBy: { rank: 'asc' },
    });

    const targetClass = parseClassGrade(lead.classGrade || lead.applyingForGrade, 6);
    const targetBoard = String(lead.preferredBoard || lead.board || 'CBSE').toLowerCase();
    const targetBudgetMax = this.parseBudgetMax(lead.annualBudget || lead.budget_range, lead.budgetMin, lead.budgetMax);
    const targetLoc = String(lead.preferredLocation || lead.city_preferred || lead.city || '').toLowerCase();
    const targetGender = String(lead.studentGender || lead.gender || 'co_ed').toLowerCase();
    const targetType = String(lead.boardingPreference || lead.school_type || 'boarding').toLowerCase();

    const scored = schools.map((s) => {
      // 1. class
      let classPts = weights.class;
      const range = String(s.classesOffered || '1-12').match(/(\d+)\s*-\s*(\d+)/);
      if (range) {
        const minC = Number(range[1]);
        const maxC = Number(range[2]);
        classPts = targetClass >= minC && targetClass <= maxC ? weights.class : 0;
      }

      // 2. board
      const boardPts =
        String(s.board || '').toLowerCase() === targetBoard
          ? weights.board
          : Math.round(weights.board * 0.25);

      // 3. fees_range
      const feesPts =
        s.minFeeAnnual <= targetBudgetMax * 1.1
          ? weights.fees_range
          : s.minFeeAnnual <= targetBudgetMax * 1.35
            ? Math.round(weights.fees_range * 0.5)
            : 0;

      // 4. state / location
      const schoolLoc = `${s.state} ${s.city}`.toLowerCase();
      const statePts =
        !targetLoc || schoolLoc.includes(targetLoc)
          ? weights.state
          : s.state.toLowerCase().includes('uttarakhand')
            ? Math.round(weights.state * 0.5)
            : 0;

      // 5. gender
      const sg = String(s.genderType || 'co_ed').toLowerCase();
      const genderMatch =
        sg === 'co_ed' ||
        (targetGender === 'male' && sg === 'boys') ||
        (targetGender === 'female' && sg === 'girls') ||
        targetGender === 'co_ed';
      const genderPts = genderMatch ? weights.gender : 0;

      // 6. school_type
      const schoolTypePts =
        String(s.category || 'boarding').toLowerCase() === targetType
          ? weights.school_type
          : Math.round(weights.school_type * 0.4);

      // 7. facilities
      const facilitiesPts =
        (s.sports?.length || 0) >= 4
          ? weights.facilities
          : Math.round(weights.facilities * 0.6);

      // 8. ranking
      const rankPts =
        s.rank <= 25
          ? weights.ranking
          : s.rank <= 100
            ? Math.round(weights.ranking * 0.8)
            : Math.round(weights.ranking * 0.5);

      const matchScore = Math.min(
        100,
        classPts + boardPts + feesPts + statePts + genderPts + schoolTypePts + facilitiesPts + rankPts,
      );

      return {
        school_id: s.id,
        schoolId: s.id,
        schoolCode: s.schoolCode,
        name: s.name,
        city: s.city,
        state: s.state,
        board: s.board,
        type: s.genderType,
        category: s.category,
        feesDisplay: s.feesDisplay,
        minFeeAnnual: s.minFeeAnnual,
        maxFeeAnnual: s.maxFeeAnnual,
        rank: s.rank,
        match_score: matchScore,
        matchScore,
        criteria_breakdown: {
          class: classPts,
          board: boardPts,
          fees_range: feesPts,
          state: statePts,
          gender: genderPts,
          school_type: schoolTypePts,
          facilities: facilitiesPts,
          ranking: rankPts,
        },
      };
    });

    if (sortBy === 'fees_asc') {
      scored.sort((a, b) => a.minFeeAnnual - b.minFeeAnnual);
    } else if (sortBy === 'ranking') {
      scored.sort((a, b) => a.rank - b.rank);
    } else {
      scored.sort((a, b) => b.match_score - a.match_score);
    }

    return {
      weights_used: weights,
      suggested_schools: scored.slice(0, limit),
    };
  }

  async getShortlist(idOrNumber: string) {
    const lead = await this.resolveLead(idOrNumber);
    return this.prisma.shortlist.findMany({
      where: { leadId: lead.id, deletedAt: null },
      include: { school: true },
      orderBy: { priorityOrder: 'asc' },
    });
  }

  async addToShortlist(idOrNumber: string, body: any, user: any) {
    const lead = await this.resolveLead(idOrNumber);
    const schoolRef = body.schoolId || body.school_id;
    const school = await this.prisma.school.findFirst({
      where: { OR: [{ id: schoolRef }, { schoolCode: schoolRef }], deletedAt: null },
    });
    if (!school) throw new NotFoundException('School not found.');
    if (school.status === 'inactive') {
      throw new BadRequestException('Cannot shortlist an inactive school.');
    }

    const dup = await this.prisma.shortlist.findFirst({
      where: { leadId: lead.id, schoolId: school.id, deletedAt: null },
    });
    if (dup) {
      throw new BadRequestException('School is already shortlisted for this lead.');
    }

    const softDeleted = await this.prisma.shortlist.findFirst({
      where: { leadId: lead.id, schoolId: school.id },
    });

    const shortlistCount = await this.prisma.shortlist.count({
      where: { leadId: lead.id, deletedAt: null },
    });

    const shortlist = softDeleted
      ? await this.prisma.shortlist.update({
          where: { id: softDeleted.id },
          data: {
            deletedAt: null,
            notes: body.notes || body.note || null,
            priorityOrder: body.priority_order || body.priorityOrder || shortlistCount + 1,
            matchScore: Number(body.match_score || body.matchScore || 80),
            addedById: user.id,
          },
          include: { school: true },
        })
      : await this.prisma.shortlist.create({
          data: {
            leadId: lead.id,
            schoolId: school.id,
            notes: body.notes || body.note || null,
            priorityOrder: body.priority_order || body.priorityOrder || shortlistCount + 1,
            matchScore: Number(body.match_score || body.matchScore || 80),
            addedById: user.id,
          },
          include: { school: true },
        });

    if (['new', 'NEW_LEAD', 'contacted', 'CONTACTED', 'qualified'].includes(lead.status)) {
      await this.prisma.lead.update({
        where: { id: lead.id },
        data: { status: 'shortlisted' },
      });
    }

    return shortlist;
  }

  async updateShortlistNote(idOrNumber: string, schoolRef: string, body: any) {
    const lead = await this.resolveLead(idOrNumber);
    const school = await this.prisma.school.findFirst({
      where: { OR: [{ id: schoolRef }, { schoolCode: schoolRef }] },
    });
    const sl = await this.prisma.shortlist.findFirst({
      where: { leadId: lead.id, schoolId: school?.id || schoolRef, deletedAt: null },
    });
    if (!sl) throw new NotFoundException('Shortlist entry not found.');
    return this.prisma.shortlist.update({
      where: { id: sl.id },
      data: {
        notes: body.note ?? body.notes ?? sl.notes,
        priorityOrder: body.priority_order ?? body.priorityOrder ?? sl.priorityOrder,
      },
      include: { school: true },
    });
  }

  async removeFromShortlist(idOrNumber: string, schoolRef: string) {
    const lead = await this.resolveLead(idOrNumber);
    const school = await this.prisma.school.findFirst({
      where: { OR: [{ id: schoolRef }, { schoolCode: schoolRef }] },
    });
    const sl = await this.prisma.shortlist.findFirst({
      where: { leadId: lead.id, schoolId: school?.id || schoolRef, deletedAt: null },
    });
    if (!sl) throw new NotFoundException('Shortlist entry not found.');
    await this.prisma.shortlist.update({
      where: { id: sl.id },
      data: { deletedAt: new Date() },
    });
    return { removed: true };
  }

  // Legacy Verification & Activity Confirmation Bridge for test_25_features.js
  async submitForVerification(id: string, user: any) {
    const lead = await this.resolveLead(id);
    const updated = await this.prisma.lead.update({
      where: { id: lead.id },
      data: { verificationStatus: 'PENDING_VERIFICATION', version: { increment: 1 } },
    });
    await this.notifications.notifyRoles(['SENIOR_MANAGER', 'SUPER_ADMIN'], {
      type: 'lead_assigned',
      title: `Lead Submitted for Verification: ${lead.leadNumber}`,
      message: `${user.fullName} submitted ${lead.studentName} for Manager verification.`,
      relatedEntityId: lead.id,
      relatedEntityType: 'lead',
    });
    return updated;
  }

  async verifyLead(id: string, decision: string, returnRemarks: string, user: any) {
    const lead = await this.resolveLead(id);
    const approved = String(decision).toUpperCase() === 'APPROVE';
    return this.prisma.lead.update({
      where: { id: lead.id },
      data: {
        verificationStatus: approved ? 'APPROVED' : 'RETURNED',
        verifiedById: user.id,
        verifiedAt: new Date(),
        returnRemarks: approved ? null : returnRemarks || 'Please update remarks',
        version: { increment: 1 },
      },
    });
  }

  async logActivityConfirmation(id: string, body: any, user: any) {
    const lead = await this.resolveLead(id);
    const activity = await this.prisma.activityConfirmation.create({
      data: {
        leadId: lead.id,
        counsellorId: user.id,
        activityType: body.type || 'PHONE_CALL',
        notes: body.notes || 'Contact attempt logged',
        status: 'PENDING',
      },
    });
    return activity;
  }

  async confirmActivity(activityId: string, body: any, user: any) {
    const existing = await this.prisma.activityConfirmation.findUnique({
      where: { id: activityId },
    });
    if (!existing) throw new NotFoundException('Activity confirmation record not found.');
    return this.prisma.activityConfirmation.update({
      where: { id: activityId },
      data: {
        status: 'CONFIRMED',
        outcome: body.outcome || 'CONNECTED',
        notes: body.notes || existing.notes,
        confirmedAt: new Date(),
        confirmedById: user.id,
      },
    });
  }

  buildLeadsExcelBuffer(leads: any[]): Buffer {
    const rows = leads.map((l) => ({
      'Lead ID': l.leadNumber,
      'Student Name': l.studentName,
      Class: l.applyingForGrade,
      Board: l.preferredBoard,
      'Parent Name': l.parentName,
      Mobile: l.parentPhone,
      City: l.city || '',
      Budget: l.annualBudget || '',
      Status: l.status,
      Score: l.score,
      Source: l.leadSource || '',
      'Follow Up Date': l.nextFollowUpDate ? new Date(l.nextFollowUpDate).toISOString().slice(0, 10) : '',
      Counsellor: l.assignedCounsellor?.fullName || 'Unassigned',
      'Created At': new Date(l.createdAt).toISOString().slice(0, 10),
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Leads');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }
}
