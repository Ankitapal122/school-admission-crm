import { PrismaClient, Role, LeadStatus, VerificationStatus, Priority, FollowUpType, CommissionStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting Complete Enterprise Database Seed with Prisma...');

  const passwordHash = await bcrypt.hash('Password@123', 12);

  // 1. Seed Roles & Permissions
  const adminRole = await prisma.roleDefinition.upsert({
    where: { name: Role.SUPER_ADMIN },
    update: {},
    create: {
      name: Role.SUPER_ADMIN,
      displayName: 'Super Administrator',
      description: 'Full unrestricted access to all CRM modules, commission policies, and system settings.',
    },
  });

  const managerRole = await prisma.roleDefinition.upsert({
    where: { name: Role.SENIOR_MANAGER },
    update: {},
    create: {
      name: Role.SENIOR_MANAGER,
      displayName: 'Senior Manager',
      description: 'Manages assigned teams, counsellors, lead verification, and commission approvals.',
    },
  });

  const counsellorRole = await prisma.roleDefinition.upsert({
    where: { name: Role.COUNSELLOR },
    update: {},
    create: {
      name: Role.COUNSELLOR,
      displayName: 'Education Counsellor',
      description: 'Handles assigned student enquiries, parent follow-ups, and school shortlisting.',
    },
  });

  const permissionsData = [
    { code: 'leads:all', module: 'Leads', description: 'View and manage all leads', roleId: adminRole.id },
    { code: 'commissions:pay', module: 'Commissions', description: 'Record bank UTR payments', roleId: adminRole.id },
    { code: 'users:manage', module: 'Users', description: 'Create and suspend users', roleId: adminRole.id },
    { code: 'leads:verify', module: 'Leads', description: 'Approve, return, or reject leads', roleId: managerRole.id },
    { code: 'commissions:approve', module: 'Commissions', description: 'Approve team commissions', roleId: managerRole.id },
    { code: 'leads:create', module: 'Leads', description: 'Create and update assigned leads', roleId: counsellorRole.id },
  ];

  for (const p of permissionsData) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: {},
      create: p,
    });
  }

  // 2. Seed Commission Rule
  await prisma.commissionRule.upsert({
    where: { ruleCode: 'RULE-UK-2026' },
    update: {},
    create: {
      ruleCode: 'RULE-UK-2026',
      name: 'Uttarakhand Boarding Standard 2026',
      type: 'Fixed',
      counsellorShare: 5000,
      managerShare: 2000,
      orgShare: 3000,
      totalCommissionAmount: 10000,
      eligibilityRules: 'Confirmed admission with tuition fee receipt submission',
      isActive: true,
      version: 1,
    },
  });

  // 3. Seed Users (Admin, Manager, 2 Counsellors)
  const recoveryCodes = [
    'UK26-A1B2-C3D4',
    'UK26-E5F6-G7H8',
    'UK26-J9K0-L1M2',
    'UK26-N3P4-Q5R6',
    'UK26-S7T8-U9V0',
    'UK26-W1X2-Y3Z4',
  ];

  const admin = await prisma.user.upsert({
    where: { email: 'admin@boardingedu.com' },
    update: { fullName: 'Virendra Rawat (Super Admin)', passwordHash, recoveryCodes },
    create: {
      email: 'admin@boardingedu.com',
      employeeId: 'EMP-ADM-001',
      fullName: 'Virendra Rawat (Super Admin)',
      role: Role.SUPER_ADMIN,
      passwordHash,
      phone: '+91 98100 11001',
      status: 'Active',
      recoveryCodes,
    },
  });

  const manager = await prisma.user.upsert({
    where: { email: 'manager@boardingedu.com' },
    update: { fullName: 'Rajesh Malhotra (Sr. Manager)', managerId: admin.id, passwordHash, recoveryCodes },
    create: {
      email: 'manager@boardingedu.com',
      employeeId: 'EMP-MGR-001',
      fullName: 'Rajesh Malhotra (Sr. Manager)',
      role: Role.SENIOR_MANAGER,
      passwordHash,
      phone: '+91 98200 22002',
      status: 'Active',
      managerId: admin.id,
      recoveryCodes,
    },
  });

  // 4. Seed Team
  const team = await prisma.team.upsert({
    where: { name: 'Uttarakhand Pioneers' },
    update: {
      teamCode: 'UK-PIONEERS',
      managerId: manager.id,
      targetAdmissions: 60,
      monthlyAdmissionTarget: 15,
      status: 'Active',
    },
    create: {
      teamCode: 'UK-PIONEERS',
      name: 'Uttarakhand Pioneers',
      description: 'Senior counselling team handling Dehradun & Mussoorie top-tier residential schools.',
      targetAdmissions: 60,
      monthlyAdmissionTarget: 15,
      status: 'Active',
      managerId: manager.id,
    },
  });

  await prisma.user.update({
    where: { id: manager.id },
    data: { teamId: team.id },
  });

  const rahul = await prisma.user.upsert({
    where: { email: 'rahul@boardingedu.com' },
    update: { fullName: 'Rahul Sharma (Counsellor)', teamId: team.id, managerId: manager.id, passwordHash, recoveryCodes },
    create: {
      email: 'rahul@boardingedu.com',
      employeeId: 'EMP-COU-001',
      fullName: 'Rahul Sharma (Counsellor)',
      role: Role.COUNSELLOR,
      passwordHash,
      phone: '+91 98300 33003',
      status: 'Active',
      teamId: team.id,
      managerId: manager.id,
      recoveryCodes,
    },
  });

  const priya = await prisma.user.upsert({
    where: { email: 'priya@boardingedu.com' },
    update: { fullName: 'Priya Chaudhary (Counsellor)', teamId: team.id, managerId: manager.id, passwordHash, recoveryCodes },
    create: {
      email: 'priya@boardingedu.com',
      employeeId: 'EMP-COU-002',
      fullName: 'Priya Chaudhary (Counsellor)',
      role: Role.COUNSELLOR,
      passwordHash,
      phone: '+91 98400 44004',
      status: 'Active',
      teamId: team.id,
      managerId: manager.id,
      recoveryCodes,
    },
  });

  // 5. Seed All 8 Uttarakhand Boarding Schools
  const schoolsData = [
    {
      schoolCode: 'UK-SCH-001',
      name: 'The Doon School',
      board: 'IB',
      type: 'Boys',
      genderType: 'boys',
      city: 'Dehradun',
      state: 'Uttarakhand',
      rank: 1,
      rating: 4.9,
      minFeeAnnual: 1100000,
      maxFeeAnnual: 1400000,
      feesDisplay: '₹11L - ₹14L',
      defaultCommission: 45000,
      hostelQuality: '5 Star',
      sports: ['Cricket', 'Squash', 'Swimming', 'Shooting', 'Golf'],
      description: 'Renowned all-boys boarding school founded in 1935, situated across 70 acres in Dehradun.',
      website: 'https://www.doonschool.com',
      admissionsEmail: 'admissions@doonschool.com',
      phone: '+91 135 252 6400',
    },
    {
      schoolCode: 'UK-SCH-002',
      name: 'Welham Girls’ School',
      board: 'ICSE',
      type: 'Girls',
      genderType: 'girls',
      city: 'Dehradun',
      state: 'Uttarakhand',
      rank: 2,
      rating: 4.8,
      minFeeAnnual: 850000,
      maxFeeAnnual: 1050000,
      feesDisplay: '₹8.5L - ₹10.5L',
      defaultCommission: 40000,
      hostelQuality: '5 Star',
      sports: ['Basketball', 'Badminton', 'Swimming', 'Horse Riding'],
      description: 'Premier residential school for girls with world-class academic and leadership grooming.',
      website: 'https://www.welhamgirls.com',
      admissionsEmail: 'admissions@welhamgirls.com',
      phone: '+91 135 265 4754',
    },
    {
      schoolCode: 'UK-SCH-003',
      name: 'Woodstock School',
      board: 'IB',
      type: 'Co-Ed',
      genderType: 'co_ed',
      city: 'Mussoorie',
      state: 'Uttarakhand',
      rank: 3,
      rating: 4.9,
      minFeeAnnual: 1600000,
      maxFeeAnnual: 2000000,
      feesDisplay: '₹16L - ₹20L',
      defaultCommission: 50000,
      hostelQuality: '5 Star',
      sports: ['Rock Climbing', 'Football', 'Cross-Country', 'Skiing'],
      description: 'International Christian co-educational residential school located in the foothills of the Himalayas.',
      website: 'https://www.woodstockschool.in',
      admissionsEmail: 'admissions@woodstock.ac.in',
      phone: '+91 135 263 9000',
    },
    {
      schoolCode: 'UK-SCH-004',
      name: 'Welham Boys’ School',
      board: 'CBSE',
      type: 'Boys',
      genderType: 'boys',
      city: 'Dehradun',
      state: 'Uttarakhand',
      rank: 4,
      rating: 4.7,
      minFeeAnnual: 750000,
      maxFeeAnnual: 950000,
      feesDisplay: '₹7.5L - ₹9.5L',
      defaultCommission: 35000,
      hostelQuality: '5 Star',
      sports: ['Cricket', 'Football', 'Swimming', 'Table Tennis'],
      description: 'Prestigious boys boarding school fostering holistic character and academic excellence.',
      website: 'https://www.welhamboys.org',
      admissionsEmail: 'admissions@welhamboys.org',
      phone: '+91 135 265 7120',
    },
    {
      schoolCode: 'UK-SCH-005',
      name: 'Sherwood College',
      board: 'ICSE',
      type: 'Co-Ed',
      genderType: 'co_ed',
      city: 'Nainital',
      state: 'Uttarakhand',
      rank: 5,
      rating: 4.7,
      minFeeAnnual: 620000,
      maxFeeAnnual: 800000,
      feesDisplay: '₹6.2L - ₹8.0L',
      defaultCommission: 30000,
      hostelQuality: '5 Star',
      sports: ['Rowing', 'Basketball', 'Tennis', 'Athletics'],
      description: 'Historic heritage boarding school established in 1869, alma mater of prominent Indian luminaries.',
      website: 'https://www.sherwood.edu.in',
      admissionsEmail: 'contact@sherwood.edu.in',
      phone: '+91 5942 236 363',
    },
    {
      schoolCode: 'UK-SCH-006',
      name: 'SelaQui International School',
      board: 'CBSE',
      type: 'Co-Ed',
      genderType: 'co_ed',
      city: 'Dehradun',
      state: 'Uttarakhand',
      rank: 6,
      rating: 4.6,
      minFeeAnnual: 550000,
      maxFeeAnnual: 750000,
      feesDisplay: '₹5.5L - ₹7.5L',
      defaultCommission: 30000,
      hostelQuality: '5 Star',
      sports: ['Horse Riding', 'Swimming', 'Lawn Tennis', 'Cricket'],
      description: 'Top-ranked co-ed CBSE boarding school with integrated JEE/NEET and CLAT preparation.',
    },
    {
      schoolCode: 'UK-SCH-007',
      name: 'St. George’s College (Manor House)',
      board: 'ICSE',
      type: 'Boys',
      genderType: 'boys',
      city: 'Mussoorie',
      state: 'Uttarakhand',
      rank: 7,
      rating: 4.7,
      minFeeAnnual: 600000,
      maxFeeAnnual: 780000,
      feesDisplay: '₹6.0L - ₹7.8L',
      defaultCommission: 28000,
      hostelQuality: '5 Star',
      sports: ['Boxing', 'Football', 'Cricket', 'Gymnastics'],
      description: 'Elite all-boys boarding school spread over 400 acres in Barlow Ganj, Mussoorie.',
    },
    {
      schoolCode: 'UK-SCH-008',
      name: 'Wynberg-Allen School',
      board: 'ICSE',
      type: 'Co-Ed',
      genderType: 'co_ed',
      city: 'Mussoorie',
      state: 'Uttarakhand',
      rank: 8,
      rating: 4.6,
      minFeeAnnual: 580000,
      maxFeeAnnual: 720000,
      feesDisplay: '₹5.8L - ₹7.2L',
      defaultCommission: 25000,
      hostelQuality: '5 Star',
      sports: ['Basketball', 'Badminton', 'Football'],
      description: 'Renowned co-educational institution established in 1888 with strong values and sports infrastructure.',
    },
  ];

  const createdSchools = [];
  for (const s of schoolsData) {
    const school = await prisma.school.upsert({
      where: { name: s.name },
      update: s,
      create: s,
    });
    createdSchools.push(school);
  }

  // 6. Seed Parents & Students
  const p1 = await prisma.parent.upsert({
    where: { mobile: '+919876500001' },
    update: {},
    create: {
      name: 'Col. Vikramaditya Rawat',
      mobile: '+919876500001',
      alternateMobile: '+919876500002',
      email: 'vikram.rawat@army.nic.in',
      city: 'Delhi',
      state: 'Delhi',
      whatsappNumber: '+919876500001',
      communicationConsent: true,
      occupation: 'Armed Forces Officer',
      annualIncome: '₹28 Lakhs',
    },
  });

  let s1 = await prisma.student.findFirst({ where: { name: 'Aditya Rawat', parentId: p1.id } });
  if (!s1) {
    s1 = await prisma.student.create({
      data: {
        name: 'Aditya Rawat',
        gender: 'male',
        currentClass: 'Class 5',
        admissionClass: 'Class 6',
        currentSchool: 'Army Public School Dhaula Kuan',
        academicYear: '2026-27',
        parentId: p1.id,
      },
    });
  }

  const p2 = await prisma.parent.upsert({
    where: { mobile: '+919876500011' },
    update: {},
    create: {
      name: 'Dr. Sunita Deshmukh',
      mobile: '+919876500011',
      alternateMobile: '+919876500012',
      email: 'sunita.deshmukh@apollo.com',
      city: 'Mumbai',
      state: 'Maharashtra',
      whatsappNumber: '+919876500011',
      communicationConsent: true,
      occupation: 'Chief Neurosurgeon',
      annualIncome: '₹55 Lakhs',
    },
  });

  let s2 = await prisma.student.findFirst({ where: { name: 'Ananya Deshmukh', parentId: p2.id } });
  if (!s2) {
    s2 = await prisma.student.create({
      data: {
        name: 'Ananya Deshmukh',
        gender: 'female',
        currentClass: 'Class 7',
        admissionClass: 'Class 8',
        currentSchool: 'Bombay Scottish School',
        academicYear: '2026-27',
        parentId: p2.id,
      },
    });
  }

  const p3 = await prisma.parent.upsert({
    where: { mobile: '+919876500021' },
    update: {},
    create: {
      name: 'Rajesh Singhal',
      mobile: '+919876500021',
      email: 'singhal.exports@gmail.com',
      city: 'Kanpur',
      state: 'Uttar Pradesh',
      whatsappNumber: '+919876500021',
      communicationConsent: true,
      occupation: 'Industrialist',
      annualIncome: '₹45 Lakhs',
    },
  });

  let s3 = await prisma.student.findFirst({ where: { name: 'Manav Singhal', parentId: p3.id } });
  if (!s3) {
    s3 = await prisma.student.create({
      data: {
        name: 'Manav Singhal',
        gender: 'male',
        currentClass: 'Class 8',
        admissionClass: 'Class 9',
        currentSchool: 'Delhi Public School Kalyanpur',
        academicYear: '2026-27',
        parentId: p3.id,
      },
    });
  }

  // 7. Seed Leads
  const lead1 = await prisma.lead.upsert({
    where: { leadNumber: '001' },
    update: {
      parentId: p1.id,
      studentId: s1.id,
      preferredSchoolId: createdSchools[0].id,
      assignedCounsellorId: rahul.id,
      assignedManagerId: manager.id,
      teamId: team.id,
    },
    create: {
      leadNumber: '001',
      parentId: p1.id,
      studentId: s1.id,
      studentName: s1.name,
      studentGender: 'male',
      currentGrade: 'Class 5',
      applyingForGrade: 'Class 6',
      parentName: p1.name,
      parentPhone: p1.mobile,
      parentEmail: p1.email,
      city: p1.city,
      leadSource: 'Google Ads',
      preferredSchoolId: createdSchools[0].id,
      preferredLocation: 'Dehradun',
      boardingPreference: 'Full Boarding',
      annualBudget: '₹10L - ₹15L',
      budgetMin: 1000000,
      budgetMax: 1500000,
      preferredBoard: 'IB',
      admissionSession: '2026-27',
      priority: Priority.URGENT,
      score: 92,
      assignedCounsellorId: rahul.id,
      assignedManagerId: manager.id,
      teamId: team.id,
      status: LeadStatus.ADMISSION_CONFIRMED,
      verificationStatus: VerificationStatus.APPROVED,
      returnRemarks: 'Parent verified through phone and campus tour completed.',
      verifiedById: manager.id,
      verifiedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      dpdpConsent: true,
      remarksJson: [
        {
          author: rahul.fullName,
          role: 'counsellor',
          note: 'Parent confirmed admission offer and deposited initial fees to The Doon School.',
          createdAt: new Date().toISOString(),
        },
      ],
      historyJson: [
        {
          action: 'CREATED',
          user: rahul.fullName,
          details: 'Enquiry initiated via Google Ads',
          timestamp: new Date().toISOString(),
        },
      ],
    },
  });

  const lead2 = await prisma.lead.upsert({
    where: { leadNumber: '002' },
    update: {
      parentId: p2.id,
      studentId: s2.id,
      preferredSchoolId: createdSchools[1].id,
      assignedCounsellorId: priya.id,
      assignedManagerId: manager.id,
      teamId: team.id,
    },
    create: {
      leadNumber: '002',
      parentId: p2.id,
      studentId: s2.id,
      studentName: s2.name,
      studentGender: 'female',
      currentGrade: 'Class 7',
      applyingForGrade: 'Class 8',
      parentName: p2.name,
      parentPhone: p2.mobile,
      parentEmail: p2.email,
      city: p2.city,
      leadSource: 'Website Referral',
      preferredSchoolId: createdSchools[1].id,
      preferredLocation: 'Dehradun',
      boardingPreference: 'Full Boarding',
      annualBudget: '₹8L - ₹12L',
      budgetMin: 800000,
      budgetMax: 1200000,
      preferredBoard: 'ICSE',
      admissionSession: '2026-27',
      priority: Priority.HIGH,
      score: 88,
      assignedCounsellorId: priya.id,
      assignedManagerId: manager.id,
      teamId: team.id,
      status: LeadStatus.SCHOOL_TOUR_SCHEDULED,
      verificationStatus: VerificationStatus.APPROVED,
      returnRemarks: 'Parent profile approved by Manager for school interview scheduling.',
      verifiedById: manager.id,
      verifiedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      dpdpConsent: true,
      remarksJson: [
        {
          author: priya.fullName,
          role: 'counsellor',
          note: 'Mother requested video counselling session regarding boarding safety and boarding house wardens.',
          createdAt: new Date().toISOString(),
        },
      ],
    },
  });

  const lead3 = await prisma.lead.upsert({
    where: { leadNumber: '003' },
    update: {
      parentId: p3.id,
      studentId: s3.id,
      preferredSchoolId: createdSchools[5].id,
      assignedCounsellorId: rahul.id,
      assignedManagerId: manager.id,
      teamId: team.id,
    },
    create: {
      leadNumber: '003',
      parentId: p3.id,
      studentId: s3.id,
      studentName: s3.name,
      studentGender: 'male',
      currentGrade: 'Class 8',
      applyingForGrade: 'Class 9',
      parentName: p3.name,
      parentPhone: p3.mobile,
      parentEmail: p3.email,
      city: p3.city,
      leadSource: 'School Fair',
      preferredSchoolId: createdSchools[5].id,
      preferredLocation: 'Dehradun',
      boardingPreference: 'Full Boarding',
      annualBudget: '₹6L - ₹8L',
      budgetMin: 600000,
      budgetMax: 800000,
      preferredBoard: 'CBSE',
      admissionSession: '2026-27',
      priority: Priority.MEDIUM,
      score: 76,
      assignedCounsellorId: rahul.id,
      assignedManagerId: manager.id,
      teamId: team.id,
      status: LeadStatus.CONTACTED,
      verificationStatus: VerificationStatus.PENDING_VERIFICATION,
      dpdpConsent: true,
      remarksJson: [
        {
          author: rahul.fullName,
          role: 'counsellor',
          note: 'Submitted lead for Manager approval. Looking for CBSE school with JEE foundation coaching.',
          createdAt: new Date().toISOString(),
        },
      ],
    },
  });

  // 8. Seed Confirmed Admission & 3 Immutable Commission Records
  const admission1 = await prisma.admission.upsert({
    where: { admissionNumber: '001' },
    update: {},
    create: {
      admissionNumber: '001',
      receiptNumber: 'RCP-2026-0001',
      leadId: lead1.id,
      schoolId: createdSchools[0].id,
      counsellorId: rahul.id,
      managerId: manager.id,
      teamId: team.id,
      studentName: s1.name,
      parentName: p1.name,
      schoolName: createdSchools[0].name,
      admissionClass: s1.admissionClass,
      academicYear: '2026-27',
      feeAgreed: 1250000,
      proofDocument: 'admission_receipt_doon_school_verified.pdf',
      status: 'Admission Confirmed',
      commissionGenerated: true,
      confirmedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    },
  });

  const comm1 = await prisma.commission.upsert({
    where: { commissionCode: '001' },
    update: {},
    create: {
      commissionCode: '001',
      admissionId: admission1.id,
      leadId: lead1.id,
      schoolName: createdSchools[0].name,
      studentName: s1.name,
      parentName: p1.name,
      beneficiaryId: rahul.id,
      beneficiaryName: rahul.fullName,
      beneficiaryType: 'Counsellor',
      beneficiaryRole: Role.COUNSELLOR,
      teamId: team.id,
      amount: 5000,
      status: CommissionStatus.PENDING_APPROVAL,
      ruleVersion: 1,
    },
  });

  const comm2 = await prisma.commission.upsert({
    where: { commissionCode: '002' },
    update: {},
    create: {
      commissionCode: '002',
      admissionId: admission1.id,
      leadId: lead1.id,
      schoolName: createdSchools[0].name,
      studentName: s1.name,
      parentName: p1.name,
      beneficiaryId: manager.id,
      beneficiaryName: manager.fullName,
      beneficiaryType: 'Manager',
      beneficiaryRole: Role.SENIOR_MANAGER,
      teamId: team.id,
      amount: 2000,
      status: CommissionStatus.PENDING_APPROVAL,
      ruleVersion: 1,
    },
  });

  const comm3 = await prisma.commission.upsert({
    where: { commissionCode: '003' },
    update: {},
    create: {
      commissionCode: '003',
      admissionId: admission1.id,
      leadId: lead1.id,
      schoolName: createdSchools[0].name,
      studentName: s1.name,
      parentName: p1.name,
      beneficiaryId: admin.id,
      beneficiaryName: 'Uttarakhand BoardingEdu Ltd.',
      beneficiaryType: 'Organization',
      beneficiaryRole: Role.SUPER_ADMIN,
      teamId: team.id,
      amount: 3000,
      status: CommissionStatus.PENDING_APPROVAL,
      ruleVersion: 1,
    },
  });

  // 9. Seed Follow-ups & Tasks
  await prisma.followUp.upsert({
    where: { followUpCode: 'FLP-2026-001' },
    update: {},
    create: {
      followUpCode: 'FLP-2026-001',
      leadId: lead1.id,
      counsellorId: rahul.id,
      type: FollowUpType.PHONE_CALL,
      status: 'Completed',
      outcome: 'Parent confirmed campus visit & admission fee payment',
      duration: '08:15',
      notes: 'Spoke with Col. Vikramaditya Rawat. Confirmed Class 6 seat.',
      dpdpConsentRecorded: true,
      scheduledAt: new Date(),
      completedAt: new Date(),
    },
  });

  await prisma.followUp.upsert({
    where: { followUpCode: 'FLP-2026-002' },
    update: {},
    create: {
      followUpCode: 'FLP-2026-002',
      leadId: lead2.id,
      counsellorId: priya.id,
      type: FollowUpType.WHATSAPP,
      status: 'Scheduled',
      outcome: 'Video counselling scheduled with Welham Girls coordinator',
      duration: '04:30',
      notes: 'Sent Welham Girls brochure PDF via WhatsApp Business API.',
      dpdpConsentRecorded: true,
      scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    },
  });

  const existingTask = await prisma.task.findFirst({ where: { title: 'Follow up with Rajesh Singhal on SelaQui Brochure' } });
  if (!existingTask) {
    await prisma.task.create({
      data: {
        title: 'Follow up with Rajesh Singhal on SelaQui Brochure',
        description: 'Verify JEE integrated coaching preference for Class 9 admission.',
        status: 'PENDING',
        priority: Priority.HIGH,
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        assignedToId: rahul.id,
        leadId: lead3.id,
      },
    });
  }

  // 10. Seed System Settings
  const settingsData = [
    { key: 'inactivity_threshold', value: '90 Days', category: 'lifecycle' },
    { key: 'followup_expiry_timeout', value: '90 Days', category: 'lifecycle' },
    { key: 'force_expire_limit', value: '360 Days', category: 'lifecycle' },
    { key: 'commission_fnf_clawback_window', value: '90 Days', category: 'commission' },
    { key: 'dpdp_online_retention', value: '90 Days Database Queryable', category: 'compliance' },
    { key: 'dpdp_cold_storage_archive', value: '12 Months Encrypted S3', category: 'compliance' },
  ];

  for (const st of settingsData) {
    await prisma.systemSetting.upsert({
      where: { key: st.key },
      update: { value: st.value, category: st.category },
      create: st,
    });
  }

  // 11. Seed Initial Notification & Audit Log
  const existingNotif = await prisma.notification.findFirst({ where: { userId: admin.id } });
  if (!existingNotif) {
    await prisma.notification.createMany({
      data: [
        {
          userId: admin.id,
          title: 'New Lead Pending Verification',
          message: 'Rahul Sharma submitted Lead #003 (Manav Singhal - Class 9) for Manager review.',
          type: 'lead_assigned',
          link: '/leads',
        },
        {
          userId: manager.id,
          title: 'New Lead Pending Verification',
          message: 'Rahul Sharma submitted Lead #003 (Manav Singhal - Class 9) for your review.',
          type: 'lead_assigned',
          link: '/leads',
        },
        {
          userId: rahul.id,
          title: '🎉 Admission Confirmed!',
          message: 'Admission #001 confirmed for Aditya Rawat at The Doon School. Commission ₹5,000 generated!',
          type: 'admission_confirmed',
          link: '/commissions',
        },
      ],
    });
  }

  console.log('✅ Complete Enterprise Database Seeding Finished!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
