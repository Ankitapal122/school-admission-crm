const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  employeeId: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'manager', 'counsellor'], required: true },
  team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
  manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  phone: { type: String, default: '' },
  status: { type: String, enum: ['Active', 'Suspended', 'Inactive'], default: 'Active' },
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorMethod: { type: String, enum: ['authenticator', 'email'], default: 'authenticator' },
  twoFactorSecret: { type: String, default: '' },
  recoveryCodes: [{ type: String }],
  lastLogin: { type: Date, default: null },
  bankDetails: {
    bankName: { type: String, default: 'HDFC Bank' },
    accountNo: { type: String, default: '•••• •••• 4589' },
    ifsc: { type: String, default: 'HDFC0001234' },
    pan: { type: String, default: 'ABCDE1234F' }
  },
  activeSessions: [{
    sessionId: String,
    device: String,
    ip: String,
    lastActive: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

// Hash password before saving (Async hook in Mongoose without next parameter)
userSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
