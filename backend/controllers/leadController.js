const Lead = require('../models/Lead');
const Parent = require('../models/Parent');
const Student = require('../models/Student');
const User = require('../models/User');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');

// Get leads based on role
exports.getLeads = async (req, res) => {
  try {
    const { status, verificationStatus, priority, search, page = 1, limit = 50 } = req.query;
    let query = {};

    // Role-based visibility
    if (req.user.role === 'counsellor') {
      // Counsellor sees only their assigned leads
      query.assignedCounsellor = req.user._id;
    } else if (req.user.role === 'manager') {
      // Manager sees only leads in their team
      if (req.user.team) {
        query.teamId = req.user.team;
      } else {
        query.assignedManager = req.user._id;
      }
    }
    // Admin sees all leads!

    if (status) query.leadStatus = status;
    if (verificationStatus) query.verificationStatus = verificationStatus;
    if (priority) query.leadPriority = priority;

    const leads = await Lead.find(query)
      .populate('parentId')
      .populate('studentId')
      .populate('preferredSchool', 'name city state board annualFeesMin annualFeesMax')
      .populate('assignedCounsellor', 'name email employeeId')
      .populate('assignedManager', 'name email employeeId')
      .populate('teamId', 'name code')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Lead.countDocuments(query);

    return res.status(200).json({
      success: true,
      count: leads.length,
      total,
      page: parseInt(page),
      leads
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve leads.' });
  }
};

// Check for duplicates
exports.checkDuplicate = async (req, res) => {
  try {
    const { mobile, studentName, admissionClass } = req.body;
    if (!mobile && !studentName) {
      return res.status(400).json({ success: false, message: 'Mobile or Student name required to check duplicate.' });
    }

    const cleanMobile = mobile ? mobile.replace(/\D/g, '') : '';
    let duplicateParent = null;

    if (cleanMobile) {
      duplicateParent = await Parent.findOne({
        mobile: new RegExp(cleanMobile.slice(-10) + '$')
      });
    }

    let duplicateStudent = null;
    if (studentName && admissionClass) {
      duplicateStudent = await Student.findOne({
        name: new RegExp(`^${studentName.trim()}$`, 'i'),
        admissionClass: admissionClass.trim()
      });
    }

    let matchedLead = null;
    if (duplicateParent) {
      matchedLead = await Lead.findOne({ parentId: duplicateParent._id })
        .populate('parentId')
        .populate('studentId')
        .populate('assignedCounsellor', 'name');
    }

    const isDuplicate = !!(duplicateParent || duplicateStudent);

    return res.status(200).json({
      success: true,
      isDuplicate,
      matchedLead: matchedLead ? {
        leadId: matchedLead.leadId,
        parentName: matchedLead.parentId?.name,
        studentName: matchedLead.studentId?.name,
        status: matchedLead.leadStatus,
        counsellor: matchedLead.assignedCounsellor?.name,
        createdAt: matchedLead.createdAt
      } : null
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to check duplicate.' });
  }
};

// Create New Lead (Parent + Student + Enquiry)
exports.createLead = async (req, res) => {
  try {
    const {
      // Parent
      parentName, mobile, alternateMobile, email, city, state, whatsappNumber, communicationConsent,
      // Student
      studentName, gender, currentClass, admissionClass, currentSchool, academicYear,
      // Enquiry
      leadSource, preferredSchool, preferredLocation, boardingPreference, annualBudget,
      leadPriority, remarks, isDraft
    } = req.body;

    if (!parentName || !mobile || !studentName || !admissionClass) {
      return res.status(400).json({
        success: false,
        message: 'Parent Name, Mobile, Student Name, and Admission Class are required.'
      });
    }

    // 1. Check or Create Parent
    let parent = await Parent.findOne({ mobile: mobile.trim() });
    if (!parent) {
      parent = await Parent.create({
        name: parentName.trim(),
        mobile: mobile.trim(),
        alternateMobile: alternateMobile || '',
        email: email || '',
        city: city || 'Dehradun',
        state: state || 'Uttarakhand',
        whatsappNumber: whatsappNumber || mobile.trim(),
        communicationConsent: communicationConsent !== undefined ? communicationConsent : true
      });
    }

    // 2. Create Student
    const student = await Student.create({
      name: studentName.trim(),
      gender: gender || 'male',
      currentClass: currentClass || '',
      admissionClass: admissionClass.trim(),
      currentSchool: currentSchool || '',
      academicYear: academicYear || '2026-27',
      parentId: parent._id
    });

    // 3. Generate Lead ID
    const leadCount = await Lead.countDocuments();
    const leadId = String(leadCount + 1).padStart(3, '0');

    // Determine Counsellor and Manager
    const assignedCounsellorId = req.user.role === 'counsellor' ? req.user._id : (req.body.assignedCounsellor || req.user._id);
    const assignedCounsellor = await User.findById(assignedCounsellorId);
    const assignedManagerId = assignedCounsellor?.manager || req.user._id;
    const teamId = assignedCounsellor?.team || req.user.team;

    const verificationStatus = isDraft ? 'Draft' : 'Pending Verification';

    const lead = await Lead.create({
      leadId,
      parentId: parent._id,
      studentId: student._id,
      leadSource: leadSource || 'Direct Enquiry',
      preferredSchool: preferredSchool || null,
      preferredLocation: preferredLocation || 'Dehradun',
      boardingPreference: boardingPreference || 'Full Boarding',
      annualBudget: annualBudget || '₹4.5L - ₹6.5L',
      admissionSession: academicYear || '2026-27',
      leadPriority: leadPriority || 'Hot',
      leadScore: 85,
      assignedCounsellor: assignedCounsellorId,
      assignedManager: assignedManagerId,
      teamId,
      leadStatus: 'New',
      verificationStatus,
      nextFollowUpDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // Auto +3 Days
      remarks: remarks ? [{
        author: req.user.name,
        role: req.user.role,
        note: remarks
      }] : [],
      history: [{
        action: isDraft ? 'DRAFT_SAVED' : 'SUBMITTED_FOR_VERIFICATION',
        user: req.user.name,
        details: isDraft ? 'Saved lead enquiry as draft' : 'Submitted lead for Manager approval'
      }]
    });

    // Notify Manager if submitted for verification
    if (!isDraft && assignedManagerId) {
      await Notification.create({
        userId: assignedManagerId,
        title: 'New Lead Pending Verification',
        message: `${req.user.name} submitted enquiry ${leadId} (${studentName} - ${admissionClass}) for review.`,
        type: 'lead_assigned',
        link: `/manager/leads`
      });
    }

    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'CREATE',
      module: 'Leads',
      details: `Created lead ${leadId} (${studentName}) - Verification: ${verificationStatus}`,
      isSpecialFlag: false
    });

    return res.status(201).json({
      success: true,
      message: isDraft ? 'Lead draft saved.' : `Lead ${leadId} created and submitted for verification.`,
      lead
    });
  } catch (error) {
    console.error('Create lead error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to create lead.' });
  }
};

// Manager Lead Verification (Approve / Return / Reject)
exports.verifyLead = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, notes } = req.body; // action: 'approve' | 'return' | 'reject'

    // Rule: Counsellors cannot approve their own submitted leads!
    if (req.user.role === 'counsellor') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Counsellors cannot approve or verify their own leads. Manager approval required.'
      });
    }

    const lead = await Lead.findById(id).populate('assignedCounsellor');
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found.' });

    let newStatus = 'Approved';
    if (action === 'return') newStatus = 'Returned';
    if (action === 'reject') newStatus = 'Rejected';

    lead.verificationStatus = newStatus;
    lead.verificationNotes = notes || '';
    lead.verifiedBy = req.user._id;
    lead.verifiedAt = new Date();

    lead.history.push({
      action: `LEAD_${newStatus.toUpperCase()}`,
      user: req.user.name,
      details: `Manager marked lead as ${newStatus}. Notes: "${notes || 'None'}"`
    });

    if (lead.assignedCounsellor) {
      let notifType = 'lead_approved';
      if (action === 'return') notifType = 'lead_returned';
      if (action === 'reject') notifType = 'lead_rejected';

      await Notification.create({
        userId: lead.assignedCounsellor._id,
        title: `Lead ${lead.leadId} ${newStatus}`,
        message: `Manager ${req.user.name} marked lead ${lead.leadId} as ${newStatus}. Notes: ${notes || 'No remarks'}`,
        type: notifType,
        link: `/counsellor/leads`
      });
    }

    await lead.save();

    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: action === 'approve' ? 'APPROVE' : action === 'return' ? 'RETURN' : 'REJECT',
      module: 'Leads',
      details: `Lead ${lead.leadId} verified as ${newStatus} by Manager`,
      isSpecialFlag: action === 'reject'
    });

    return res.status(200).json({
      success: true,
      message: `Lead ${lead.leadId} has been ${newStatus.toLowerCase()}.`,
      lead
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to verify lead.' });
  }
};

// Reassign lead to another Counsellor (Manager or Admin)
exports.reassignLead = async (req, res) => {
  try {
    const { id } = req.params;
    const { newCounsellorId, reason } = req.body;

    const lead = await Lead.findById(id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found.' });

    const newCounsellor = await User.findById(newCounsellorId);
    if (!newCounsellor) return res.status(404).json({ success: false, message: 'New counsellor not found.' });

    const prevCounsellorId = lead.assignedCounsellor;
    lead.assignedCounsellor = newCounsellor._id;

    lead.history.push({
      action: 'LEAD_REASSIGNED',
      user: req.user.name,
      details: `Reassigned to ${newCounsellor.name}. Reason: "${reason || 'Workflow rebalancing'}"`
    });

    await lead.save();

    // Notify new counsellor
    await Notification.create({
      userId: newCounsellor._id,
      title: 'New Lead Reassigned to You',
      message: `Lead ${lead.leadId} has been reassigned to you by ${req.user.name}.`,
      type: 'lead_assigned',
      link: `/counsellor/leads`
    });

    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'UPDATE',
      module: 'Leads',
      details: `Reassigned lead ${lead.leadId} to ${newCounsellor.name}`,
      isSpecialFlag: false
    });

    return res.status(200).json({
      success: true,
      message: `Lead successfully reassigned to ${newCounsellor.name}.`,
      lead
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to reassign lead.' });
  }
};

// Add remark to lead
exports.addRemark = async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;

    if (!note || !note.trim()) {
      return res.status(400).json({ success: false, message: 'Remark text required.' });
    }

    const lead = await Lead.findById(id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found.' });

    lead.remarks.push({
      author: req.user.name,
      role: req.user.role,
      note: note.trim()
    });

    lead.history.push({
      action: 'REMARK_ADDED',
      user: req.user.name,
      details: note.trim()
    });

    await lead.save();

    return res.status(200).json({ success: true, message: 'Remark added successfully.', lead });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to add remark.' });
  }
};
