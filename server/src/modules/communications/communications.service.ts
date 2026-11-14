import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { normalizeCanonicalRole, normalizeIndianPhone } from '../../common/utils/crm.utils';

export const CALL_OUTCOMES = [
  { key: 'interested', label: 'Interested' },
  { key: 'not_interested', label: 'Not Interested' },
  { key: 'not_picked', label: 'Not Picked' },
  { key: 'wrong_number', label: 'Wrong Number' },
  { key: 'callback_later', label: 'Callback Later' },
  { key: 'busy', label: 'Number Busy' },
  { key: 'switched_off', label: 'Switched Off' },
];

@Injectable()
export class CommunicationsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  private async nextSeqCode(seqName: string, prefix: string, pad = 3): Promise<string> {
    const rows: any[] = await this.prisma.$queryRawUnsafe(`SELECT nextval('${seqName}')::bigint AS n`);
    const num = Number(rows[0]?.n || 1);
    return `${prefix}${String(num).padStart(pad, '0')}`;
  }

  private async resolveLead(leadRef: string) {
    const lead = await this.prisma.lead.findFirst({
      where: {
        OR: [{ id: leadRef }, { leadNumber: leadRef }],
        deletedAt: null,
      },
      include: {
        assignedCounsellor: { select: { id: true, fullName: true } },
        shortlists: {
          where: { deletedAt: null },
          include: { school: { select: { name: true, whatsappGroupId: true } } },
          take: 3,
        },
      },
    });
    if (!lead) throw new NotFoundException(`Lead "${leadRef}" not found.`);
    return lead;
  }

  private async enforceLayer3Gate(userId: string, targetLeadId: string, force?: boolean) {
    if (force) return;
    const blocking = await this.prisma.pendingLoggingQueue.findFirst({
      where: {
        userId,
        status: { in: ['pending', 'escalated'] },
        leadId: { not: targetLeadId },
      },
      orderBy: { createdAt: 'asc' },
      include: { lead: { select: { leadNumber: true, studentName: true } } },
    });
    if (blocking) {
      throw new ConflictException({
        success: false,
        message: `Please confirm the outcome of your previous ${blocking.actionType} for ${blocking.lead?.studentName || blocking.leadId} (${blocking.lead?.leadNumber || ''}) before contacting another lead.`,
        error: {
          code: 'PENDING_LOGGING_BLOCK',
          pendingItem: blocking,
        },
      });
    }
  }

  private async getWhatsappLimits() {
    const s = await this.prisma.systemSetting.findUnique({ where: { key: 'whatsapp_limits' } });
    const val = (s?.value as any) || {};
    return {
      warningLength: Number(val.warningLength ?? 800),
      maxLength: Number(val.maxLength ?? 2000),
      maxUrlLength: Number(val.maxUrlLength ?? 4000),
    };
  }

  async listTemplates() {
    return this.prisma.whatsappTemplate.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async createTemplate(body: any, actor: any) {
    const templateKey =
      body.templateKey ||
      body.template_key ||
      String(body.name || 'custom')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');

    const created = await this.prisma.whatsappTemplate.create({
      data: {
        templateKey,
        name: body.name,
        body: body.body,
        recipientType: body.recipientType || body.recipient_type || 'parent',
        category: body.category || 'general',
        isActive: body.isActive ?? body.is_active ?? true,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        userId: actor.id,
        userName: actor.fullName,
        userRole: normalizeCanonicalRole(actor.role),
        action: 'CREATE',
        module: 'whatsapp',
        entity: 'WhatsappTemplate',
        entityId: created.id,
        newValue: created,
      },
    });
    return created;
  }

  async updateTemplate(id: string, body: any, actor: any) {
    const existing = await this.prisma.whatsappTemplate.findFirst({
      where: { OR: [{ id }, { templateKey: id }] },
    });
    if (!existing) throw new NotFoundException('WhatsApp template not found.');

    const updated = await this.prisma.whatsappTemplate.update({
      where: { id: existing.id },
      data: {
        name: body.name ?? existing.name,
        body: body.body ?? existing.body,
        recipientType: body.recipientType ?? body.recipient_type ?? existing.recipientType,
        category: body.category ?? existing.category,
        isActive: body.isActive ?? body.is_active ?? existing.isActive,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        userId: actor.id,
        userName: actor.fullName,
        userRole: normalizeCanonicalRole(actor.role),
        action: 'UPDATE',
        module: 'whatsapp',
        entity: 'WhatsappTemplate',
        entityId: existing.id,
        oldValue: existing,
        newValue: updated,
      },
    });
    return updated;
  }

  private interpolateTemplate(text: string, vars: Record<string, string>) {
    let out = text;
    for (const [k, v] of Object.entries(vars)) {
      out = out.replace(new RegExp(`\\{${k}\\}`, 'gi'), v);
    }
    return out;
  }

  async generateWhatsappLink(body: any, actor: any) {
    const leadRef = body.lead_id || body.leadId;
    if (!leadRef) throw new BadRequestException('lead_id is required.');

    const lead = await this.resolveLead(leadRef);
    await this.enforceLayer3Gate(actor.id, lead.id, Boolean(body.force));

    const recipientType = body.recipient_type || body.recipientType || 'parent';
    const templateKey = body.template_id || body.templateId || body.templateKey;
    let schoolName = body.school_name || body.schoolName || '';
    let recipientGroupId = body.recipient_group_id || body.recipientGroupId || null;

    if (!schoolName && lead.shortlists?.length > 0) {
      schoolName = lead.shortlists.map((s: any) => s.school?.name).filter(Boolean).join(', ');
      if (!recipientGroupId) {
        recipientGroupId = lead.shortlists[0]?.school?.whatsappGroupId || null;
      }
    }
    if (!schoolName) schoolName = 'our partner boarding schools';

    let messageBody = String(body.message || body.customMessage || '').trim();
    let matchedTemplateKey: string | null = null;
    if (templateKey) {
      const tpl = await this.prisma.whatsappTemplate.findFirst({
        where: { OR: [{ id: templateKey }, { templateKey }], isActive: true },
      });
      if (tpl) {
        matchedTemplateKey = tpl.templateKey;
        const vars: Record<string, string> = {
          parent_name: lead.parentName || lead.fatherName || 'Parent',
          parentName: lead.parentName || lead.fatherName || 'Parent',
          student_name: lead.studentName,
          studentName: lead.studentName,
          school_name: schoolName,
          schoolName: schoolName,
          class_grade: String(lead.classGrade || lead.applyingForGrade || ''),
          classGrade: String(lead.classGrade || lead.applyingForGrade || ''),
          lead_id: lead.leadNumber,
          leadNumber: lead.leadNumber,
          counsellor_name: actor.fullName || 'BoardingEdu Counsellor',
          academic_year: lead.academicYear || lead.admissionSession || '2026-27',
          mobile: lead.whatsappNumber || lead.parentPhone,
        };
        if (!messageBody) {
          messageBody = this.interpolateTemplate(tpl.body, vars);
        }
        await this.prisma.whatsappTemplate.update({
          where: { id: tpl.id },
          data: { usageCount: { increment: 1 } },
        });
      }
    }

    if (!messageBody) {
      messageBody = `Namaste ${lead.parentName} ji! Reaching out from BoardingEdu regarding ${lead.studentName}'s admission enquiry (${lead.leadNumber}).`;
    }

    const limits = await this.getWhatsappLimits();
    if (messageBody.length > limits.maxLength) {
      throw new BadRequestException({
        success: false,
        message: `WhatsApp message exceeds hard limit of ${limits.maxLength} characters (got ${messageBody.length}).`,
        error: { code: 'WA_LENGTH_EXCEEDED', max: limits.maxLength, length: messageBody.length },
      });
    }

    const normalizedMobile = normalizeIndianPhone(
      body.recipient_mobile || body.recipientMobile || lead.whatsappNumber || lead.parentPhone,
      recipientType === 'parent',
    );
    const digitsOnly = (normalizedMobile || '').replace(/\D/g, '');
    const encoded = encodeURIComponent(messageBody);
    const whatsappUrl =
      recipientType === 'school_group' && recipientGroupId && !digitsOnly
        ? `https://wa.me/?text=${encoded}`
        : `https://wa.me/${digitsOnly}?text=${encoded}`;

    if (whatsappUrl.length >= limits.maxUrlLength) {
      throw new BadRequestException({
        success: false,
        message: `Generated wa.me URL must stay under ${limits.maxUrlLength} characters (got ${whatsappUrl.length}).`,
        error: { code: 'WA_URL_TOO_LONG', urlLength: whatsappUrl.length },
      });
    }

    const logId = await this.nextSeqCode('seq_wa_log_id', 'LG', 3);
    const waLog = await this.prisma.whatsappLog.create({
      data: {
        logId,
        leadId: lead.id,
        direction: 'outbound',
        templateId: matchedTemplateKey,
        recipientType,
        recipientMobile: normalizedMobile,
        recipientGroupId,
        sentBy: actor.id,
        messageBody,
        status: 'pending',
      },
    });

    const pendingItem = await this.prisma.pendingLoggingQueue.create({
      data: {
        userId: actor.id,
        leadId: lead.id,
        actionType: 'whatsapp_sent',
        referenceLogId: waLog.id,
        status: 'pending',
        ageBucket: 'under_1h',
      },
    });

    const lengthWarning = messageBody.length > limits.warningLength;
    return {
      whatsapp_url: whatsappUrl,
      whatsappUrl,
      message_body: messageBody,
      message_body_length: messageBody.length,
      url_length: whatsappUrl.length,
      length_warning: lengthWarning,
      length_error: false,
      log_id: waLog.logId,
      logUuid: waLog.id,
      pending_queue_id: pendingItem.id,
    };
  }

  async confirmWhatsappSent(body: any, actor: any) {
    const leadRef = body.lead_id || body.leadId;
    const recipientMobile = body.recipient_mobile || body.recipientMobile;
    const templateKey = body.template_id || body.templateId;
    const notes = body.notes || null;

    if (body.message && body.message.length > 2000) {
      throw new BadRequestException('WhatsApp message exceeds 2000 characters limit.');
    }

    let lead = leadRef ? await this.resolveLead(leadRef) : null;
    if (!lead && recipientMobile) {
      const norm = normalizeIndianPhone(recipientMobile, false);
      if (norm) {
        lead = await this.prisma.lead.findFirst({
          where: { parentPhone: norm, deletedAt: null },
          include: {
            assignedCounsellor: { select: { id: true, fullName: true } },
            shortlists: { where: { deletedAt: null }, include: { school: { select: { name: true, whatsappGroupId: true } } } },
          },
        });
      }
    }

    const logUuid = body.log_uuid || body.logUuid || body.logId;
    let waLog = logUuid
      ? await this.prisma.whatsappLog.findFirst({
          where: { OR: [{ id: logUuid }, { logId: logUuid }] },
        })
      : null;

    if (!waLog && lead) {
      waLog = await this.prisma.whatsappLog.findFirst({
        where: { leadId: lead.id, sentBy: actor.id, status: 'pending' },
        orderBy: { sentAt: 'desc' },
      });
    }

    const now = new Date();
    if (waLog) {
      waLog = await this.prisma.whatsappLog.update({
        where: { id: waLog.id },
        data: { status: 'confirmed', confirmedAt: now, notes: notes ?? waLog.notes },
      });
    } else if (lead) {
      const logId = await this.nextSeqCode('seq_wa_log_id', 'LG', 3);
      waLog = await this.prisma.whatsappLog.create({
        data: {
          logId,
          leadId: lead.id,
          direction: 'outbound',
          templateId: templateKey || null,
          recipientType: body.recipient_type || 'parent',
          recipientMobile: normalizeIndianPhone(recipientMobile || lead.parentPhone, false),
          sentBy: actor.id,
          messageBody: body.message || notes || 'Confirmed sent',
          notes,
          status: 'confirmed',
          confirmedAt: now,
        },
      });
    } else {
      // Legacy communication endpoint fallback when no lead exists
      const norm = normalizeIndianPhone(recipientMobile, false) || recipientMobile;
      const comm = await this.prisma.communicationLog.create({
        data: {
          channel: 'WHATSAPP',
          recipient: String(norm || ''),
          recipientName: body.recipientName || 'Parent',
          templateName: templateKey || null,
          content: body.message || notes || '',
          senderName: actor.fullName,
          status: 'SENT',
        },
      });
      return { confirmed: true, communication: comm };
    }

    if (lead) {
      await this.prisma.lead.update({
        where: { id: lead.id },
        data: {
          waSentCount: { increment: 1 },
          lastWaAt: now,
          ...(lead.status === 'new' || lead.status === 'NEW_LEAD' ? { status: 'contacted' } : {}),
        },
      });

      await this.prisma.pendingLoggingQueue.updateMany({
        where: {
          leadId: lead.id,
          actionType: 'whatsapp_sent',
          status: { in: ['pending', 'escalated'] },
          ...(normalizeCanonicalRole(actor.role) === 'COUNSELLOR' ? { userId: actor.id } : {}),
        },
        data: { status: 'resolved', resolvedAt: now },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        userId: actor.id,
        userName: actor.fullName,
        userRole: normalizeCanonicalRole(actor.role),
        action: 'CREATE',
        module: 'whatsapp',
        entity: 'WhatsappLog',
        entityId: waLog.id,
        newValue: { logId: waLog.logId, leadId: lead?.id, status: 'confirmed' },
      },
    });

    return { confirmed: true, log: waLog };
  }

  async getWhatsappLogs(actor: any, leadRef?: string) {
    const canon = normalizeCanonicalRole(actor.role);
    const where: any = {};
    if (leadRef) {
      const lead = await this.resolveLead(leadRef);
      where.leadId = lead.id;
    } else if (canon === 'COUNSELLOR') {
      where.sentBy = actor.id;
    }

    return this.prisma.whatsappLog.findMany({
      where,
      include: {
        lead: { select: { leadNumber: true, studentName: true, parentName: true } },
        sender: { select: { id: true, fullName: true, role: true } },
      },
      orderBy: { sentAt: 'desc' },
      take: 100,
    });
  }

  async getCallDialLink(leadRef: string, actor: any, force = false) {
    const lead = await this.resolveLead(leadRef);
    await this.enforceLayer3Gate(actor.id, lead.id, force);

    const mobile = normalizeIndianPhone(lead.parentPhone, true)!;
    const logId = await this.nextSeqCode('seq_call_log_id', 'CL', 3);

    const callLog = await this.prisma.callLog.create({
      data: {
        logId,
        leadId: lead.id,
        direction: 'outbound',
        outcome: 'not_picked',
        recipientMobile: mobile,
        calledBy: actor.id,
        status: 'pending',
      },
    });

    const pendingItem = await this.prisma.pendingLoggingQueue.create({
      data: {
        userId: actor.id,
        leadId: lead.id,
        actionType: 'call_made',
        referenceLogId: callLog.id,
        status: 'pending',
        ageBucket: 'under_1h',
      },
    });

    return {
      tel_link: `tel:${mobile}`,
      telLink: `tel:${mobile}`,
      mobile,
      parent_name: lead.parentName,
      student_name: lead.studentName,
      lead_id: lead.leadNumber,
      log_id: callLog.logId,
      logUuid: callLog.id,
      pending_queue_id: pendingItem.id,
    };
  }

  async logCallOutcome(body: any, actor: any) {
    const leadRef = body.lead_id || body.leadId;
    if (!leadRef) throw new BadRequestException('lead_id is required.');
    const lead = await this.resolveLead(leadRef);

    const validOutcomes = new Set(CALL_OUTCOMES.map((o) => o.key));
    const outcome = String(body.outcome || 'interested').toLowerCase();
    if (!validOutcomes.has(outcome)) {
      throw new BadRequestException(
        `Invalid call outcome "${outcome}". Allowed: ${[...validOutcomes].join(', ')}`,
      );
    }

    const mobile =
      normalizeIndianPhone(body.mobile || lead.parentPhone, false) || lead.parentPhone;
    const now = new Date();
    const pendingLog = await this.prisma.callLog.findFirst({
      where: {
        OR: [
          ...(body.log_uuid || body.logUuid ? [{ id: body.log_uuid || body.logUuid }] : []),
          { leadId: lead.id, calledBy: actor.id, status: 'pending' },
        ],
      },
      orderBy: { calledAt: 'desc' },
    });

    let saved: any;
    if (pendingLog) {
      saved = await this.prisma.callLog.update({
        where: { id: pendingLog.id },
        data: {
          direction: body.direction || 'outbound',
          outcome,
          recipientMobile: mobile,
          durationSeconds: Number(body.duration_seconds ?? body.durationSeconds ?? 0),
          recordingLink: body.recording_link ?? body.recordingLink ?? null,
          recordingConsent: Boolean(body.recording_consent ?? body.recordingConsent),
          notes: body.notes || null,
          status: 'confirmed',
          confirmedAt: now,
        },
      });
    } else {
      const logId = await this.nextSeqCode('seq_call_log_id', 'CL', 3);
      saved = await this.prisma.callLog.create({
        data: {
          logId,
          leadId: lead.id,
          direction: body.direction || 'outbound',
          outcome,
          recipientMobile: mobile,
          calledBy: actor.id,
          durationSeconds: Number(body.duration_seconds ?? body.durationSeconds ?? 0),
          recordingLink: body.recording_link ?? body.recordingLink ?? null,
          recordingConsent: Boolean(body.recording_consent ?? body.recordingConsent),
          notes: body.notes || null,
          status: 'confirmed',
          confirmedAt: now,
        },
      });
    }

    await this.prisma.lead.update({
      where: { id: lead.id },
      data: {
        callAttempts: { increment: 1 },
        lastCallOutcome: outcome,
        ...(body.recording_consent ? { dpdpConsent: true, dpdpConsentAt: now } : {}),
        ...(lead.status === 'new' || lead.status === 'NEW_LEAD' ? { status: 'contacted' } : {}),
      },
    });

    await this.prisma.pendingLoggingQueue.updateMany({
      where: {
        leadId: lead.id,
        actionType: 'call_made',
        status: { in: ['pending', 'escalated'] },
        ...(normalizeCanonicalRole(actor.role) === 'COUNSELLOR' ? { userId: actor.id } : {}),
      },
      data: { status: 'resolved', resolvedAt: now },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: actor.id,
        userName: actor.fullName,
        userRole: normalizeCanonicalRole(actor.role),
        action: 'CREATE',
        module: 'calls',
        entity: 'CallLog',
        entityId: saved.id,
        newValue: { logId: saved.logId, outcome, durationSeconds: saved.durationSeconds },
      },
    });

    return saved;
  }

  async getCallLogsForLead(leadRef: string) {
    const lead = await this.resolveLead(leadRef);
    return this.prisma.callLog.findMany({
      where: { leadId: lead.id },
      include: { caller: { select: { id: true, fullName: true, role: true } } },
      orderBy: { calledAt: 'desc' },
    });
  }

  async listPendingQueue(actor: any) {
    const canon = normalizeCanonicalRole(actor.role);
    const where: any = { status: { in: ['pending', 'escalated'] } };
    if (canon === 'COUNSELLOR') {
      where.userId = actor.id;
    } else if (canon === 'SENIOR_MANAGER') {
      const teamUsers = await this.prisma.user.findMany({
        where: { OR: [{ id: actor.id }, { managerId: actor.id }] },
        select: { id: true },
      });
      where.userId = { in: teamUsers.map((u) => u.id) };
    }

    const items = await this.prisma.pendingLoggingQueue.findMany({
      where,
      include: {
        lead: {
          select: {
            id: true,
            leadNumber: true,
            studentName: true,
            parentName: true,
            parentPhone: true,
          },
        },
        user: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = Date.now();
    return items.map((item) => {
      const hours = (now - new Date(item.createdAt).getTime()) / (1000 * 60 * 60);
      const bucket =
        hours >= 24 ? 'over_24h' : hours >= 4 ? 'over_4h' : hours >= 1 ? '1h_to_4h' : 'under_1h';
      return {
        id: item.id,
        lead_id: item.lead?.leadNumber || item.leadId,
        leadUuid: item.leadId,
        studentName: item.lead?.studentName,
        parentName: item.lead?.parentName,
        userName: item.user?.fullName,
        action_type: item.actionType,
        status: item.status,
        age_bucket: bucket,
        created_at: item.createdAt,
      };
    });
  }

  async resolvePendingQueueItem(id: string, body: any, actor: any) {
    const item = await this.prisma.pendingLoggingQueue.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Pending queue item not found.');

    const now = new Date();
    await this.prisma.pendingLoggingQueue.update({
      where: { id },
      data: { status: 'resolved', resolvedAt: now },
    });

    if (item.actionType === 'whatsapp_sent' && item.referenceLogId) {
      await this.prisma.whatsappLog
        .update({
          where: { id: item.referenceLogId },
          data: { status: 'confirmed', confirmedAt: now, notes: body?.notes || undefined },
        })
        .catch(() => {});
    } else if (item.actionType === 'call_made' && item.referenceLogId) {
      await this.prisma.callLog
        .update({
          where: { id: item.referenceLogId },
          data: {
            status: 'confirmed',
            confirmedAt: now,
            outcome: body?.outcome || 'interested',
            notes: body?.notes || undefined,
          },
        })
        .catch(() => {});
    }

    await this.prisma.auditLog.create({
      data: {
        userId: actor.id,
        userName: actor.fullName,
        userRole: normalizeCanonicalRole(actor.role),
        action: 'UPDATE',
        module: 'pending_logging_queue',
        entity: 'PendingLoggingQueue',
        entityId: id,
        newValue: { status: 'resolved', notes: body?.notes, outcome: body?.outcome },
      },
    });

    return { resolved: true, id };
  }
}
