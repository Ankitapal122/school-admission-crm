import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SchoolsService {
  constructor(private prisma: PrismaService) {}

  private formatSchool(s: any) {
    return {
      ...s,
      _id: s.id,
      schoolId: s.schoolCode,
      genderType: s.genderType || s.type || 'Co-Ed',
      feesDisplay:
        s.feesDisplay ||
        `₹${((s.minFeeAnnual || 350000) / 100000).toFixed(1)}L - ₹${((s.maxFeeAnnual || 650000) / 100000).toFixed(1)}L / yr`,
      defaultCommission: s.defaultCommission || 10000,
      hostelQuality: s.hostelQuality || '5 Star',
      sports: Array.isArray(s.sports) ? s.sports : ['Cricket', 'Football', 'Swimming'],
    };
  }

  async findAll(city?: string, board?: string, search?: string) {
    const where: any = {};
    if (city && city !== 'ALL') where.city = city;
    if (board && board !== 'ALL') where.board = { contains: board, mode: 'insensitive' };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
        { schoolCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    const schools = await this.prisma.school.findMany({
      where,
      orderBy: { rank: 'asc' },
    });

    const formatted = schools.map((s) => this.formatSchool(s));
    return {
      success: true,
      schools: formatted,
      data: formatted,
    };
  }

  async findOne(id: string) {
    const school = await this.prisma.school.findFirst({
      where: { OR: [{ id }, { schoolCode: id }] },
      include: { admissions: true },
    });
    if (!school) throw new NotFoundException('School not found');
    return {
      success: true,
      school: this.formatSchool(school),
    };
  }

  async create(body: any, user?: any) {
    const count = await this.prisma.school.count();
    const schoolCode = body.schoolId || body.schoolCode || `SCH-UK-${String(count + 1).padStart(3, '0')}`;
    const minFee = Number(body.minFeeAnnual || body.annualFeeMin || body.minFee || 350000);
    const maxFee = Number(body.maxFeeAnnual || body.annualFeeMax || body.maxFee || 650000);

    const school = await this.prisma.school.create({
      data: {
        schoolCode,
        name: body.name,
        city: body.city || 'Dehradun',
        board: body.board || 'CBSE',
        type: body.genderType || body.type || 'Co-Ed',
        genderType: body.genderType || body.type || 'Co-Ed',
        minFeeAnnual: minFee,
        maxFeeAnnual: maxFee,
        feesDisplay:
          body.feesDisplay || `₹${(minFee / 100000).toFixed(1)}L - ₹${(maxFee / 100000).toFixed(1)}L / yr`,
        defaultCommission: Number(body.defaultCommission || 10000),
        hostelQuality: body.hostelQuality || '5 Star',
        rank: Number(body.rank || count + 1),
        description: body.description || 'Premier residential boarding school in Uttarakhand.',
        sports: Array.isArray(body.sports)
          ? body.sports
          : typeof body.sports === 'string'
          ? body.sports.split(',').map((s: string) => s.trim())
          : ['Cricket', 'Swimming', 'Basketball'],
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user?.id || null,
        userName: user?.fullName || 'Super Admin',
        userRole: user?.role || 'SUPER_ADMIN',
        action: 'CREATE_SCHOOL',
        module: 'Schools',
        entity: 'School',
        entityId: school.id,
        details: { schoolCode, name: school.name },
      },
    });

    return {
      success: true,
      message: 'Uttarakhand Partner School added to directory',
      school: this.formatSchool(school),
    };
  }

  async update(id: string, body: any) {
    const existing = await this.prisma.school.findFirst({
      where: { OR: [{ id }, { schoolCode: id }] },
    });
    if (!existing) throw new NotFoundException('School not found');

    const updated = await this.prisma.school.update({
      where: { id: existing.id },
      data: {
        name: body.name ?? existing.name,
        city: body.city ?? existing.city,
        board: body.board ?? existing.board,
        genderType: body.genderType ?? existing.genderType,
        feesDisplay: body.feesDisplay ?? existing.feesDisplay,
        defaultCommission: body.defaultCommission
          ? Number(body.defaultCommission)
          : existing.defaultCommission,
        hostelQuality: body.hostelQuality ?? existing.hostelQuality,
        description: body.description ?? existing.description,
      },
    });

    return {
      success: true,
      school: this.formatSchool(updated),
    };
  }
}
