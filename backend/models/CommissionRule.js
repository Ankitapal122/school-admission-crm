const mongoose = require('mongoose');

const commissionRuleSchema = new mongoose.Schema({
  ruleId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['Fixed', 'Percentage'], default: 'Fixed' },
  counsellorShare: { type: Number, required: true, default: 5000 },
  managerShare: { type: Number, required: true, default: 2000 },
  orgShare: { type: Number, required: true, default: 3000 },
  totalCommissionAmount: { type: Number, default: 10000 },
  calculationBase: { type: String, enum: ['Per Admission', 'Percentage of Fees'], default: 'Per Admission' },
  eligibilityRules: { type: String, default: 'Confirmed admission with tuition fee receipt submission' },
  isActive: { type: Boolean, default: true },
  version: { type: Number, default: 1 }
}, { timestamps: true });

module.exports = mongoose.model('CommissionRule', commissionRuleSchema);
