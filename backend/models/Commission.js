const mongoose = require('mongoose');

const commissionSchema = new mongoose.Schema({
  commissionId: { type: String, required: true, unique: true },
  admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admission', required: true },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
  schoolName: { type: String, required: true },
  studentName: { type: String, required: true },
  parentName: { type: String, default: '' },
  beneficiaryType: {
    type: String,
    enum: ['Counsellor', 'Manager', 'Organization'],
    required: true
  },
  beneficiaryUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  beneficiaryName: { type: String, required: true },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
  amount: { type: Number, required: true },
  status: {
    type: String,
    enum: [
      'Pending', 'Pending Approval', 'Approved', 'Payable',
      'Partially Paid', 'Paid', 'Rejected', 'Reversed'
    ],
    default: 'Pending Approval'
  },
  ruleVersion: { type: Number, default: 1 },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
  paymentReference: { type: String, default: '' },
  paymentDate: { type: Date, default: null },
  paymentMode: { type: String, default: 'NEFT / Bank Transfer' },
  parentCommissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Commission', default: null },
  reversalReason: { type: String, default: '' },
  reversedAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Commission', commissionSchema);
