const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Team = require('../models/Team');
const School = require('../models/School');
const Parent = require('../models/Parent');
const Student = require('../models/Student');
const Lead = require('../models/Lead');
const Admission = require('../models/Admission');
const CommissionRule = require('../models/CommissionRule');
const CommissionEngine = require('./commissionEngine');

const seedInitialDatabase = async () => {
  try {
    const userCount = await User.countDocuments();
    if (userCount > 0) {
      console.log('[Seed] Database already seeded with users.');
      return;
    }

    console.log('[Seed] Seeding database with Uttarakhand Boarding Schools Enterprise CRM initial data...');

    // 1. Commission Rule
    const defaultRule = await CommissionRule.create({
      ruleId: 'RULE-UK-2026',
      name: 'Uttarakhand Boarding Standard 2026',
      type: 'Fixed',
      counsellorShare: 5000,
      managerShare: 2000,
      orgShare: 3000,
      totalCommissionAmount: 10000,
      isActive: true,
      version: 1
    });

    // 2. Create Users
    const admin = await User.create({
      name: 'Virendra Rawat (Super Admin)',
      email: 'admin@boardingedu.com',
      employeeId: 'EMP-ADM-001',
      password: 'Password@123',
      role: 'admin',
      phone: '+91 98100 11001',
      status: 'Active',
      twoFactorEnabled: false
    });

    const manager = await User.create({
      name: 'Rajesh Malhotra (Sr. Manager)',
      email: 'manager@boardingedu.com',
      employeeId: 'EMP-MGR-001',
      password: 'Password@123',
      role: 'manager',
      manager: admin._id,
      phone: '+91 98200 22002',
      status: 'Active',
      twoFactorEnabled: false
    });

    const counsellor1 = await User.create({
      name: 'Rahul Sharma (Counsellor)',
      email: 'rahul@boardingedu.com',
      employeeId: 'EMP-COU-001',
      password: 'Password@123',
      role: 'counsellor',
      manager: manager._id,
      phone: '+91 98300 33003',
      status: 'Active',
      twoFactorEnabled: false
    });

    const counsellor2 = await User.create({
      name: 'Priya Chaudhary (Counsellor)',
      email: 'priya@boardingedu.com',
      employeeId: 'EMP-COU-002',
      password: 'Password@123',
      role: 'counsellor',
      manager: manager._id,
      phone: '+91 98400 44004',
      status: 'Active',
      twoFactorEnabled: false
    });

    // 3. Create Team
    const team = await Team.create({
      teamId: 'TEAM-UK-01',
      name: 'Uttarakhand Pioneers',
      code: 'UK-PIONEERS',
      description: 'Senior counselling team handling Dehradun & Mussoorie top-tier residential schools.',
      manager: manager._id,
      counsellors: [counsellor1._id, counsellor2._id],
      target: 60,
      monthlyAdmissionTarget: 15,
      status: 'Active'
    });

    // Link team back to users
    manager.team = team._id;
    await manager.save();
    counsellor1.team = team._id;
    await counsellor1.save();
    counsellor2.team = team._id;
    await counsellor2.save();

    // 4. Create Uttarakhand Boarding Schools
    const schoolsData = [
      {
        schoolId: 'UK-SCH-001',
        name: 'The Doon School',
        board: 'IB',
        genderType: 'boys',
        city: 'Dehradun',
        state: 'Uttarakhand',
        rank: 1,
        annualFeesMin: 1100000,
        annualFeesMax: 1400000,
        feesDisplay: '₹11L - ₹14L',
        defaultCommission: 45000,
        sports: ['Cricket', 'Squash', 'Swimming', 'Shooting', 'Golf'],
        description: 'Renowned all-boys boarding school founded in 1935, situated across 70 acres in Dehradun.'
      },
      {
        schoolId: 'UK-SCH-002',
        name: 'Welham Girls’ School',
        board: 'ICSE',
        genderType: 'girls',
        city: 'Dehradun',
        state: 'Uttarakhand',
        rank: 2,
        annualFeesMin: 850000,
        annualFeesMax: 1050000,
        feesDisplay: '₹8.5L - ₹10.5L',
        defaultCommission: 40000,
        sports: ['Basketball', 'Badminton', 'Swimming', 'Horse Riding'],
        description: 'Premier residential school for girls with world-class academic and leadership grooming.'
      },
      {
        schoolId: 'UK-SCH-003',
        name: 'Woodstock School',
        board: 'IB',
        genderType: 'co_ed',
        city: 'Mussoorie',
        state: 'Uttarakhand',
        rank: 3,
        annualFeesMin: 1600000,
        annualFeesMax: 2000000,
        feesDisplay: '₹16L - ₹20L',
        defaultCommission: 50000,
        sports: ['Rock Climbing', 'Football', 'Cross-Country', 'Skiing'],
        description: 'International Christian co-educational residential school located in the foothills of the Himalayas.'
      },
      {
        schoolId: 'UK-SCH-004',
        name: 'Welham Boys’ School',
        board: 'CBSE',
        genderType: 'boys',
        city: 'Dehradun',
        state: 'Uttarakhand',
        rank: 4,
        annualFeesMin: 750000,
        annualFeesMax: 950000,
        feesDisplay: '₹7.5L - ₹9.5L',
        defaultCommission: 35000,
        sports: ['Cricket', 'Football', 'Swimming', 'Table Tennis'],
        description: 'Prestigious boys boarding school fostering holistic character and academic excellence.'
      },
      {
        schoolId: 'UK-SCH-005',
        name: 'Sherwood College',
        board: 'ICSE',
        genderType: 'co_ed',
        city: 'Nainital',
        state: 'Uttarakhand',
        rank: 5,
        annualFeesMin: 620000,
        annualFeesMax: 800000,
        feesDisplay: '₹6.2L - ₹8.0L',
        defaultCommission: 30000,
        sports: ['Rowing', 'Basketball', 'Tennis', 'Athletics'],
        description: 'Historic heritage boarding school established in 1869, alma mater of prominent Indian luminaries.'
      },
      {
        schoolId: 'UK-SCH-006',
        name: 'SelaQui International School',
        board: 'CBSE',
        genderType: 'co_ed',
        city: 'Dehradun',
        state: 'Uttarakhand',
        rank: 6,
        annualFeesMin: 550000,
        annualFeesMax: 750000,
        feesDisplay: '₹5.5L - ₹7.5L',
        defaultCommission: 30000,
        sports: ['Horse Riding', 'Swimming', 'Lawn Tennis', 'Cricket'],
        description: 'Top-ranked co-ed CBSE boarding school with integrated JEE/NEET and CLAT preparation.'
      },
      {
        schoolId: 'UK-SCH-007',
        name: 'St. George’s College (Manor House)',
        board: 'ICSE',
        genderType: 'boys',
        city: 'Mussoorie',
        state: 'Uttarakhand',
        rank: 7,
        annualFeesMin: 600000,
        annualFeesMax: 780000,
        feesDisplay: '₹6.0L - ₹7.8L',
        defaultCommission: 28000,
        sports: ['Boxing', 'Football', 'Cricket', 'Gymnastics'],
        description: 'Elite all-boys boarding school spread over 400 acres in Barlow Ganj, Mussoorie.'
      },
      {
        schoolId: 'UK-SCH-008',
        name: 'Wynberg-Allen School',
        board: 'ICSE',
        genderType: 'co_ed',
        city: 'Mussoorie',
        state: 'Uttarakhand',
        rank: 8,
        annualFeesMin: 580000,
        annualFeesMax: 720000,
        feesDisplay: '₹5.8L - ₹7.2L',
        defaultCommission: 25000,
        sports: ['Basketball', 'Badminton', 'Football'],
        description: 'Renowned co-educational institution established in 1888 with strong values and sports infrastructure.'
      }
    ];

    const createdSchools = await School.insertMany(schoolsData);

    // 5. Create Sample Parents & Students
    const p1 = await Parent.create({
      name: 'Col. Vikramaditya Rawat',
      mobile: '+919876500001',
      alternateMobile: '+919876500002',
      email: 'vikram.rawat@army.nic.in',
      city: 'Delhi',
      state: 'Delhi',
      whatsappNumber: '+919876500001',
      communicationConsent: true,
      occupation: 'Armed Forces Officer',
      annualIncome: '₹28 Lakhs'
    });

    const s1 = await Student.create({
      name: 'Aditya Rawat',
      gender: 'male',
      currentClass: 'Class 5',
      admissionClass: 'Class 6',
      currentSchool: 'Army Public School Dhaula Kuan',
      academicYear: '2026-27',
      parentId: p1._id
    });

    const p2 = await Parent.create({
      name: 'Dr. Sunita Deshmukh',
      mobile: '+919876500011',
      alternateMobile: '+919876500012',
      email: 'sunita.deshmukh@apollo.com',
      city: 'Mumbai',
      state: 'Maharashtra',
      whatsappNumber: '+919876500011',
      communicationConsent: true,
      occupation: 'Chief Neurosurgeon',
      annualIncome: '₹55 Lakhs'
    });

    const s2 = await Student.create({
      name: 'Ananya Deshmukh',
      gender: 'female',
      currentClass: 'Class 7',
      admissionClass: 'Class 8',
      currentSchool: 'Bombay Scottish School',
      academicYear: '2026-27',
      parentId: p2._id
    });

    const p3 = await Parent.create({
      name: 'Rajesh Singhal',
      mobile: '+919876500021',
      email: 'singhal.exports@gmail.com',
      city: 'Kanpur',
      state: 'Uttar Pradesh',
      whatsappNumber: '+919876500021',
      communicationConsent: true,
      occupation: 'Industrialist',
      annualIncome: '₹45 Lakhs'
    });

    const s3 = await Student.create({
      name: 'Manav Singhal',
      gender: 'male',
      currentClass: 'Class 8',
      admissionClass: 'Class 9',
      currentSchool: 'Delhi Public School Kalyanpur',
      academicYear: '2026-27',
      parentId: p3._id
    });

    // 6. Create Initial Leads
    const lead1 = await Lead.create({
      leadId: '001',
      parentId: p1._id,
      studentId: s1._id,
      leadSource: 'Google Ads',
      preferredSchool: createdSchools[0]._id, // The Doon School
      preferredLocation: 'Dehradun',
      boardingPreference: 'Full Boarding',
      annualBudget: '₹10L - ₹15L',
      admissionSession: '2026-27',
      leadPriority: 'Hot',
      leadScore: 92,
      assignedCounsellor: counsellor1._id,
      assignedManager: manager._id,
      teamId: team._id,
      leadStatus: 'Admission Confirmed',
      verificationStatus: 'Approved',
      verificationNotes: 'Parent verified through phone and campus tour completed.',
      verifiedBy: manager._id,
      verifiedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      remarks: [{
        author: counsellor1.name,
        role: counsellor1.role,
        note: 'Parent confirmed admission offer and deposited initial fees to The Doon School.'
      }],
      history: [{
        action: 'CREATED',
        user: counsellor1.name,
        details: 'Enquiry initiated via Google Ads'
      }]
    });

    const lead2 = await Lead.create({
      leadId: '002',
      parentId: p2._id,
      studentId: s2._id,
      leadSource: 'Website Referral',
      preferredSchool: createdSchools[1]._id, // Welham Girls' School
      preferredLocation: 'Dehradun',
      boardingPreference: 'Full Boarding',
      annualBudget: '₹8L - ₹12L',
      admissionSession: '2026-27',
      leadPriority: 'Hot',
      leadScore: 88,
      assignedCounsellor: counsellor2._id,
      assignedManager: manager._id,
      teamId: team._id,
      leadStatus: 'Parent Interested',
      verificationStatus: 'Approved',
      verificationNotes: 'Parent profile approved by Manager for school interview scheduling.',
      verifiedBy: manager._id,
      verifiedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      remarks: [{
        author: counsellor2.name,
        role: counsellor2.role,
        note: 'Mother requested video counselling session regarding boarding safety and boarding house wardens.'
      }]
    });

    const lead3 = await Lead.create({
      leadId: '003',
      parentId: p3._id,
      studentId: s3._id,
      leadSource: 'School Fair',
      preferredSchool: createdSchools[5]._id, // SelaQui
      preferredLocation: 'Dehradun',
      boardingPreference: 'Full Boarding',
      annualBudget: '₹6L - ₹8L',
      admissionSession: '2026-27',
      leadPriority: 'Warm',
      leadScore: 76,
      assignedCounsellor: counsellor1._id,
      assignedManager: manager._id,
      teamId: team._id,
      leadStatus: 'Contacted',
      verificationStatus: 'Pending Verification',
      remarks: [{
        author: counsellor1.name,
        role: counsellor1.role,
        note: 'Submitted lead for Manager approval. Looking for CBSE school with JEE foundation coaching.'
      }]
    });

    // 7. Create a Confirmed Admission and Process Initial Commission
    const admission1 = await Admission.create({
      admissionId: '001',
      leadId: lead1._id,
      parentName: p1.name,
      studentName: s1.name,
      schoolId: createdSchools[0]._id,
      schoolName: createdSchools[0].name,
      admissionClass: s1.admissionClass,
      academicYear: '2026-27',
      admissionDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      admissionStatus: 'Admission Confirmed',
      assignedCounsellor: counsellor1._id,
      assignedManager: manager._id,
      teamId: team._id,
      confirmedRevenue: 1250000,
      admissionFee: 1250000,
      proofDocument: 'admission_receipt_doon_school_verified.pdf',
      commissionGenerated: false
    });

    // Calculate commission through our immutable CommissionEngine
    await CommissionEngine.processAdmissionCommission(admission1, admin);

    console.log('[Seed] Database initialization complete!');
    console.log('----------------------------------------------------');
    console.log('Demo Credentials:');
    console.log('Admin:      admin@boardingedu.com    / Password@123');
    console.log('Manager:    manager@boardingedu.com  / Password@123');
    console.log('Counsellor: rahul@boardingedu.com    / Password@123');
    console.log('Counsellor: priya@boardingedu.com    / Password@123');
    console.log('----------------------------------------------------');
  } catch (error) {
    console.error('[Seed] Error seeding database:', error.message);
  }
};

module.exports = seedInitialDatabase;
