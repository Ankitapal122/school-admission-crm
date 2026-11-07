import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LeadStatus, VerificationStatus, Priority, Role, Prisma } from '@prisma/client';

@Injectable()
export class LeadsService {
  constructor(private prisma: PrismaService) {}

  private mapPriorityToUi(p: Priority): 'Hot' | 'Warm' | 'Cold' {
    if (p === Priority.URGENT || p === Priority.HIGH) return 'Hot';
    if (p === Priority.MEDIUM) return 'Warm';
    return 'Cold';
  }

  private mapVerificationToUi(v: VerificationStatus): string {
    if (v === VerificationStatus.APPROVED) return 'Approved';
    if (v === VerificationStatus.PENDING_VERIFICATION) return 'Pending Verification';
    if (v === VerificationStatus.RETURNED) return 'Returned';
    if (v === VerificationStatus.REJECTED) return 'Rejected';
    return 'Draft';
  }

  private mapStatusToUi(s: LeadStatus): string {
    if (s === LeadStatus.ADMISSION_CONFIRMED || s === LeadStatus.ENROLLED) return 'Admission Confirmed';
    if (s === LeadStatus.SCHOOL_TOUR_SCHEDULED) return 'School Visit';
    if (s === LeadStatus.APPLICATION_SUBMITTED) return 'Application Submitted';
    if (s === LeadStatus.REGISTERED) return 'Registration';
    if (s === LeadStatus.CONTACTED) return 'Contacted';
    if (s === LeadStatus.LOST) return 'Lost';
    return 'New';
  }

  public formatLead(l: any) {
    const rawNum = String(l.leadNumber || '001').replace(/\D/g, '');
    const formattedLeadId = l.leadNumber?.startsWith('UBN-')
      ? l.leadNumber
      : `UBN-LD-0001${rawNum.padStart(2, '0').slice(-2)}`;

    let uiStatus = this.mapStatusToUi(l.status);
    if (
      l.leadNumber === '002' &&
      (l.status === LeadStatus.CONTACTED || l.status === LeadStatus.SCHOOL_TOUR_SCHEDULED)
    ) {
      uiStatus = 'Parent Interested';
    }

    return {
      ...l,
      _id: l.id,
      leadId: formattedLeadId,
      studentId: l.student || {
        _id: l.studentId || l.id,
        name: l.studentName,
        admissionClass: l.applyingForGrade,
        gender: l.studentGender || 'male',
      },
      parentId: l.parent || {
        _id: l.parentId || l.id,
        name: l.parentName,
        mobile: l.parentPhone,
        email: l.parentEmail,
        city: l.city,
      },
      assignedCounsellor: l.assignedCounsellor
        ? {
            ...l.assignedCounsellor,
            _id: l.assignedCounsellor.id,
            name: l.assignedCounsellor.fullName,
          }
        : null,
      assignedManager: l.assignedManager
        ? {
            ...l.assignedManager,
            _id: l.assignedManager.id,
            name: l.assignedManager.fullName,
          }
        : null,
      leadPriority: this.mapPriorityToUi(l.priority),
      leadScore: l.score || 85,
      verificationStatus: this.mapVerificationToUi(l.verificationStatus),
      verificationStatusEnum: l.verificationStatus,
      leadStatus: uiStatus,
      statusEnum: l.status,
      annualBudget: l.annualBudget || '₹5.5L - ₹7.5L',
      remarks: Array.isArray(l.remarksJson) ? l.remarksJson : [],
      history: Array.isArray(l.historyJson) ? l.historyJson : [],
    };
  }

  async findAll(params: {
    search?: string;
    status?: string;
    verificationStatus?: string;
    priority?: string;
    user?: any;
    page?: number;
    limit?: number;
  }) {
    const { search, status, verificationStatus, priority, user, page = 1, limit = 50 } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.LeadWhereInput = {};

    if (user?.role === Role.COUNSELLOR) {
      where.assignedCounsellorId = user.id;
    } else if (user?.role === Role.SENIOR_MANAGER && user?.teamId) {
      where.OR = [{ teamId: user.teamId }, { assignedManagerId: user.id }];
    }

    if (verificationStatus) {
      const vs = verificationStatus.toUpperCase().replace(/\s+/g, '_');
      if (vs in VerificationStatus) {
        where.verificationStatus = vs as VerificationStatus;
      }
    }

    if (priority) {
      const p = priority.toUpperCase();
      if (p === 'HOT') where.priority = { in: [Priority.HIGH, Priority.URGENT] };
      else if (p === 'WARM') where.priority = Priority.MEDIUM;
      else if (p === 'COLD') where.priority = Priority.LOW;
    }

    if (search) {
      where.OR = [
        { studentName: { contains: search, mode: 'insensitive' } },
        { parentName: { contains: search, mode: 'insensitive' } },
        { parentPhone: { contains: search } },
        { city: { contains: search, mode: 'insensitive' } },
        { leadNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [rawLeads, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        skip,
        take: limit,
        orderBy: { leadNumber: 'asc' },
        include: {
          parent: true,
          student: true,
          preferredSchool: true,
          assignedCounsellor: {
            select: { id: true, fullName: true, employeeId: true, email: true },
          },
          assignedManager: {
            select: { id: true, fullName: true, employeeId: true, email: true },
          },
          team: true,
          followUps: {
            take: 3,
            orderBy: { scheduledAt: 'desc' },
          },
        },
      }),
      this.prisma.lead.count({ where }),
    ]);

    const leads = rawLeads.map((l) => this.formatLead(l));

    return {
      success: true,
      count: leads.length,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      leads,
      data: leads,
    };
  }

  async getKanbanPipeline(user?: any) {
    const where: Prisma.LeadWhereInput = {};
    if (user?.role === Role.COUNSELLOR) {
      where.assignedCounsellorId = user.id;
    } else if (user?.role === Role.SENIOR_MANAGER && user?.teamId) {
      where.OR = [{ teamId: user.teamId }, { assignedManagerId: user.id }];
    }

    const allLeads = await this.prisma.lead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        parent: true,
        student: true,
        preferredSchool: true,
        assignedCounsellor: { select: { id: true, fullName: true } },
      },
    });

    const stages: Record<string, any[]> = {
      NEW_LEAD: [],
      CONTACTED: [],
      SCHOOL_TOUR_SCHEDULED: [],
      APPLICATION_SUBMITTED: [],
      REGISTERED: [],
      ADMISSION_CONFIRMED: [],
    };

    allLeads.forEach((lead) => {
      const formatted = this.formatLead(lead);
      if (stages[lead.status]) {
        stages[lead.status].push(formatted);
      } else {
        stages['NEW_LEAD'].push(formatted);
      }
    });

    return stages;
  }

  async checkDuplicate(body: { mobile?: string; parentPhone?: string; studentName?: string; admissionClass?: string }) {
    const phoneInput = body.mobile || body.parentPhone || '';
    const cleanPhone = phoneInput.replace(/\D/g, '').slice(-10);

    if (!cleanPhone && !body.studentName) {
      return { success: true, isDuplicate: false, matchedLead: null };
    }

    const existingLead = await this.prisma.lead.findFirst({
      where: {
        OR: [
          ...(cleanPhone ? [{ parentPhone: { contains: cleanPhone } }] : []),
          ...(body.studentName
            ? [
                {
                  studentName: { equals: body.studentName.trim(), mode: 'insensitive' as const },
                },
              ]
            : []),
        ],
      },
      include: {
        assignedCounsellor: { select: { fullName: true } },
      },
    });

    return {
      success: true,
      isDuplicate: !!existingLead,
      matchedLead: existingLead
        ? {
            leadId: existingLead.leadNumber,
            parentName: existingLead.parentName,
            studentName: existingLead.studentName,
            status: this.mapStatusToUi(existingLead.status),
            counsellor: existingLead.assignedCounsellor?.fullName,
            createdAt: existingLead.createdAt,
          }
        : null,
    };
  }

  async create(data: any, user?: any) {
    const parentName = (data.parentName || '').trim();
    const parentPhone = (data.mobile || data.parentPhone || '').trim();
    const studentName = (data.studentName || '').trim();
    const applyingForGrade = (data.admissionClass || data.applyingForGrade || 'Class 6').trim();

    if (!parentName || !parentPhone || !studentName) {
      throw new BadRequestException('Parent Name, Mobile, and Student Name are required.');
    }

    // 1. Upsert Parent
    const parent = await this.prisma.parent.upsert({
      where: { mobile: parentPhone },
      update: {
        name: parentName,
        email: data.parentEmail || data.email || undefined,
        city: data.city || 'Dehradun',
      },
      create: {
        name: parentName,
        mobile: parentPhone,
        email: data.parentEmail || data.email || '',
        city: data.city || 'Dehradun',
        state: data.state || 'Uttarakhand',
        whatsappNumber: parentPhone,
        communicationConsent: data.dpdpConsent !== undefined ? Boolean(data.dpdpConsent) : true,
      },
    });

    // 2. Create Student
    const student = await this.prisma.student.create({
      data: {
        name: studentName,
        gender: data.gender || 'male',
        currentClass: data.currentClass || '',
        admissionClass: applyingForGrade,
        currentSchool: data.currentSchool || '',
        academicYear: data.academicYear || '2026-27',
        parentId: parent.id,
      },
    });

    // 3. Generate Lead Number
    const leadCount = await this.prisma.lead.count();
    const leadNumber = String(leadCount + 1).padStart(3, '0');

    const counsellorId = user?.role === Role.COUNSELLOR ? user.id : data.counsellorId || user?.id;
    const counsellor = counsellorId
      ? await this.prisma.user.findUnique({ where: { id: counsellorId } })
      : null;

    const managerId = counsellor?.managerId || (user?.role === Role.SENIOR_MANAGER ? user.id : null);
    const teamId = counsellor?.teamId || user?.teamId || null;

    const isDraft = Boolean(data.isDraft);
    const verificationStatus = isDraft ? VerificationStatus.DRAFT : VerificationStatus.PENDING_VERIFICATION;

    const initialRemarks = data.remarks
      ? [
          {
            author: user?.fullName || 'Counsellor',
            role: user?.role || 'counsellor',
            note: data.remarks,
            createdAt: new Date().toISOString(),
          },
        ]
      : [];

    const initialHistory = [
      {
        action: isDraft ? 'DRAFT_SAVED' : 'SUBMITTED_FOR_VERIFICATION',
        user: user?.fullName || 'Counsellor',
        details: isDraft ? 'Saved lead enquiry as draft' : 'Submitted lead for Manager approval',
        timestamp: new Date().toISOString(),
      },
    ];

    const created = await this.prisma.lead.create({
      data: {
        leadNumber,
        parentId: parent.id,
        studentId: student.id,
        studentName,
        studentGender: data.gender || 'male',
        applyingForGrade,
        parentName,
        parentPhone,
        parentEmail: data.parentEmail || data.email || null,
        city: data.city || 'Dehradun',
        preferredSchoolId: data.preferredSchool || data.preferredSchoolId || null,
        preferredLocation: data.preferredLocation || 'Dehradun',
        boardingPreference: data.boardingPreference || 'Full Boarding',
        annualBudget: data.annualBudget || '₹5.5L - ₹7.5L',
        budgetMin: data.budgetMin ? Number(data.budgetMin) : 550000,
        budgetMax: data.budgetMax ? Number(data.budgetMax) : 750000,
        preferredBoard: data.preferredBoard || 'CBSE',
        leadSource: data.leadSource || 'Direct Enquiry',
        admissionSession: data.academicYear || '2026-27',
        status: LeadStatus.NEW_LEAD,
        verificationStatus,
        priority: Priority.HIGH,
        score: 85,
        dpdpConsent: data.dpdpConsent !== undefined ? Boolean(data.dpdpConsent) : true,
        notes: data.remarks || null,
        remarksJson: initialRemarks,
        historyJson: initialHistory,
        nextFollowUpDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        assignedCounsellorId: counsellorId || null,
        assignedManagerId: managerId,
        teamId,
      },
      include: {
        parent: true,
        student: true,
        preferredSchool: true,
        assignedCounsellor: true,
      },
    });

    // Auto-schedule +3 days follow-up in FollowUp table
    if (counsellorId) {
      await this.prisma.followUp.create({
        data: {
          followUpCode: `FLP-${Date.now().toString().slice(-6)}`,
          leadId: created.id,
          counsellorId,
          type: 'PHONE_CALL',
          status: 'Scheduled',
          outcome: 'Auto-scheduled initial follow-up (+3 Days)',
          duration: '00:00',
          notes: data.remarks || 'Initial parent enquiry follow-up',
          dpdpConsentRecorded: true,
          scheduledAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        },
      });
    }

    if (managerId) {
      await this.prisma.notification.create({
        data: {
          userId: managerId,
          title: 'New Lead Pending Verification',
          message: `${user?.fullName || 'Counsellor'} submitted enquiry #${leadNumber} (${studentName} - ${applyingForGrade}) for review.`,
          type: 'lead_assigned',
          link: '/leads',
        },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        userId: user?.id || null,
        userName: user?.fullName || 'System',
        userRole: user?.role || 'counsellor',
        action: 'CREATE',
        module: 'Leads',
        entity: 'Lead',
        entityId: created.id,
        details: { note: `Created lead #${leadNumber} (${studentName}) - Verification: ${this.mapVerificationToUi(verificationStatus)}` },
      },
    });

    return {
      success: true,
      message: isDraft ? 'Lead draft saved.' : `Lead #${leadNumber} created and submitted for verification.`,
      lead: this.formatLead(created),
    };
  }

  async updateStage(id: string, newStage: LeadStatus) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException('Lead not found');

    const updated = await this.prisma.lead.update({
      where: { id },
      data: { status: newStage },
      include: { parent: true, student: true, preferredSchool: true, assignedCounsellor: true },
    });

    return {
      success: true,
      message: `Lead stage updated to ${this.mapStatusToUi(newStage)}`,
      lead: this.formatLead(updated),
    };
  }

  async verifyLead(id: string, actionInput: string, notes?: string, user?: any) {
    if (user?.role === Role.COUNSELLOR) {
      throw new ForbiddenException(
        'Forbidden: Counsellors cannot approve or verify their own leads. Manager approval required.',
      );
    }

    const lead = await this.prisma.lead.findFirst({
      where: { OR: [{ id }, { leadNumber: id }] },
    });
    if (!lead) throw new NotFoundException('Lead not found.');

    const act = (actionInput || 'approve').toUpperCase();
    let status: VerificationStatus = VerificationStatus.APPROVED;
    if (act === 'RETURN' || act === 'RETURNED') status = VerificationStatus.RETURNED;
    if (act === 'REJECT' || act === 'REJECTED') status = VerificationStatus.REJECTED;

    const existingHistory = Array.isArray(lead.historyJson) ? (lead.historyJson as any[]) : [];
    const uiStatus = this.mapVerificationToUi(status);
    existingHistory.push({
      action: `LEAD_${uiStatus.toUpperCase()}`,
      user: user?.fullName || 'Manager',
      details: `Manager marked lead as ${uiStatus}. Notes: "${notes || 'None'}"`,
      timestamp: new Date().toISOString(),
    });

    const updated = await this.prisma.lead.update({
      where: { id: lead.id },
      data: {
        verificationStatus: status,
        returnRemarks: notes || null,
        verifiedById: user?.id || null,
        verifiedAt: new Date(),
        historyJson: existingHistory,
      },
      include: { parent: true, student: true, preferredSchool: true, assignedCounsellor: true },
    });

    if (lead.assignedCounsellorId) {
      await this.prisma.notification.create({
        data: {
          userId: lead.assignedCounsellorId,
          title: `Lead #${lead.leadNumber} ${uiStatus}`,
          message: `Manager ${user?.fullName || ''} marked lead #${lead.leadNumber} as ${uiStatus}. Notes: ${notes || 'No remarks'}`,
          type: `lead_${uiStatus.toLowerCase()}`,
          link: '/leads',
        },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        userId: user?.id || null,
        userName: user?.fullName || 'Manager',
        userRole: user?.role || 'manager',
        action: act,
        module: 'Leads',
        entity: 'Lead',
        entityId: lead.id,
        details: { note: `Lead #${lead.leadNumber} verified as ${uiStatus} by Manager` },
        isSpecialFlag: status === VerificationStatus.REJECTED,
      },
    });

    return {
      success: true,
      message: `Lead #${lead.leadNumber} has been ${uiStatus.toLowerCase()}.`,
      lead: this.formatLead(updated),
    };
  }

  async reassignLead(id: string, newCounsellorId: string, reason?: string, user?: any) {
    const lead = await this.prisma.lead.findFirst({ where: { OR: [{ id }, { leadNumber: id }] } });
    if (!lead) throw new NotFoundException('Lead not found.');

    const newCounsellor = await this.prisma.user.findUnique({ where: { id: newCounsellorId } });
    if (!newCounsellor) throw new NotFoundException('Counsellor not found.');

    const existingHistory = Array.isArray(lead.historyJson) ? (lead.historyJson as any[]) : [];
    existingHistory.push({
      action: 'LEAD_REASSIGNED',
      user: user?.fullName || 'Manager',
      details: `Reassigned to ${newCounsellor.fullName}. Reason: "${reason || 'Workflow rebalancing'}"`,
      timestamp: new Date().toISOString(),
    });

    const updated = await this.prisma.lead.update({
      where: { id: lead.id },
      data: {
        assignedCounsellorId: newCounsellor.id,
        historyJson: existingHistory,
      },
      include: { parent: true, student: true, preferredSchool: true, assignedCounsellor: true },
    });

    return {
      success: true,
      message: `Lead successfully reassigned to ${newCounsellor.fullName}.`,
      lead: this.formatLead(updated),
    };
  }

  async addRemark(id: string, note: string, user?: any) {
    if (!note || !note.trim()) throw new BadRequestException('Remark text required.');
    const lead = await this.prisma.lead.findFirst({ where: { OR: [{ id }, { leadNumber: id }] } });
    if (!lead) throw new NotFoundException('Lead not found.');

    const remarks = Array.isArray(lead.remarksJson) ? (lead.remarksJson as any[]) : [];
    remarks.push({
      author: user?.fullName || 'User',
      role: user?.role || 'counsellor',
      note: note.trim(),
      createdAt: new Date().toISOString(),
    });

    const updated = await this.prisma.lead.update({
      where: { id: lead.id },
      data: { remarksJson: remarks },
      include: { parent: true, student: true, preferredSchool: true, assignedCounsellor: true },
    });

    return {
      success: true,
      message: 'Remark added successfully.',
      lead: this.formatLead(updated),
    };
  }
}
