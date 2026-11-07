const mongoose = require('mongoose');

const communicationSchema = new mongoose.Schema({
  channel: { type: String, enum: ['whatsapp', 'email', 'sms'], required: true },
  recipient: { type: String, required: true },
  recipientName: { type: String, default: '' },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
  templateName: { type: String, default: '' },
  subject: { type: String, default: '' },
  message: { type: String, required: true },
  status: { type: String, enum: ['queued', 'sent', 'delivered', 'read', 'failed'], default: 'delivered' },
  sender: { type: String, default: 'System' },
  deliveryTimestamp: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Communication', communicationSchema);
