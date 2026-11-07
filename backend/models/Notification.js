const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: {
    type: String,
    enum: [
      'lead_assigned', 'lead_approved', 'lead_returned', 'lead_rejected',
      'admission_confirmed', 'commission_generated', 'commission_approved',
      'commission_paid', 'followup_due', 'security_alert'
    ],
    default: 'lead_assigned'
  },
  read: { type: Boolean, default: false },
  link: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);
