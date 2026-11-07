const mongoose = require('mongoose');

const parentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  mobile: { type: String, required: true },
  alternateMobile: { type: String, default: '' },
  email: { type: String, default: '' },
  city: { type: String, default: '' },
  state: { type: String, default: '' },
  whatsappNumber: { type: String, default: '' },
  communicationConsent: { type: Boolean, default: true },
  occupation: { type: String, default: '' },
  annualIncome: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Parent', parentSchema);
