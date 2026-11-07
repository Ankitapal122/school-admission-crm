const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  userName: { type: String, required: true },
  userRole: { type: String, required: true },
  action: {
    type: String,
    enum: ['CREATE', 'UPDATE', 'DELETE', 'REVERSE', 'LOGIN', 'LOGOUT', 'EXPORT', 'APPROVE', 'REJECT', 'RETURN'],
    required: true
  },
  module: { type: String, required: true },
  details: { type: String, required: true },
  ipAddress: { type: String, default: '127.0.0.1' },
  isSpecialFlag: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('AuditLog', auditLogSchema);
