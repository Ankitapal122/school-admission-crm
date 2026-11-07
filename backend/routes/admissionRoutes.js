const express = require('express');
const router = express.Router();
const admissionController = require('../controllers/admissionController');
const { verifyToken } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/rbac');

router.use(verifyToken);

router.get('/', admissionController.getAdmissions);
router.post('/', authorizeRoles('admin', 'manager', 'counsellor'), admissionController.createAdmission);
router.post('/:id/cancel', authorizeRoles('admin', 'manager'), admissionController.cancelAdmission);

module.exports = router;
