const mongoose = require('mongoose');

const schoolSchema = new mongoose.Schema({
  schoolId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  board: { type: String, enum: ['CBSE', 'ICSE', 'IB', 'Cambridge'], default: 'CBSE' },
  genderType: { type: String, enum: ['boys', 'girls', 'co_ed'], default: 'co_ed' },
  city: { type: String, required: true },
  state: { type: String, default: 'Uttarakhand' },
  rank: { type: Number, default: 1 },
  annualFeesMin: { type: Number, required: true },
  annualFeesMax: { type: Number, required: true },
  feesDisplay: { type: String, default: '₹4.5L - ₹6.5L' },
  defaultCommission: { type: Number, default: 25000 },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  hostelQuality: { type: String, default: '5 Star' },
  sports: [{ type: String }],
  academicRating: { type: Number, default: 4.8 },
  facilitiesRating: { type: Number, default: 4.8 },
  coCurricularRating: { type: Number, default: 4.7 },
  description: { type: String, default: '' },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('School', schoolSchema);
