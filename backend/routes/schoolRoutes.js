const express = require('express');
const router = express.Router();
const schoolController = require('../controllers/schoolController');
const { verifyToken } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/rbac');

router.use(verifyToken);

router.get('/', schoolController.getSchools);
router.post('/', authorizeRoles('admin'), schoolController.createSchool);
router.put('/:id', authorizeRoles('admin'), schoolController.updateSchool);
router.delete('/:id', authorizeRoles('admin'), schoolController.deleteSchool);

module.exports = router;
