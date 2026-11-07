const School = require('../models/School');
const AuditLog = require('../models/AuditLog');

// Get all schools
exports.getSchools = async (req, res) => {
  try {
    const { board, genderType, city, minFee, maxFee, search } = req.query;
    let query = { deletedAt: null };

    if (board) query.board = board;
    if (genderType) query.genderType = genderType;
    if (city) query.city = new RegExp(city, 'i');
    if (search) {
      query.$or = [
        { name: new RegExp(search, 'i') },
        { city: new RegExp(search, 'i') },
        { board: new RegExp(search, 'i') }
      ];
    }

    const schools = await School.find(query).sort({ rank: 1 });
    return res.status(200).json({ success: true, count: schools.length, schools });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve schools.' });
  }
};

// Create School (Admin only)
exports.createSchool = async (req, res) => {
  try {
    const { name, board, genderType, city, state, rank, annualFeesMin, annualFeesMax, feesDisplay, defaultCommission, sports, description } = req.body;

    const count = await School.countDocuments();
    const schoolId = `UK-SCH-${String(count + 1).padStart(3, '0')}`;

    const school = await School.create({
      schoolId,
      name,
      board: board || 'CBSE',
      genderType: genderType || 'co_ed',
      city: city || 'Dehradun',
      state: state || 'Uttarakhand',
      rank: rank || count + 1,
      annualFeesMin: parseFloat(annualFeesMin),
      annualFeesMax: parseFloat(annualFeesMax),
      feesDisplay: feesDisplay || `₹${annualFeesMin/100000}L - ₹${annualFeesMax/100000}L`,
      defaultCommission: parseFloat(defaultCommission || 30000),
      sports: sports || ['Cricket', 'Swimming', 'Football'],
      description: description || ''
    });

    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'CREATE',
      module: 'Schools',
      details: `Added school ${school.name} (${school.schoolId})`,
      isSpecialFlag: false
    });

    return res.status(201).json({ success: true, message: `School ${name} added successfully.`, school });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to add school.' });
  }
};

// Update School
exports.updateSchool = async (req, res) => {
  try {
    const { id } = req.params;
    const school = await School.findByIdAndUpdate(id, req.body, { new: true });
    if (!school) return res.status(404).json({ success: false, message: 'School not found.' });

    return res.status(200).json({ success: true, message: 'School updated successfully.', school });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to update school.' });
  }
};

// Soft Delete School
exports.deleteSchool = async (req, res) => {
  try {
    const { id } = req.params;
    const school = await School.findById(id);
    if (!school) return res.status(404).json({ success: false, message: 'School not found.' });

    school.deletedAt = new Date();
    await school.save();

    await AuditLog.create({
      userId: req.user._id,
      userName: req.user.name,
      userRole: req.user.role,
      action: 'DELETE',
      module: 'Schools',
      details: `Soft deleted school ${school.name} (${school.schoolId})`,
      isSpecialFlag: true
    });

    return res.status(200).json({ success: true, message: `School ${school.name} soft deleted.` });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to delete school.' });
  }
};
