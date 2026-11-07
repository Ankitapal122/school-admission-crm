const Admission = require('../models/Admission');
const Lead = require('../models/Lead');
const School = require('../models/School');
const Commission = require('../models/Commission');
const CommissionEngine = require('../services/commissionEngine');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');

// Get admissions based on role
exports.getAdmissions = async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'counsellor') {
      query.assignedCounsellor = req.user._id;
    } else if (req.user.role === 'manager') {
      if (req.user.team) query.teamId = req.user.team;
      else query.assignedManager = req.user._id;
    }

    const admissions = await Admission.find(query)
      .populate('leadId')
      .populate('schoolId')
      .populate('assignedCounsellor', 'name employeeId email')
      .populate('assignedManager', 'name employeeId email')
      .populate('teamId', 'name code')
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, count: admissions.length, admissions });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve admissions.' });
  }
};

// Create / Confirm Admission
exports.createAdmission = async (req, res) => {
  try {
    const {
      leadId, schoolId, admissionClass, academicYear,
      confirmedRevenue, admissionFee, proofDocument
    } = req.body;

    if (!leadId || !schoolId || !confirmedRevenue) {
      return res.status(400).json({ success: false, message: 'Lead, School, and Confirmed Revenue are required.' });
    }

    const lead = await Lead.findById(leadId).populate('parentId').populate('studentId');
    if (!lead) return res.status(404).json({ success: false, message: 'Lead record not found.' });

    const school = await School.findById(schoolId);
    if (!school) return res.status(404).json({ success: false, message: 'School not found.' });

    const admissionCount = await Admission.countDocuments();
    const admissionId = String(admissionCount + 1).padStart(3, '0');

    const admission = await Admission.create({
      admissionId,
      leadId: lead._id,
      parentName: lead.parentId?.name || 'Parent',
      studentName: lead.studentId?.name || 'Student',
      schoolId: school._id,
      schoolName: school.name,
      admissionClass: admissionClass || lead.studentId?.admissionClass || 'Class 6',
      academicYear: academicYear || '2026-27',
      admissionDate: new Date(),
      admissionStatus: 'Admission Confirmed',
      assignedCounsellor: lead.assignedCounsellor,
      assignedManager: lead.assignedManager || req.user._id,
      teamId: lead.teamId,
      confirmedRevenue: parseFloat(confirmedRevenue),
      admissionFee: parseFloat(admissionFee || confirmedRevenue),
      proofDocument: proofDocument || 'admission_fee_receipt.pdf',
      commissionGenerated: false
    });

    // Update Lead Status to Confirmed
    lead.leadStatus = 'Admission Confirmed';
    lead.history.push({
      action: 'ADMISSION_CONFIRMED',
      user: req.user.name,
      details: `Admission confirmed at ${school.name}. ID: ${admissionId}`
    });
    await lead.save();

    // Trigger Commission Engine to generate 3 separate immutable records
    const commissions = await CommissionEngine.processAdmissionCommission(admission, req.user);

    // Notifications
    await Notification.create({
      userId: lead.assignedCounsellor,
      title: '🎉 Admission Confirmed!',
      message: `Admission ${admissionId} confirmed for ${lead.studentName} at ${school.name}. Commission generated!`,
      type: 'admission_confirmed',
      link: '/counsellor/admissions'
    });

    return res.status(201).json({
      success: true,
      message: `Admission ${admissionId} confirmed and commissions generated successfully!`,
      admission,
      commissions
    });
  } catch (error) {
    console.error('Create admission error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to confirm admission.' });
  }
};

// Cancel Admission & Trigger Reversals
exports.cancelAdmission = async (req, res) => {
  try {
    const { id } = req.params;
    const { cancellationReason } = req.body;

    const admission = await Admission.findById(id);
    if (!admission) return res.status(404).json({ success: false, message: 'Admission not found.' });

    if (admission.admissionStatus === 'Cancelled') {
      return res.status(400).json({ success: false, message: 'Admission is already cancelled.' });
    }

    admission.admissionStatus = 'Cancelled';
    admission.cancellationReason = cancellationReason || 'Admission withdrawn by parent';
    admission.cancelledAt = new Date();
    await admission.save();

    // Reverse all non-reversed commissions associated with this admission
    const activeCommissions = await Commission.find({
      admissionId: admission._id,
      status: { $ne: 'Reversed' }
    });

    const reversals = [];
    for (const comm of activeCommissions) {
      const resRev = await CommissionEngine.reverseCommission(
        comm.commissionId,
        cancellationReason || 'Admission cancelled',
        req.user
      );
      reversals.push(resRev);
    }

    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'REVERSE',
      module: 'Admissions',
      details: `Cancelled Admission ${admission.admissionId} and reversed ${reversals.length} associated commissions`,
      isSpecialFlag: true
    });

    return res.status(200).json({
      success: true,
      message: `Admission ${admission.admissionId} cancelled and commissions reversed.`,
      admission,
      reversalsCount: reversals.length
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to cancel admission.' });
  }
};
