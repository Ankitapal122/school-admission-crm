const mongoose = require('mongoose');

const followUpSchema = new mongoose.Schema({
  followUpId: { type: String, required: true, unique: true },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
  counsellorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  scheduledDate: { type: Date, required: true },
  type: { type: String, enum: ['Call', 'WhatsApp', 'Meeting', 'Campus Visit'], default: 'Call' },
  status: { type: String, enum: ['Scheduled', 'Completed', 'Overdue', 'Rescheduled'], default: 'Scheduled' },
  outcome: { type: String, default: '' },
  duration: { type: String, default: '' },
  recordingLink: { type: String, default: '' },
  notes: { type: String, default: '' },
  dpdpConsentRecorded: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('FollowUp', followUpSchema);
