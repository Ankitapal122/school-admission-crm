const express = require('express');
const router = express.Router();
const leadController = require('../controllers/leadController');
const { verifyToken } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/rbac');

router.use(verifyToken);

router.get('/', leadController.getLeads);
router.post('/check-duplicate', leadController.checkDuplicate);
router.post('/', leadController.createLead);
router.patch('/:id/verify', authorizeRoles('admin', 'manager'), leadController.verifyLead);
router.patch('/:id/reassign', authorizeRoles('admin', 'manager'), leadController.reassignLead);
router.post('/:id/remarks', leadController.addRemark);

module.exports = router;
