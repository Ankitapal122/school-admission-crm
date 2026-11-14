import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { normalizeCanonicalRole } from '../../common/utils/crm.utils';
import * as XLSX from 'xlsx';

@Injectable()
export class SchoolsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  private async nextSchoolCode(): Promise<string> {
    const rows: any[] = await this.prisma.$queryRawUnsafe(`SELECT nextval('seq_school_code')::bigint AS n`);
    return `SC${String(Number(rows[0]?.n || 501)).padStart(3, '0')}`;
  }

  async findAll(query: {
    city?: string;
    state?: string;
    board?: string;
    category?: string;
    status?: string;
    search?: string;
    page?: any;
    limit?: any;
  }) {
    const where: any = { deletedAt: null };
    if (query.city) where.city = { contains: query.city, mode: 'insensitive' };
    if (query.state) where.state = { contains: query.state, mode: 'insensitive' };
    if (query.board) where.board = query.board;
    if (query.category) where.category = query.category;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { schoolCode: { contains: query.search, mode: 'insensitive' } },
        { city: { contains: query.search, mode: 'insensitive' } },
        { state: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(2000, Math.max(1, Number(query.limit || 1500)));
    const skip = (page - 1) * limit;

    const [schools, total, detailSummaries] = await Promise.all([
      this.prisma.school.findMany({
        where,
        orderBy: [{ rank: 'asc' }, { name: 'asc' }],
        skip,
        take: limit,
      }),
      this.prisma.school.count({ where }),
      this.prisma.$queryRawUnsafe<any[]>(`
        SELECT
          id,
          details->>'logo' AS logo,
          details->>'address' AS address,
          details->>'area' AS area,
          details->>'locality' AS locality,
          details->>'pincode' AS pincode,
          details->>'boarding_type' AS "boardingType",
          details->'boards' AS boards,
          details->>'classes' AS classes,
          details->>'gender' AS gender,
          details->>'founded' AS founded,
          details->>'campus_size' AS "campusSize",
          details->>'student_teacher_ratio' AS "studentTeacherRatio",
          details->>'medium' AS medium,
          details->>'reviews' AS reviews,
          details->>'verified' AS verified,
          details->>'latest_fee_session' AS "latestFeeSession",
          jsonb_array_length(COALESCE(details->'class_fees', '[]'::jsonb))::int AS "classFeesCount",
          jsonb_array_length(COALESCE(details->'images', '[]'::jsonb))::int AS "imagesCount"
        FROM "schools"
        WHERE "deleted_at" IS NULL
      `).catch(() => []),
    ]);

    const summaryMap = new Map<string, any>();
    for (const row of detailSummaries || []) {
      summaryMap.set(row.id, row);
    }

    return {
      schools: schools.map((s) => {
        const meta = summaryMap.get(s.id) || {};
        return {
          ...s,
          type: s.genderType,
          netProfit: Number(s.defaultCommission || 0) - Number(s.jrCommission || 0) - Number(s.srCommission || 0),
          logo: meta.logo || null,
          address: meta.address || `${s.city}, ${s.state}`,
          area: meta.area || null,
          locality: meta.locality || null,
          pincode: meta.pincode || null,
          boardingType: meta.boardingType || s.hostelQuality || 'Full Boarding',
          boards: Array.isArray(meta.boards) ? meta.boards : [s.board],
          classes: meta.classes || s.classesOffered || '1 - 12',
          gender: meta.gender || (s.genderType === 'boys' ? 'Boys' : s.genderType === 'girls' ? 'Girls' : 'Co-ed'),
          founded: meta.founded ? Number(meta.founded) : null,
          campusSize: meta.campusSize || null,
          studentTeacherRatio: meta.studentTeacherRatio || null,
          medium: meta.medium || 'English',
          reviews: meta.reviews ? Number(meta.reviews) : 0,
          verified: meta.verified !== 'false',
          latestFeeSession: meta.latestFeeSession || '2026-2027',
          classFeesCount: Number(meta.classFeesCount || 0),
          imagesCount: Number(meta.imagesCount || 0),
        };
      }),
      total,
      page,
      limit,
    };
  }

  async findOne(idOrCode: string) {
    const school = await this.prisma.school.findFirst({
      where: { OR: [{ id: idOrCode }, { schoolCode: idOrCode }], deletedAt: null },
    });
    if (!school) throw new NotFoundException('School not found.');
    let details: any = {};
    try {
      const rows: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT details FROM "schools" WHERE id = $1 LIMIT 1`,
        school.id,
      );
      details = rows[0]?.details || {};
    } catch {}
    return {
      ...school,
      type: school.genderType,
      details,
      logo: details.logo || null,
      address: details.address || `${school.city}, ${school.state}`,
      area: details.area || null,
      locality: details.locality || null,
      pincode: details.pincode || null,
      boardingType: details.boarding_type || school.hostelQuality || 'Full Boarding',
      boards: Array.isArray(details.boards) ? details.boards : [school.board],
      classes: details.classes || school.classesOffered || '1 - 12',
      gender: details.gender || (school.genderType === 'boys' ? 'Boys' : school.genderType === 'girls' ? 'Girls' : 'Co-ed'),
      founded: details.founded || null,
      campusSize: details.campus_size || null,
      studentTeacherRatio: details.student_teacher_ratio || null,
      medium: details.medium || 'English',
      academicSession: details.academic_session || 'April to March',
      reviews: Number(details.reviews || 0),
      verified: details.verified !== false,
      affiliationNo: details.affiliation_no || null,
      schoolTiming: details.school_timing || null,
      studentCount: details.student_count || null,
      teacherCount: details.teacher_count || null,
      languages: Array.isArray(details.languages) ? details.languages : ['English'],
      foodOptions: details.food_options || null,
      sourceUrl: details.source_url || null,
      latestFeeSession: details.latest_fee_session || '2026-2027',
      currentAdmissionSession: details.current_admission_session || '2026-2027',
      images: Array.isArray(details.images) ? details.images : [],
      localImages: Array.isArray(details.local_images) ? details.local_images : [],
      facilities: Array.isArray(details.facilities) ? details.facilities : school.sports || [],
      facilityGroups: details.facility_groups || {},
      classFees: Array.isArray(details.class_fees) ? details.class_fees : [],
      admissions: Array.isArray(details.admissions) ? details.admissions : [],
      about: details.about || school.description || null,
      lat: details.lat || null,
      lng: details.lng || null,
      social: details.social || {},
    };
  }

  async create(body: any, actor: any) {
    if (!body.name) throw new BadRequestException('School name is required.');
    const schoolCode = body.schoolCode || body.school_code || (await this.nextSchoolCode());
    const companyComm = Number(body.company_commission ?? body.defaultCommission ?? 35000);
    const jrComm = Number(body.jr_commission ?? body.jrCommission ?? 5000);
    const srComm = Number(body.sr_commission ?? body.srCommission ?? 7000);
    const netProfit = Math.max(0, companyComm - jrComm - srComm);
    const minFee = Number(body.fees_min ?? body.minFeeAnnual ?? 300000);
    const maxFee = Number(body.fees_max ?? body.maxFeeAnnual ?? 550000);

    const created = await this.prisma.school.create({
      data: {
        schoolCode,
        name: body.name,
        city: body.city || 'Dehradun',
        state: body.state || 'Uttarakhand',
        board: body.board || 'CBSE',
        genderType: body.type || body.genderType || 'co_ed',
        category: body.category || 'boarding',
        rank: Number(body.ranking ?? body.rank ?? 100),
        minFeeAnnual: minFee,
        maxFeeAnnual: maxFee,
        feesDisplay:
          body.feesDisplay || `₹${(minFee / 100000).toFixed(1)}L - ₹${(maxFee / 100000).toFixed(1)}L`,
        defaultCommission: companyComm,
        jrCommission: jrComm,
        srCommission: srComm,
        netProfit,
        paymentTermsDays: Number(body.payment_terms_days ?? body.paymentTermsDays ?? 30),
        whatsappGroupId: body.whatsapp_group_id || body.whatsappGroupId || `GRP-${schoolCode}`,
        phone: body.contact_person || body.phone || null,
        sports: Array.isArray(body.facilities || body.sports) ? body.facilities || body.sports : ['Sports', 'Hostel'],
        classesOffered: body.classes_offered || body.classesOffered || '1-12',
        status: 'active',
        isPartner: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: actor.id,
        userName: actor.fullName,
        userRole: normalizeCanonicalRole(actor.role),
        action: 'CREATE',
        module: 'schools',
        entity: 'School',
        entityId: created.id,
        newValue: created,
      },
    });
    return created;
  }

  async update(idOrCode: string, body: any, actor: any) {
    const existing = await this.findOne(idOrCode);
    const companyComm = Number(body.company_commission ?? body.defaultCommission ?? existing.defaultCommission);
    const jrComm = Number(body.jr_commission ?? body.jrCommission ?? existing.jrCommission);
    const srComm = Number(body.sr_commission ?? body.srCommission ?? existing.srCommission);
    const netProfit = Math.max(0, companyComm - jrComm - srComm);

    const updateData: any = {
      name: body.name ?? existing.name,
      city: body.city ?? existing.city,
      state: body.state ?? existing.state,
      board: body.board ?? existing.board,
      genderType: body.type ?? body.genderType ?? existing.genderType,
      category: body.category ?? existing.category,
      rank: Number(body.ranking ?? body.rank ?? existing.rank),
      minFeeAnnual: Number(body.fees_min ?? body.minFeeAnnual ?? existing.minFeeAnnual),
      maxFeeAnnual: Number(body.fees_max ?? body.maxFeeAnnual ?? existing.maxFeeAnnual),
      defaultCommission: companyComm,
      jrCommission: jrComm,
      srCommission: srComm,
      netProfit,
      paymentTermsDays: Number(body.payment_terms_days ?? body.paymentTermsDays ?? existing.paymentTermsDays),
      whatsappGroupId: body.whatsapp_group_id ?? body.whatsappGroupId ?? existing.whatsappGroupId,
      phone: body.contact_person ?? body.phone ?? existing.phone,
      status: body.status ?? existing.status,
      classesOffered: body.classes_offered ?? body.classesOffered ?? existing.classesOffered,
      version: { increment: 1 },
    };

    if (body.version !== undefined) {
      const res = await this.prisma.school.updateMany({
        where: { id: existing.id, version: Number(body.version), deletedAt: null },
        data: updateData,
      });
      if (res.count === 0) {
        throw new ConflictException('School record modified concurrently. Refresh and retry.');
      }
    } else {
      await this.prisma.school.update({ where: { id: existing.id }, data: updateData });
    }

    const updated = await this.findOne(existing.id);

    if (existing.status === 'active' && updated.status === 'inactive') {
      await this.notifications.notifyRoles(['SENIOR_MANAGER', 'SUPER_ADMIN'], {
        type: 'school_deactivated',
        title: `School Deactivated: ${updated.name}`,
        message: `${updated.name} (${updated.schoolCode}) was marked inactive. New applications are blocked.`,
        relatedEntityId: updated.id,
        relatedEntityType: 'school',
      });
    }

    await this.prisma.auditLog.create({
      data: {
        userId: actor.id,
        userName: actor.fullName,
        userRole: normalizeCanonicalRole(actor.role),
        action: 'UPDATE',
        module: 'schools',
        entity: 'School',
        entityId: existing.id,
        oldValue: existing,
        newValue: updated,
      },
    });
    return updated;
  }

  async checkActiveApplications(idOrCode: string) {
    const school = await this.findOne(idOrCode);
    const activeCount = await this.prisma.admission.count({
      where: {
        schoolId: school.id,
        deletedAt: null,
        stage: { notIn: ['closed'] },
      },
    });
    return {
      active_applications: activeCount,
      warning:
        activeCount > 0
          ? `This school has ${activeCount} active applications. Deactivation will not affect them, but new applications will be blocked.`
          : 'No active applications found. Safe to deactivate.',
      requires_confirmation: activeCount > 0,
    };
  }

  async softDelete(idOrCode: string, actor: any) {
    const existing = await this.findOne(idOrCode);
    const updated = await this.prisma.school.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), status: 'inactive', version: { increment: 1 } },
    });
    await this.prisma.auditLog.create({
      data: {
        userId: actor.id,
        userName: actor.fullName,
        userRole: normalizeCanonicalRole(actor.role),
        action: 'DELETE',
        module: 'schools',
        entity: 'School',
        entityId: existing.id,
      },
    });
    return updated;
  }

  async exportSchools(format = 'csv') {
    const { schools } = await this.findAll({ limit: 600 });
    const rows = schools.map((s) => ({
      Code: s.schoolCode,
      Name: s.name,
      Board: s.board,
      Type: s.genderType,
      Category: s.category,
      City: s.city,
      State: s.state,
      Rank: s.rank,
      'Min Fee': s.minFeeAnnual,
      'Max Fee': s.maxFeeAnnual,
      'Company Commission': s.defaultCommission,
      'Jr Commission': s.jrCommission,
      'Sr Commission': s.srCommission,
      'Net Profit': s.netProfit,
      Status: s.status,
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Schools');
    return XLSX.write(wb, { type: 'buffer', bookType: format === 'csv' ? 'csv' : 'xlsx' }) as Buffer;
  }
}
