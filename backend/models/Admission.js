const mongoose = require('mongoose');

const admissionSchema = new mongoose.Schema({
  admissionId: { type: String, required: true, unique: true },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
  parentName: { type: String, required: true },
  studentName: { type: String, required: true },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  schoolName: { type: String, required: true },
  admissionClass: { type: String, required: true },
  academicYear: { type: String, default: '2026-27' },
  admissionDate: { type: Date, default: Date.now },
  admissionStatus: {
    type: String,
    enum: [
      'Enquiry', 'Interested', 'School Shortlisted', 'Visit Scheduled',
      'Application Started', 'Admission Processing', 'Admission Confirmed',
      'Converted', 'Cancelled'
    ],
    default: 'Admission Confirmed'
  },
  assignedCounsellor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
  confirmedRevenue: { type: Number, required: true },
  admissionFee: { type: Number, required: true },
  proofDocument: { type: String, default: 'admission_receipt_verified.pdf' },
  commissionGenerated: { type: Boolean, default: false },
  cancellationReason: { type: String, default: '' },
  cancelledAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Admission', admissionSchema);
