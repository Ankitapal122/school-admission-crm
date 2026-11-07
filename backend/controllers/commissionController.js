const Commission = require('../models/Commission');
const CommissionRule = require('../models/CommissionRule');
const CommissionEngine = require('../services/commissionEngine');

// Get commissions based on role
exports.getCommissions = async (req, res) => {
  try {
    let query = {};

    if (req.user.role === 'counsellor') {
      // Counsellor sees only their commissions
      query.beneficiaryUser = req.user._id;
    } else if (req.user.role === 'manager') {
      // Manager sees commissions for their team + their personal manager commissions
      if (req.user.team) {
        query.$or = [
          { teamId: req.user.team },
          { beneficiaryUser: req.user._id }
        ];
      } else {
        query.beneficiaryUser = req.user._id;
      }
    }
    // Admin sees all commissions!

    const commissions = await Commission.find(query)
      .populate('admissionId')
      .populate('beneficiaryUser', 'name email employeeId')
      .populate('teamId', 'name code')
      .sort({ createdAt: -1 });

    // Calculate aggregated metrics
    const totalEarned = commissions
      .filter(c => c.status !== 'Reversed' && c.status !== 'Rejected')
      .reduce((sum, c) => sum + c.amount, 0);

    const pending = commissions
      .filter(c => c.status === 'Pending Approval' || c.status === 'Pending')
      .reduce((sum, c) => sum + c.amount, 0);

    const approved = commissions
      .filter(c => c.status === 'Approved' || c.status === 'Payable')
      .reduce((sum, c) => sum + c.amount, 0);

    const paid = commissions
      .filter(c => c.status === 'Paid')
      .reduce((sum, c) => sum + c.amount, 0);

    return res.status(200).json({
      success: true,
      count: commissions.length,
      metrics: { totalEarned, pending, approved, paid },
      commissions
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve commissions.' });
  }
};

// Approve Commission (Admin or Manager)
exports.approveCommission = async (req, res) => {
  try {
    const { commissionId } = req.params;
    const comm = await CommissionEngine.approveCommission(commissionId, req.user);
    return res.status(200).json({
      success: true,
      message: `Commission ${commissionId} approved and marked Payable.`,
      commission: comm
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

// Record Payment (Admin only)
exports.recordPayment = async (req, res) => {
  try {
    const { commissionId } = req.params;
    const { paymentReference, paymentDate, paymentMode } = req.body;

    const comm = await CommissionEngine.recordPayment(
      commissionId,
      { paymentReference, paymentDate, paymentMode },
      req.user
    );

    return res.status(200).json({
      success: true,
      message: `Payment recorded for ${commissionId}. Status is now Paid.`,
      commission: comm
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

// Reverse Commission (Admin or Manager)
exports.reverseCommission = async (req, res) => {
  try {
    const { commissionId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ success: false, message: 'Reversal reason is required.' });
    }

    const result = await CommissionEngine.reverseCommission(commissionId, reason, req.user);
    return res.status(200).json({
      success: true,
      message: `Commission ${commissionId} reversed and adjustment posted.`,
      result
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

// Get Commission Rules
exports.getCommissionRules = async (req, res) => {
  try {
    const rules = await CommissionRule.find().sort({ version: -1 });
    return res.status(200).json({ success: true, rules });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch rules.' });
  }
};

// Update / Create Commission Rule (Admin only)
exports.updateCommissionRule = async (req, res) => {
  try {
    const { name, type, counsellorShare, managerShare, orgShare, eligibilityRules } = req.body;

    const latest = await CommissionRule.findOne().sort({ version: -1 });
    const nextVersion = (latest?.version || 1) + 1;

    // Deactivate previous
    await CommissionRule.updateMany({}, { isActive: false });

    const total = parseFloat(counsellorShare) + parseFloat(managerShare) + parseFloat(orgShare);

    const rule = await CommissionRule.create({
      ruleId: `RULE-UK-${nextVersion}`,
      name: name || `Uttarakhand Policy v${nextVersion}`,
      type: type || 'Fixed',
      counsellorShare: parseFloat(counsellorShare),
      managerShare: parseFloat(managerShare),
      orgShare: parseFloat(orgShare),
      totalCommissionAmount: total,
      eligibilityRules: eligibilityRules || 'Confirmed admission with tuition fee receipt submission',
      isActive: true,
      version: nextVersion
    });

    return res.status(201).json({
      success: true,
      message: `Commission Rule v${nextVersion} created and activated!`,
      rule
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update commission rules.' });
  }
};
