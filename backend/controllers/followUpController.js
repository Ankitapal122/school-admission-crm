const FollowUp = require('../models/FollowUp');
const Lead = require('../models/Lead');
const AuditLog = require('../models/AuditLog');

// Get Follow-ups
exports.getFollowUps = async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'counsellor') {
      query.counsellorId = req.user._id;
    }

    const followUps = await FollowUp.find(query)
      .populate({
        path: 'leadId',
        populate: [{ path: 'parentId' }, { path: 'studentId' }]
      })
      .populate('counsellorId', 'name email employeeId')
      .sort({ scheduledDate: 1 });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayFollowUps = followUps.filter(f => {
      const d = new Date(f.scheduledDate);
      return d >= today && d < tomorrow;
    });

    const overdueFollowUps = followUps.filter(f => {
      const d = new Date(f.scheduledDate);
      return d < today && f.status === 'Scheduled';
    });

    return res.status(200).json({
      success: true,
      count: followUps.length,
      todayCount: todayFollowUps.length,
      overdueCount: overdueFollowUps.length,
      followUps,
      todayFollowUps,
      overdueFollowUps
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve follow-ups.' });
  }
};

// Create / Log Follow-up Call Outcome
exports.logFollowUp = async (req, res) => {
  try {
    const { leadId, type, scheduledDate, outcome, duration, recordingLink, notes, dpdpConsentRecorded } = req.body;

    if (!leadId) {
      return res.status(400).json({ success: false, message: 'Lead ID required.' });
    }

    const followUpId = `FLP-${Date.now().toString().slice(-6)}`;

    const followUp = await FollowUp.create({
      followUpId,
      leadId,
      counsellorId: req.user._id,
      scheduledDate: scheduledDate || new Date(),
      type: type || 'Call',
      status: outcome ? 'Completed' : 'Scheduled',
      outcome: outcome || 'Call logged',
      duration: duration || '03:45',
      recordingLink: recordingLink || 'call_recording_uk_01.mp3',
      notes: notes || '',
      dpdpConsentRecorded: dpdpConsentRecorded !== undefined ? dpdpConsentRecorded : true
    });

    // Update lead remarks and next follow-up
    const lead = await Lead.findById(leadId);
    if (lead) {
      if (notes) {
        lead.remarks.push({
          author: req.user.name,
          role: req.user.role,
          note: `[${type} Logged] Outcome: ${outcome || 'Completed'} - ${notes}`
        });
      }
      lead.history.push({
        action: 'FOLLOWUP_LOGGED',
        user: req.user.name,
        details: `${type} completed with outcome: ${outcome}`
      });
      await lead.save();
    }

    return res.status(201).json({
      success: true,
      message: 'Follow-up / call outcome recorded successfully.',
      followUp
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
