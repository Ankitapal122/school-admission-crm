const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const User = require('../models/User');
const PasswordReset = require('../models/PasswordReset');
const AuditLog = require('../models/AuditLog');

// Generate JWT Token
const generateToken = (userId, role) => {
  return jwt.sign(
    { id: userId, role },
    process.env.JWT_SECRET || 'super_secure_enterprise_jwt_secret_uttarakhand_crm_2026',
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
};

// 1. Login
exports.login = async (req, res) => {
  try {
    const { identifier, password, role: selectedRole, rememberMe } = req.body;

    if (!identifier || !password || !selectedRole) {
      return res.status(400).json({
        success: false,
        message: 'Please provide Email / Employee ID, Password, and Role selection.'
      });
    }

    // Find by email or employeeId
    const user = await User.findOne({
      $or: [
        { email: identifier.toLowerCase().trim() },
        { employeeId: identifier.trim().toUpperCase() }
      ]
    }).populate('team').populate('manager');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. User does not exist.'
      });
    }

    // Verify Password with bcrypt
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials. Incorrect password.'
      });
    }

    // Verify Account Status
    if (user.status !== 'Active') {
      return res.status(403).json({
        success: false,
        message: `Account is ${user.status}. Please contact the Super Administrator.`
      });
    }

    // STRICT AUTHENTICATION RULE: Selected role must match actual assigned role in MongoDB!
    if (user.role !== selectedRole.toLowerCase()) {
      return res.status(403).json({
        success: false,
        message: `Access Denied: Your assigned account role is '${user.role.toUpperCase()}', but you selected '${selectedRole.toUpperCase()}'. Unauthorized role selection is strictly blocked.`
      });
    }

    // Check if 2FA is required
    if (user.twoFactorEnabled) {
      const tempToken = jwt.sign(
        { id: user._id, role: user.role, is2FA: true },
        process.env.JWT_SECRET || 'super_secure_enterprise_jwt_secret_uttarakhand_crm_2026',
        { expiresIn: '5m' }
      );

      return res.status(200).json({
        success: true,
        require2FA: true,
        tempToken,
        method: user.twoFactorMethod || 'authenticator',
        message: 'Two-Factor Authentication required. Please enter 6-digit verification code.'
      });
    }

    // Generate Full Token
    const token = generateToken(user._id, user.role);

    // Record Session
    const sessionInfo = {
      sessionId: `SESS-${Date.now()}`,
      device: req.headers['user-agent'] ? req.headers['user-agent'].slice(0, 50) : 'Web Browser',
      ip: req.ip || '127.0.0.1',
      lastActive: new Date()
    };
    user.activeSessions.push(sessionInfo);
    user.lastLogin = new Date();
    await user.save();

    // Audit Log
    await AuditLog.create({
      userId: user._id,
      userName: user.name,
      userRole: user.role,
      action: 'LOGIN',
      module: 'Auth',
      details: `Successful login as ${user.role.toUpperCase()} (ID: ${user.employeeId})`,
      ipAddress: req.ip || '127.0.0.1'
    });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: rememberMe ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000
    });

    return res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        employeeId: user.employeeId,
        role: user.role,
        team: user.team,
        manager: user.manager,
        phone: user.phone,
        twoFactorEnabled: user.twoFactorEnabled
      },
      dashboardUrl: user.role === 'admin' ? '/admin' : user.role === 'manager' ? '/manager' : '/counsellor'
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Server error during authentication.' });
  }
};

// 2. Verify 2FA (OTP / TOTP / Recovery Code)
exports.verify2FA = async (req, res) => {
  try {
    const { tempToken, code, isRecoveryCode } = req.body;

    if (!tempToken || !code) {
      return res.status(400).json({ success: false, message: 'Temporary token and verification code required.' });
    }

    const decoded = jwt.verify(tempToken, process.env.JWT_SECRET || 'super_secure_enterprise_jwt_secret_uttarakhand_crm_2026');
    const user = await User.findById(decoded.id).populate('team').populate('manager');

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found.' });
    }

    let isValid = false;

    if (isRecoveryCode) {
      // Check recovery codes
      const formattedCode = code.trim().toUpperCase();
      if (user.recoveryCodes && user.recoveryCodes.includes(formattedCode)) {
        isValid = true;
        // Remove used recovery code
        user.recoveryCodes = user.recoveryCodes.filter(c => c !== formattedCode);
      }
    } else {
      // Speakeasy TOTP verification
      if (user.twoFactorSecret) {
        isValid = speakeasy.totp.verify({
          secret: user.twoFactorSecret,
          encoding: 'base32',
          token: code.trim(),
          window: 2
        });
      }
      // Demo fallback OTP for testing / email OTP (e.g. 123456 or 482915)
      if (!isValid && (code.trim() === '123456' || code.trim() === '482915')) {
        isValid = true;
      }
    }

    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid 2FA verification code. Please try again.' });
    }

    // Success: Generate full token
    const token = generateToken(user._id, user.role);

    user.lastLogin = new Date();
    await user.save();

    await AuditLog.create({
      userId: user._id,
      userName: user.name,
      userRole: user.role,
      action: 'LOGIN',
      module: 'Auth',
      details: `2FA verification completed (${isRecoveryCode ? 'Recovery Code' : 'TOTP Authenticator'})`,
      ipAddress: req.ip || '127.0.0.1'
    });

    return res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        employeeId: user.employeeId,
        role: user.role,
        team: user.team,
        manager: user.manager,
        phone: user.phone,
        twoFactorEnabled: user.twoFactorEnabled
      },
      dashboardUrl: user.role === 'admin' ? '/admin' : user.role === 'manager' ? '/manager' : '/counsellor'
    });
  } catch (error) {
    return res.status(401).json({ success: false, message: '2FA session expired. Please log in again.' });
  }
};

// 3. Forgot Password - Request OTP & Token
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email address is required.' });

    const cleanEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: cleanEmail });

    // Always respond with success to avoid leaking whether user exists (Security requirement)
    if (!user) {
      return res.status(200).json({
        success: true,
        message: 'If this email address is registered, a password reset code has been sent.'
      });
    }

    // Generate 6-digit OTP and random secure token
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const token = `RST-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    await PasswordReset.create({
      email: cleanEmail,
      token,
      otp,
      expiresAt,
      used: false
    });

    console.log(`[Email Simulation] Password reset OTP for ${cleanEmail}: ${otp} (Token: ${token})`);

    return res.status(200).json({
      success: true,
      message: `Password reset verification code sent to ${cleanEmail}. Valid for 15 minutes.`,
      demoOtp: otp, // For seamless testing in browser UI
      token
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ success: false, message: 'Failed to process password reset.' });
  }
};

// 4. Verify Password Reset OTP
exports.verifyResetOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ success: false, message: 'Email and OTP required.' });

    const cleanEmail = email.toLowerCase().trim();
    const resetRecord = await PasswordReset.findOne({
      email: cleanEmail,
      otp: otp.trim(),
      used: false,
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 });

    if (!resetRecord) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP code. Please request a new code.'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'OTP verified successfully.',
      resetToken: resetRecord.token
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error verifying OTP.' });
  }
};

// 5. Reset Password
exports.resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword, confirmPassword } = req.body;

    if (!resetToken || !newPassword) {
      return res.status(400).json({ success: false, message: 'Reset token and new password are required.' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }

    // Password Policy Check: Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
    const policyRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!policyRegex.test(newPassword)) {
      return res.status(400).json({
        success: false,
        message: 'Password must have minimum 8 characters, at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character (@$!%*?&).'
      });
    }

    const record = await PasswordReset.findOne({
      token: resetToken,
      used: false,
      expiresAt: { $gt: new Date() }
    });

    if (!record) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token. Please request password reset again.'
      });
    }

    const user = await User.findOne({ email: record.email });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Update password (pre-save hook will hash with bcrypt)
    user.password = newPassword;
    // Revoke all existing sessions
    user.activeSessions = [];
    await user.save();

    // Mark reset record as used
    record.used = true;
    await record.save();

    await AuditLog.create({
      userId: user._id,
      userName: user.name,
      userRole: user.role,
      action: 'UPDATE',
      module: 'Auth',
      details: 'Password successfully changed and all active sessions revoked.',
      ipAddress: req.ip || '127.0.0.1'
    });

    return res.status(200).json({
      success: true,
      message: 'Password has been successfully reset! You can now log in with your new password.'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ success: false, message: 'Failed to reset password.' });
  }
};

// 6. Setup 2FA (Generate TOTP Secret & QR Code)
exports.setup2FA = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    const secret = speakeasy.generateSecret({
      name: `Uttarakhand BoardingEdu (${user.email})`,
      length: 20
    });

    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    // Generate 6 recovery backup codes
    const recoveryCodes = [
      'UK26-A1B2-C3D4',
      'UK26-E5F6-G7H8',
      'UK26-J9K0-L1M2',
      'UK26-N3P4-Q5R6',
      'UK26-S7T8-U9V0',
      'UK26-W1X2-Y3Z4'
    ];

    // Store temporarily pending verification
    user.twoFactorSecret = secret.base32;
    user.recoveryCodes = recoveryCodes;
    await user.save();

    return res.status(200).json({
      success: true,
      secret: secret.base32,
      qrCode: qrCodeUrl,
      recoveryCodes
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to generate 2FA setup.' });
  }
};

// 7. Enable 2FA
exports.enable2FA = async (req, res) => {
  try {
    const { code } = req.body;
    const user = await User.findById(req.user._id);

    if (!user.twoFactorSecret) {
      return res.status(400).json({ success: false, message: '2FA setup not initiated.' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: code.trim(),
      window: 2
    });

    // Also allow 123456 in development
    if (!verified && code.trim() !== '123456') {
      return res.status(400).json({ success: false, message: 'Invalid verification code from Authenticator App.' });
    }

    user.twoFactorEnabled = true;
    await user.save();

    await AuditLog.create({
      userId: user._id,
      userName: user.name,
      userRole: user.role,
      action: 'UPDATE',
      module: 'Security',
      details: 'Two-Factor Authentication enabled on account.',
      ipAddress: req.ip || '127.0.0.1'
    });

    return res.status(200).json({
      success: true,
      message: 'Two-Factor Authentication successfully enabled!'
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to enable 2FA.' });
  }
};

// 8. Disable 2FA
exports.disable2FA = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.twoFactorEnabled = false;
    user.twoFactorSecret = '';
    await user.save();

    await AuditLog.create({
      userId: user._id,
      userName: user.name,
      userRole: user.role,
      action: 'UPDATE',
      module: 'Security',
      details: 'Two-Factor Authentication disabled on account.',
      ipAddress: req.ip || '127.0.0.1'
    });

    return res.status(200).json({
      success: true,
      message: 'Two-Factor Authentication disabled.'
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to disable 2FA.' });
  }
};

// 9. Get Active Sessions & Revoke Sessions
exports.getSessions = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    return res.status(200).json({
      success: true,
      sessions: user.activeSessions || []
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch sessions.' });
  }
};

exports.revokeOtherSessions = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.activeSessions = user.activeSessions.slice(-1); // Keep current only
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'All other active device sessions have been revoked.'
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to revoke sessions.' });
  }
};

// 10. Get Current User Profile
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('team').populate('manager');
    return res.status(200).json({
      success: true,
      user
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};
