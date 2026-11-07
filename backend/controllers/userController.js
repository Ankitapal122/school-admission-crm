const User = require('../models/User');
const Team = require('../models/Team');
const AuditLog = require('../models/AuditLog');

// Get all users (Admin only)
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .populate('team', 'name code')
      .populate('manager', 'name email employeeId')
      .select('-password -twoFactorSecret -recoveryCodes')
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, count: users.length, users });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve users.' });
  }
};

// Create new employee (Admin only)
exports.createUser = async (req, res) => {
  try {
    const { name, email, employeeId, password, role, teamId, managerId, phone } = req.body;

    if (!name || !email || !employeeId || !password || !role) {
      return res.status(400).json({ success: false, message: 'Required fields missing.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = await User.findOne({
      $or: [{ email: cleanEmail }, { employeeId: employeeId.trim().toUpperCase() }]
    });

    if (existing) {
      return res.status(400).json({ success: false, message: 'User with this email or employee ID already exists.' });
    }

    const user = await User.create({
      name,
      email: cleanEmail,
      employeeId: employeeId.trim().toUpperCase(),
      password,
      role,
      team: teamId || null,
      manager: managerId || null,
      phone: phone || '',
      status: 'Active'
    });

    // If assigned to a team, update team's member list
    if (teamId) {
      const team = await Team.findById(teamId);
      if (team) {
        if (role === 'counsellor' && !team.counsellors.includes(user._id)) {
          team.counsellors.push(user._id);
          await team.save();
        } else if (role === 'manager') {
          team.manager = user._id;
          await team.save();
        }
      }
    }

    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'CREATE',
      module: 'Users',
      details: `Created new ${role.toUpperCase()} user ${name} (${employeeId})`,
      isSpecialFlag: false
    });

    return res.status(201).json({
      success: true,
      message: `User ${name} successfully created with role ${role}.`,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        employeeId: user.employeeId,
        role: user.role,
        status: user.status
      }
    });
  } catch (error) {
    console.error('Create user error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to create user.' });
  }
};

// Update user status (Activate / Suspend)
exports.toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);

    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    user.status = user.status === 'Active' ? 'Suspended' : 'Active';
    // If suspended, revoke active sessions immediately
    if (user.status === 'Suspended') {
      user.activeSessions = [];
    }
    await user.save();

    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'UPDATE',
      module: 'Users',
      details: `Changed user ${user.name} (${user.employeeId}) status to ${user.status}`,
      isSpecialFlag: user.status === 'Suspended'
    });

    return res.status(200).json({
      success: true,
      message: `User ${user.name} is now ${user.status}.`,
      user
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update user status.' });
  }
};

// Reset employee password by Admin
exports.adminResetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long.' });
    }

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    user.password = newPassword;
    user.activeSessions = []; // force re-login
    await user.save();

    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'UPDATE',
      module: 'Users',
      details: `Admin reset password for ${user.name} (${user.employeeId})`,
      isSpecialFlag: true
    });

    return res.status(200).json({
      success: true,
      message: `Password for ${user.name} reset successfully. Active sessions revoked.`
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to reset employee password.' });
  }
};
