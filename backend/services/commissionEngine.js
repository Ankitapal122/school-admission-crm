const mongoose = require('mongoose');
const Commission = require('../models/Commission');
const CommissionRule = require('../models/CommissionRule');
const AuditLog = require('../models/AuditLog');

class CommissionEngine {
  // Step 1 - 5: Calculate and create separate commission records
  static async processAdmissionCommission(admission, performingUser = null) {
    // Check if commission already generated for this admission
    const existing = await Commission.findOne({ admissionId: admission._id, beneficiaryType: 'Counsellor' });
    if (existing) {
      throw new Error(`Commission has already been generated for admission ${admission.admissionId}`);
    }

    // Get active rule
    let rule = await CommissionRule.findOne({ isActive: true });
    if (!rule) {
      rule = await CommissionRule.create({
        ruleId: 'RULE-DEFAULT-2026',
        name: 'Standard Boarding Admission Share',
        type: 'Fixed',
        counsellorShare: 5000,
        managerShare: 2000,
        orgShare: 3000,
        totalCommissionAmount: 10000,
        isActive: true,
        version: 1
      });
    }

    const totalCount = await Commission.countDocuments();
    const records = [];

    // 1. Counsellor Record
    const counsellorComm = await Commission.create({
      commissionId: String(totalCount + 1).padStart(3, '0'),
      admissionId: admission._id,
      leadId: admission.leadId,
      schoolName: admission.schoolName,
      studentName: admission.studentName,
      parentName: admission.parentName,
      beneficiaryType: 'Counsellor',
      beneficiaryUser: admission.assignedCounsellor,
      beneficiaryName: admission.assignedCounsellor ? (admission.assignedCounsellor.name || 'Assigned Counsellor') : 'Counsellor',
      teamId: admission.teamId,
      amount: rule.counsellorShare,
      status: 'Pending Approval',
      ruleVersion: rule.version
    });
    records.push(counsellorComm);

    // 2. Manager Record
    const managerComm = await Commission.create({
      commissionId: String(totalCount + 2).padStart(3, '0'),
      admissionId: admission._id,
      leadId: admission.leadId,
      schoolName: admission.schoolName,
      studentName: admission.studentName,
      parentName: admission.parentName,
      beneficiaryType: 'Manager',
      beneficiaryUser: admission.assignedManager,
      beneficiaryName: admission.assignedManager ? (admission.assignedManager.name || 'Assigned Manager') : 'Manager',
      teamId: admission.teamId,
      amount: rule.managerShare,
      status: 'Pending Approval',
      ruleVersion: rule.version
    });
    records.push(managerComm);

    // 3. Organization Record
    const orgComm = await Commission.create({
      commissionId: String(totalCount + 3).padStart(3, '0'),
      admissionId: admission._id,
      leadId: admission.leadId,
      schoolName: admission.schoolName,
      studentName: admission.studentName,
      parentName: admission.parentName,
      beneficiaryType: 'Organization',
      beneficiaryUser: null,
      beneficiaryName: 'Uttarakhand BoardingEdu Ltd.',
      teamId: admission.teamId,
      amount: rule.orgShare,
      status: 'Pending Approval',
      ruleVersion: rule.version
    });
    records.push(orgComm);

    // Mark admission as commission generated
    admission.commissionGenerated = true;
    await admission.save();

    // Audit Log
    await AuditLog.create({
      userId: performingUser ? performingUser._id : null,
      userName: performingUser ? performingUser.name : 'System Commission Engine',
      userRole: performingUser ? performingUser.role : 'System',
      action: 'CREATE',
      module: 'Commission',
      details: `Generated commissions for Admission ${admission.admissionId}: Counsellor ₹${rule.counsellorShare}, Manager ₹${rule.managerShare}, Org ₹${rule.orgShare} (Rule v${rule.version})`,
      isSpecialFlag: false
    });

    return records;
  }

  // Step 6 - 8: Approve Commission
  static async approveCommission(commissionId, approvedByUser) {
    const comm = await Commission.findOne({
      $or: [
        { commissionId },
        { _id: mongoose.isValidObjectId(commissionId) ? commissionId : null }
      ]
    });
    if (!comm) throw new Error('Commission entry not found');
    if (comm.status !== 'Pending Approval' && comm.status !== 'Pending') {
      throw new Error(`Commission is already in '${comm.status}' status`);
    }

    comm.status = 'Approved';
    comm.approvedBy = approvedByUser._id;
    comm.approvedAt = new Date();
    await comm.save();

    await AuditLog.create({
      userId: approvedByUser._id,
      userName: approvedByUser.name,
      userRole: approvedByUser.role,
      action: 'APPROVE',
      module: 'Commission',
      details: `Approved Commission ${comm.commissionId} (₹${comm.amount}) for ${comm.beneficiaryName}`,
      isSpecialFlag: false
    });

    return comm;
  }

  // Step 9 - 10: Record Payment
  static async recordPayment(commissionId, paymentData, recordedByUser) {
    const comm = await Commission.findOne({
      $or: [
        { commissionId },
        { _id: mongoose.isValidObjectId(commissionId) ? commissionId : null }
      ]
    });
    if (!comm) throw new Error('Commission entry not found');
    if (comm.status !== 'Approved' && comm.status !== 'Payable') {
      throw new Error(`Only approved commissions can be paid. Current status: ${comm.status}`);
    }

    comm.status = 'Paid';
    comm.paymentReference = paymentData.paymentReference || `UTR-${Date.now()}`;
    comm.paymentDate = paymentData.paymentDate || new Date();
    comm.paymentMode = paymentData.paymentMode || 'NEFT / Bank Transfer';
    await comm.save();

    await AuditLog.create({
      userId: recordedByUser._id,
      userName: recordedByUser.name,
      userRole: recordedByUser.role,
      action: 'UPDATE',
      module: 'Commission',
      details: `Paid Commission ${comm.commissionId} (₹${comm.amount}) Ref: ${comm.paymentReference}`,
      isSpecialFlag: false
    });

    return comm;
  }

  // Cancellation & Reversal Process
  static async reverseCommission(commissionId, reason, reversedByUser) {
    const original = await Commission.findOne({
      $or: [
        { commissionId },
        { _id: mongoose.isValidObjectId(commissionId) ? commissionId : null }
      ]
    });
    if (!original) throw new Error('Original commission not found');

    if (original.status === 'Reversed') {
      throw new Error('Commission is already reversed');
    }

    original.status = 'Reversed';
    original.reversalReason = reason;
    original.reversedAt = new Date();
    await original.save();

    // Create linked reversal entry
    const reversalEntry = await Commission.create({
      commissionId: `${original.commissionId}-REV`,
      admissionId: original.admissionId,
      leadId: original.leadId,
      schoolName: original.schoolName,
      studentName: `${original.studentName} (Reversal Adjustment)`,
      parentName: original.parentName,
      beneficiaryType: original.beneficiaryType,
      beneficiaryUser: original.beneficiaryUser,
      beneficiaryName: original.beneficiaryName,
      teamId: original.teamId,
      amount: -Math.abs(original.amount),
      status: 'Reversed',
      ruleVersion: original.ruleVersion,
      parentCommissionId: original._id,
      reversalReason: reason,
      reversedAt: new Date()
    });

    await AuditLog.create({
      userId: reversedByUser._id,
      userName: reversedByUser.name,
      userRole: reversedByUser.role,
      action: 'REVERSE',
      module: 'Commission',
      details: `Reversed Commission ${original.commissionId} (-₹${original.amount}) – Reason: "${reason}"`,
      isSpecialFlag: true
    });

    return { original, reversalEntry };
  }
}

module.exports = CommissionEngine;
