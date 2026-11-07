const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  dob: { type: Date, default: null },
  gender: { type: String, enum: ['male', 'female', 'other'], default: 'male' },
  currentClass: { type: String, default: '' },
  admissionClass: { type: String, required: true },
  currentSchool: { type: String, default: '' },
  academicYear: { type: String, default: '2026-27' },
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Parent', required: true }
}, { timestamps: true });

module.exports = mongoose.model('Student', studentSchema);
