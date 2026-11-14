import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PERMISSION_KEYS = [
  'leads.create',
  'leads.view_own',
  'leads.view_all',
  'leads.edit_basic',
  'leads.edit_all',
  'leads.delete',
  'leads.restore',
  'leads.merge',
  'leads.assign',
  'leads.reopen',
  'leads.suspend',
  'leads.expire',
  'leads.disqualify',
  'leads.status',
  'leads.export',
  'shortlists.manage',
  'applications.manage',
  'scoring.configure',
  'matching.configure',
  'schools.view',
  'schools.manage',
  'schools.commission',
  'commission.view_own',
  'commission.view_all',
  'commission.receive',
  'commission.payout',
  'commission.reverse',
  'commission.adjust',
  'users.manage',
  'roles.manage',
  'settings.manage',
  'settings.import',
  'reports.basic',
  'reports.advanced',
  'audit.view',
  'followups.reschedule',
];

const MANAGER_ALLOWED = new Set([
  'leads.create',
  'leads.view_own',
  'leads.view_all',
  'leads.edit_basic',
  'leads.edit_all',
  'leads.delete',
  'leads.merge',
  'leads.assign',
  'leads.reopen',
  'leads.suspend',
  'leads.expire',
  'leads.disqualify',
  'leads.status',
  'leads.export',
  'shortlists.manage',
  'applications.manage',
  'schools.view',
  'commission.view_own',
  'commission.reverse',
  'reports.basic',
  'reports.advanced',
  'followups.reschedule',
]);

const JR_ALLOWED = new Set([
  'leads.create',
  'leads.view_own',
  'leads.edit_basic',
  'schools.view',
  'commission.view_own',
  'reports.basic',
]);

async function seed() {
  console.log('🌱 Starting idempotent BoardingEdu Enterprise CRM seed...');

  // 1. Ensure default Team exists
  const team = await prisma.team.upsert({
    where: { teamCode: 'TEAM-UK-01' },
    update: { name: 'Team Uttarakhand Pioneers', status: 'ACTIVE' },
    create: {
      teamCode: 'TEAM-UK-01',
      name: 'Team Uttarakhand Pioneers',
      description: 'Primary Uttarakhand & Pan-India Boarding School Counselling Team',
      targetAdmissions: 25,
      monthlyAdmissionTarget: 30,
      status: 'ACTIVE',
    },
  });

  // 2. Seed / Preserve Core Users (Admin, Manager, Jr Counsellors + preserve palankita450000@gmail.com)
  const adminHash = await bcrypt.hash('Admin@123', 10);
  const managerHash = await bcrypt.hash('Manager@123', 10);
  const staffHash = await bcrypt.hash('Password@123', 10);

  const adminUser = await prisma.user.upsert({
    where: { email: 'adminboarding123@gmail.com' },
    update: {
      role: 'SUPER_ADMIN',
      passwordHash: adminHash,
      phone: '+917249417658',
      status: 'active',
      isActive: true,
      deletedAt: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
    create: {
      email: 'adminboarding123@gmail.com',
      employeeId: 'EMP-ADM-001',
      fullName: 'Virendra Rawat (Super Admin)',
      phone: '+917249417658',
      role: 'SUPER_ADMIN',
      passwordHash: adminHash,
      status: 'active',
      isActive: true,
      isTwoFactorEnabled: false,
      teamId: team.id,
    },
  });

  const managerUser = await prisma.user.upsert({
    where: { email: 'managerborading123@gmail.com' },
    update: {
      role: 'SENIOR_MANAGER',
      passwordHash: managerHash,
      status: 'active',
      isActive: true,
      deletedAt: null,
      failedLoginAttempts: 0,
      lockedUntil: null,
      teamId: team.id,
    },
    create: {
      email: 'managerborading123@gmail.com',
      employeeId: 'EMP-MGR-001',
      fullName: 'Rajesh Malhotra (Sr. Manager)',
      phone: '+919876543201',
      role: 'SENIOR_MANAGER',
      passwordHash: managerHash,
      status: 'active',
      isActive: true,
      isTwoFactorEnabled: false,
      teamId: team.id,
    },
  });

  await prisma.team.update({
    where: { id: team.id },
    data: { managerId: managerUser.id },
  });

  const priyaUser = await prisma.user.upsert({
    where: { email: 'priya@boardingedu.com' },
    update: {
      role: 'COUNSELLOR',
      managerId: managerUser.id,
      teamId: team.id,
      status: 'active',
      isActive: true,
      deletedAt: null,
    },
    create: {
      email: 'priya@boardingedu.com',
      employeeId: 'EMP-COU-002',
      fullName: 'Priya Chaudhary (Counsellor)',
      phone: '+919876543202',
      role: 'COUNSELLOR',
      passwordHash: staffHash,
      status: 'active',
      isActive: true,
      isTwoFactorEnabled: false,
      managerId: managerUser.id,
      teamId: team.id,
    },
  });

  const rahulUser = await prisma.user.upsert({
    where: { email: 'rahul@boardingedu.com' },
    update: {
      role: 'COUNSELLOR',
      managerId: managerUser.id,
      teamId: team.id,
      status: 'active',
      isActive: true,
      deletedAt: null,
    },
    create: {
      email: 'rahul@boardingedu.com',
      employeeId: 'EMP-COU-001',
      fullName: 'Rahul Sharma (Counsellor)',
      phone: '+919876543203',
      role: 'COUNSELLOR',
      passwordHash: staffHash,
      status: 'active',
      isActive: true,
      isTwoFactorEnabled: false,
      managerId: managerUser.id,
      teamId: team.id,
    },
  });

  // Ensure notification preferences exist for all active users
  const allUsers = await prisma.user.findMany({ where: { deletedAt: null } });
  for (const u of allUsers) {
    await prisma.notificationPreference.upsert({
      where: { userId: u.id },
      update: {},
      create: {
        userId: u.id,
        followUpReminder: true,
        weeklyReport: true,
        mergeAlert: true,
        pushEnabled: false,
        commissionUpdates: true,
      },
    });
  }

  // 3. Seed roles_permissions (all 3 blueprint roles x 36 keys)
  const roleEntries: Array<{ role: string; allowedSet: Set<string> | 'ALL' }> = [
    { role: 'super_admin', allowedSet: 'ALL' },
    { role: 'manager', allowedSet: MANAGER_ALLOWED },
    { role: 'jr_counsellor', allowedSet: JR_ALLOWED },
  ];

  const rpData: Array<{ role: string; permissionKey: string; allowed: boolean; description: string }> = [];
  for (const entry of roleEntries) {
    for (const key of PERMISSION_KEYS) {
      rpData.push({
        role: entry.role,
        permissionKey: key,
        allowed: entry.allowedSet === 'ALL' ? true : entry.allowedSet.has(key),
        description: `Permission ${key} for ${entry.role}`,
      });
    }
  }
  await prisma.rolePermission.createMany({ data: rpData, skipDuplicates: true });

  // 4. Seed 8 Matching Criteria Weights (EXACT total = 100)
  const matchingWeights = [
    { criteriaKey: 'class', criteriaName: 'Target Class Availability', weight: 15, description: 'Class 1-12 match with school availability' },
    { criteriaKey: 'board', criteriaName: 'Curriculum Board (CBSE/ICSE/IB/State)', weight: 15, description: 'Board alignment with parent preference' },
    { criteriaKey: 'fees_range', criteriaName: 'Budget & Annual Fee Alignment', weight: 15, description: 'Lead budget vs school min-max fee bracket' },
    { criteriaKey: 'state', criteriaName: 'State / Location Preference', weight: 10, description: 'Preferred location or state match' },
    { criteriaKey: 'gender', criteriaName: 'Gender Preference (Boys/Girls/Co-Ed)', weight: 15, description: 'Student gender compatibility' },
    { criteriaKey: 'school_type', criteriaName: 'Boarding Type (Boarding/Semi/Online)', weight: 10, description: 'Boarding/Semi-Boarding/Online fit' },
    { criteriaKey: 'facilities', criteriaName: 'Campus & Sports Facilities', weight: 10, description: 'Hostel, sports and lab facilities' },
    { criteriaKey: 'ranking', criteriaName: 'School Ranking & Standing', weight: 10, description: 'Academic & national ranking score' },
  ];

  await prisma.matchingCriteriaWeight.deleteMany({
    where: { criteriaKey: { notIn: matchingWeights.map((m) => m.criteriaKey) } },
  });
  for (const mw of matchingWeights) {
    await prisma.matchingCriteriaWeight.upsert({
      where: { criteriaKey: mw.criteriaKey },
      update: { criteriaName: mw.criteriaName, weight: mw.weight, description: mw.description },
      create: mw,
    });
  }

  // 5. Seed 5 Lead Scoring Weights (EXACT total = 100)
  const scoringWeights = [
    { criteriaKey: 'budget_match', criteriaName: 'Budget Clarity & Tier Match', weight: 25, description: 'Fee budget viability & specificity' },
    { criteriaKey: 'engagement', criteriaName: 'Parent Engagement (Calls & WA)', weight: 25, description: 'Positive calls, WA replies & remarks' },
    { criteriaKey: 'source_quality', criteriaName: 'Lead Source Intent Quality', weight: 20, description: 'Referral, walk-in, website vs cold' },
    { criteriaKey: 'timeline_urgency', criteriaName: 'Academic Session & Follow-up Urgency', weight: 15, description: 'Current session urgency & scheduled follow-ups' },
    { criteriaKey: 'class_demand', criteriaName: 'Class Demand & Readiness', weight: 15, description: 'Boarding readiness & target class demand' },
  ];

  for (const sw of scoringWeights) {
    await prisma.leadScoringConfig.upsert({
      where: { criteriaKey: sw.criteriaKey },
      update: { criteriaName: sw.criteriaName, weight: sw.weight, description: sw.description },
      create: sw,
    });
  }

  // 6. Seed System Settings (including dynamic rate-limits, password policy, GST/TDS, assignment, duplicate, DPDP, 2FA policy)
  const systemSettingsSeed: Array<{ key: string; value: any; category: string; description: string }> = [
    {
      key: 'rate_limits',
      value: {
        lead_create_per_hour: 50,
        merge_per_hour: 10,
        bulk_import_per_hour: 2,
        login_per_min: 5,
        burst: 200,
        maxRequestsPerMinute: 120,
      },
      category: 'rate_limit',
      description: 'Endpoint & role-based throttling configuration',
    },
    {
      key: 'password_policy',
      value: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumber: true,
        requireSpecial: true,
        maxFailedAttempts: 5,
        lockDurationMinutes: 15,
      },
      category: 'password_policy',
      description: 'Password strength & account lockout rules',
    },
    {
      key: 'gst_tds',
      value: {
        gst_enabled: true,
        gst_percentage: 18,
        tds_enabled: true,
        tds_percentage: 10,
        hsn_sac_code: '999299',
        company_gstin: '05AABCB1234F1Z5',
      },
      category: 'gst_tds',
      description: 'GST & TDS compliance settings for India payouts',
    },
    {
      key: 'assignment_default',
      value: {
        method: 'round_robin',
        round_robin_pointer: 0,
        auto_assign_on_create: false,
      },
      category: 'assignment',
      description: 'Lead assignment strategy (round_robin | manual | overload_balance | reopen)',
    },
    {
      key: 'duplicate_rule',
      value: {
        fields: ['mobile_primary', 'student_name', 'class_grade'],
        mode: 'soft_warning',
        managerOverrideAllowed: true,
      },
      category: 'duplicate_rule',
      description: 'Mobile + Student Name + Class duplicate rule',
    },
    {
      key: 'lead_id_format',
      value: { prefix: 'LD', minDigits: 6, autoExpand: true },
      category: 'general',
      description: 'Sequential lead ID pattern LD000001',
    },
    {
      key: 'dpdp_retention',
      value: {
        online_days: 90,
        s3_archive_months: 12,
        total_delete_months: 15,
        require_parent_consent: true,
      },
      category: 'general',
      description: 'DPDP audit log online + S3 cold storage + auto-purge policy',
    },
    {
      key: 'require_admin_2fa',
      value: { enabled: false, enforce_for_new_logins: false },
      category: 'security',
      description: 'System-wide 2FA enforcement policy toggle (user-opted 2FA always enforced)',
    },
  ];

  for (const s of systemSettingsSeed) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      update: {},
      create: s,
    });
  }

  // 7. Seed Blueprint & Custom WhatsApp Templates
  const templates = [
    {
      templateKey: 'parent_shortlist',
      name: 'Parent Shortlist Share',
      body: 'Namaste {parent_name} ji! Based on {student_name}\'s profile (Class {class_grade}, {board}), we have shortlisted top boarding schools including {school_name}. Reply YES to book a campus tour or conference call.',
      recipientType: 'parent',
      category: 'shortlist',
      isActive: true,
    },
    {
      templateKey: 'parent_followup',
      name: 'Parent Follow-up Reminder',
      body: 'Hello {parent_name} ji, this is {counsellor_name} from BoardingEdu checking in regarding {student_name}\'s admission enquiry ({lead_id}). Let us know a convenient time to speak today.',
      recipientType: 'parent',
      category: 'followup',
      isActive: true,
    },
    {
      templateKey: 'school_group_referral',
      name: 'School Group Referral Notification',
      body: 'Dear Admissions Team ({school_name}), sharing verified candidate {student_name} (Class {class_grade}, {academic_year}) via BoardingEdu ({lead_id}). Please confirm conference call / test slot.',
      recipientType: 'school_group',
      category: 'application',
      isActive: true,
    },
    {
      templateKey: 'school_group_visit',
      name: 'School Campus Visit Intimation',
      body: 'Campus Visit Request: Family of {student_name} (Parent: {parent_name}, {mobile}) plans to visit {school_name} for Class {class_grade}. Kindly share registration formalities.',
      recipientType: 'school_group',
      category: 'visit',
      isActive: true,
    },
    {
      templateKey: 'welcome_parent',
      name: 'Welcome Parent Enquiry',
      body: 'Namaste {parent_name} ji! Thank you for contacting BoardingEdu for {student_name}\'s boarding school admission (Ref: {lead_id}). Your dedicated counsellor will share personalized options shortly.',
      recipientType: 'parent',
      category: 'welcome',
      isActive: true,
    },
  ];

  for (const tpl of templates) {
    await prisma.whatsappTemplate.upsert({
      where: { templateKey: tpl.templateKey },
      update: { recipientType: tpl.recipientType },
      create: tpl,
    });
  }

  // Normalize any existing templates with capitalized recipientType
  await prisma.whatsappTemplate.updateMany({
    where: { recipientType: 'Parent' },
    data: { recipientType: 'parent' },
  });

  // 8. Import All Real Partner Boarding Schools from Documents/ (SC001..SC1368) preserving SC001..SC008!
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { importAllDocumentsSchools } = require('../scripts/import_documents_schools');
  await importAllDocumentsSchools();

  console.log('✅ Enterprise seed finished cleanly.', {
    admin: adminUser.email,
    manager: managerUser.email,
    counsellors: [priyaUser.email, rahulUser.email],
    schoolsTotal: await prisma.school.count(),
  });
}

seed()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
