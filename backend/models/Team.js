const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema({
  teamId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true, uppercase: true },
  description: { type: String, default: '' },
  manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  counsellors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  target: { type: Number, default: 50 },
  monthlyAdmissionTarget: { type: Number, default: 10 },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  history: [{
    action: String,
    performedBy: String,
    date: { type: Date, default: Date.now },
    notes: String
  }]
}, { timestamps: true });

module.exports = mongoose.model('Team', teamSchema);
