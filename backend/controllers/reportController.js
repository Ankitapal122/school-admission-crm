const Lead = require('../models/Lead');
const Student = require('../models/Student');
const Admission = require('../models/Admission');
const School = require('../models/School');
const Team = require('../models/Team');
const User = require('../models/User');
const Commission = require('../models/Commission');

exports.getDashboardStats = async (req, res) => {
  try {
    const role = req.user.role;

    if (role === 'admin') {
      const [
        totalEnquiries,
        totalStudents,
        totalAdmissions,
        totalSchools,
        totalTeams,
        totalCounsellors,
        totalManagers,
        pendingVerification,
        commissions
      ] = await Promise.all([
        Lead.countDocuments(),
        Student.countDocuments(),
        Admission.countDocuments({ admissionStatus: 'Admission Confirmed' }),
        School.countDocuments({ deletedAt: null }),
        Team.countDocuments({ status: 'Active' }),
        User.countDocuments({ role: 'counsellor' }),
        User.countDocuments({ role: 'manager' }),
        Lead.countDocuments({ verificationStatus: 'Pending Verification' }),
        Commission.find({ status: { $ne: 'Reversed' } })
      ]);

      const totalCommission = commissions.reduce((sum, c) => sum + c.amount, 0);
      const pendingCommission = commissions
        .filter(c => c.status === 'Pending' || c.status === 'Pending Approval')
        .reduce((sum, c) => sum + c.amount, 0);
      const paidCommission = commissions
        .filter(c => c.status === 'Paid')
        .reduce((sum, c) => sum + c.amount, 0);

      // Chart: School-wise Admissions
      const schoolAdmissions = await Admission.aggregate([
        { $match: { admissionStatus: 'Admission Confirmed' } },
        { $group: { _id: '$schoolName', count: { $sum: 1 }, totalRevenue: { $sum: '$confirmedRevenue' } } },
        { $sort: { count: -1 } },
        { $limit: 6 }
      ]);

      return res.status(200).json({
        success: true,
        role: 'admin',
        kpi: {
          totalEnquiries,
          totalStudents,
          totalAdmissions,
          totalSchools,
          totalTeams,
          totalCounsellors,
          totalManagers,
          pendingVerification,
          totalCommission,
          pendingCommission,
          paidCommission
        },
        charts: {
          schoolAdmissions: schoolAdmissions.map(s => ({ name: s._id, admissions: s.count, revenue: s.totalRevenue })),
          monthlyTrends: [
            { month: 'Jun', enquiries: 42, admissions: 8 },
            { month: 'Jul', enquiries: 65, admissions: 12 },
            { month: 'Aug', enquiries: 78, admissions: 15 },
            { month: 'Sep', enquiries: 95, admissions: 22 },
            { month: 'Oct', enquiries: 110, admissions: 28 },
            { month: 'Nov', enquiries: 45, admissions: 14 }
          ],
          leadSources: [
            { source: 'Google Ads', value: 45 },
            { source: 'Website Organic', value: 25 },
            { source: 'Referral', value: 18 },
            { source: 'School Fair', value: 12 }
          ]
        }
      });
    }

    if (role === 'manager') {
      const teamId = req.user.team;
      const teamFilter = teamId ? { teamId } : { assignedManager: req.user._id };

      const [
        totalTeamLeads,
        totalTeamAdmissions,
        pendingVerification,
        approvedLeads,
        returnedLeads,
        teamCounsellors,
        commissions
      ] = await Promise.all([
        Lead.countDocuments(teamFilter),
        Admission.countDocuments({ ...teamFilter, admissionStatus: 'Admission Confirmed' }),
        Lead.countDocuments({ ...teamFilter, verificationStatus: 'Pending Verification' }),
        Lead.countDocuments({ ...teamFilter, verificationStatus: 'Approved' }),
        Lead.countDocuments({ ...teamFilter, verificationStatus: 'Returned' }),
        User.countDocuments({ manager: req.user._id, role: 'counsellor' }),
        Commission.find({
          $or: [{ teamId }, { beneficiaryUser: req.user._id }],
          status: { $ne: 'Reversed' }
        })
      ]);

      const teamCommission = commissions.reduce((sum, c) => sum + c.amount, 0);
      const conversionRate = totalTeamLeads > 0 ? ((totalTeamAdmissions / totalTeamLeads) * 100).toFixed(1) : 0;

      return res.status(200).json({
        success: true,
        role: 'manager',
        kpi: {
          totalTeamLeads,
          totalTeamAdmissions,
          pendingVerification,
          approvedLeads,
          returnedLeads,
          totalCounsellors: teamCounsellors,
          todayFollowUps: 8,
          overdueFollowUps: 2,
          teamConversionRate: `${conversionRate}%`,
          teamCommission
        }
      });
    }

    // Counsellor Role
    if (role === 'counsellor') {
      const counsellorFilter = { assignedCounsellor: req.user._id };

      const [
        myTotalLeads,
        newLeads,
        pendingVerification,
        approvedLeads,
        hotLeads,
        convertedAdmissions,
        commissions
      ] = await Promise.all([
        Lead.countDocuments(counsellorFilter),
        Lead.countDocuments({ ...counsellorFilter, leadStatus: 'New' }),
        Lead.countDocuments({ ...counsellorFilter, verificationStatus: 'Pending Verification' }),
        Lead.countDocuments({ ...counsellorFilter, verificationStatus: 'Approved' }),
        Lead.countDocuments({ ...counsellorFilter, leadPriority: 'Hot' }),
        Admission.countDocuments({ assignedCounsellor: req.user._id, admissionStatus: 'Admission Confirmed' }),
        Commission.find({ beneficiaryUser: req.user._id, status: { $ne: 'Reversed' } })
      ]);

      const myTotalCommission = commissions.reduce((sum, c) => sum + c.amount, 0);
      const pendingCommission = commissions
        .filter(c => c.status === 'Pending' || c.status === 'Pending Approval')
        .reduce((sum, c) => sum + c.amount, 0);
      const paidCommission = commissions
        .filter(c => c.status === 'Paid')
        .reduce((sum, c) => sum + c.amount, 0);

      return res.status(200).json({
        success: true,
        role: 'counsellor',
        kpi: {
          myTotalLeads,
          newLeads,
          pendingVerification,
          approvedLeads,
          hotLeads,
          todayFollowUps: 4,
          convertedAdmissions,
          myTotalCommission,
          pendingCommission,
          paidCommission
        }
      });
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to generate report statistics.' });
  }
};
