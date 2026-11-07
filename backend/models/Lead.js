const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
  leadId: { type: String, required: true, unique: true },
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Parent', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  leadSource: { type: String, default: 'Google Ads' },
  preferredSchool: { type: mongoose.Schema.Types.ObjectId, ref: 'School', default: null },
  preferredLocation: { type: String, default: 'Dehradun' },
  boardingPreference: { type: String, default: 'Full Boarding' },
  annualBudget: { type: String, default: '₹4.5L - ₹6.5L' },
  admissionSession: { type: String, default: '2026-27' },
  leadPriority: { type: String, enum: ['Hot', 'Warm', 'Cold'], default: 'Hot' },
  leadScore: { type: Number, default: 85 },
  
  assignedCounsellor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },

  leadStatus: {
    type: String,
    enum: [
      'New', 'Contacted', 'Requirement Analyzed', 'School Shortlisted',
      'School Shared', 'Parent Interested', 'School Visit Scheduled',
      'School Visit Done', 'Form Applied', 'Exam/Interview', 'Seat Offered',
      'Admission Confirmed', 'Converted', 'Cancelled', 'Merged', 'Expired', 'Suspended', 'Reopened'
    ],
    default: 'New'
  },

  verificationStatus: {
    type: String,
    enum: ['Draft', 'Pending Verification', 'Approved', 'Returned', 'Rejected'],
    default: 'Pending Verification'
  },
  verificationNotes: { type: String, default: '' },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  verifiedAt: { type: Date, default: null },

  nextFollowUpDate: { type: Date, default: () => new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) },
  followUpStatus: { type: String, enum: ['today', 'upcoming', 'overdue'], default: 'upcoming' },
  
  remarks: [{
    author: String,
    role: String,
    note: String,
    createdAt: { type: Date, default: Date.now }
  }],
  history: [{
    action: String,
    user: String,
    details: String,
    date: { type: Date, default: Date.now }
  }],

  isDuplicate: { type: Boolean, default: false },
  duplicateOf: { type: String, default: null },
  mergedInto: { type: String, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Lead', leadSchema);
