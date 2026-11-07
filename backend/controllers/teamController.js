const Team = require('../models/Team');
const User = require('../models/User');
const Lead = require('../models/Lead');
const Admission = require('../models/Admission');
const Commission = require('../models/Commission');
const AuditLog = require('../models/AuditLog');

// Get all teams (Admin or Manager)
exports.getAllTeams = async (req, res) => {
  try {
    let filter = {};
    // If Manager, show their assigned team unless Admin
    if (req.user.role === 'manager') {
      filter = { manager: req.user._id };
    }

    const teams = await Team.find(filter)
      .populate('manager', 'name email employeeId phone')
      .populate('counsellors', 'name email employeeId phone status')
      .sort({ createdAt: -1 });

    // Enhance teams with stats
    const teamsWithStats = await Promise.all(teams.map(async (t) => {
      const totalLeads = await Lead.countDocuments({ teamId: t._id });
      const totalAdmissions = await Admission.countDocuments({ teamId: t._id, admissionStatus: 'Admission Confirmed' });
      const commissions = await Commission.find({ teamId: t._id, status: { $ne: 'Reversed' } });
      const totalCommission = commissions.reduce((sum, c) => sum + c.amount, 0);

      return {
        ...t.toObject(),
        totalLeads,
        totalAdmissions,
        totalCommission
      };
    }));

    return res.status(200).json({ success: true, count: teamsWithStats.length, teams: teamsWithStats });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve teams.' });
  }
};

// Create new team (Admin only)
exports.createTeam = async (req, res) => {
  try {
    const { name, code, description, managerId, counsellorIds, target, monthlyAdmissionTarget } = req.body;

    if (!name || !code || !managerId) {
      return res.status(400).json({ success: false, message: 'Team Name, Code, and Manager are required.' });
    }

    const existingCode = await Team.findOne({ code: code.trim().toUpperCase() });
    if (existingCode) {
      return res.status(400).json({ success: false, message: 'Team with this code already exists.' });
    }

    const teamId = `TEAM-${Date.now().toString().slice(-4)}`;

    const team = await Team.create({
      teamId,
      name,
      code: code.trim().toUpperCase(),
      description: description || '',
      manager: managerId,
      counsellors: counsellorIds || [],
      target: target || 50,
      monthlyAdmissionTarget: monthlyAdmissionTarget || 10,
      status: 'Active',
      history: [{
        action: 'TEAM_CREATED',
        performedBy: req.user.name,
        notes: `Created team ${name} (${code})`
      }]
    });

    // Update manager and counsellors with team ID
    await User.findByIdAndUpdate(managerId, { team: team._id });
    if (counsellorIds && counsellorIds.length > 0) {
      await User.updateMany({ _id: { $in: counsellorIds } }, { team: team._id, manager: managerId });
    }

    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'CREATE',
      module: 'Teams',
      details: `Created team ${name} (${team.code})`,
      isSpecialFlag: false
    });

    return res.status(201).json({
      success: true,
      message: `Team '${name}' created successfully.`,
      team
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to create team.' });
  }
};

// Edit Team / Change Manager / Add or Remove Members
exports.updateTeam = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, managerId, counsellorIds, target, monthlyAdmissionTarget, status } = req.body;

    const team = await Team.findById(id);
    if (!team) return res.status(404).json({ success: false, message: 'Team not found.' });

    if (name) team.name = name;
    if (description !== undefined) team.description = description;
    if (target) team.target = target;
    if (monthlyAdmissionTarget) team.monthlyAdmissionTarget = monthlyAdmissionTarget;
    if (status) team.status = status;

    if (managerId && managerId !== team.manager.toString()) {
      team.history.push({
        action: 'MANAGER_CHANGED',
        performedBy: req.user.name,
        notes: `Manager updated to ${managerId}`
      });
      team.manager = managerId;
      await User.findByIdAndUpdate(managerId, { team: team._id });
    }

    if (counsellorIds) {
      team.counsellors = counsellorIds;
      await User.updateMany({ _id: { $in: counsellorIds } }, { team: team._id, manager: team.manager });
    }

    await team.save();

    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'UPDATE',
      module: 'Teams',
      details: `Updated team ${team.name} (${team.code})`,
      isSpecialFlag: false
    });

    return res.status(200).json({ success: true, message: 'Team updated successfully.', team });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update team.' });
  }
};

// Deactivate team
exports.toggleTeamStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const team = await Team.findById(id);
    if (!team) return res.status(404).json({ success: false, message: 'Team not found.' });

    team.status = team.status === 'Active' ? 'Inactive' : 'Active';
    team.history.push({
      action: 'STATUS_CHANGED',
      performedBy: req.user.name,
      notes: `Team status set to ${team.status}`
    });
    await team.save();

    return res.status(200).json({ success: true, message: `Team is now ${team.status}.`, team });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to toggle team status.' });
  }
};
