const express = require('express');
const router = express.Router();
const commissionController = require('../controllers/commissionController');
const { verifyToken } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/rbac');

router.use(verifyToken);

router.get('/', commissionController.getCommissions);
router.patch('/:commissionId/approve', authorizeRoles('admin', 'manager'), commissionController.approveCommission);
router.post('/:commissionId/pay', authorizeRoles('admin'), commissionController.recordPayment);
router.post('/:commissionId/reverse', authorizeRoles('admin', 'manager'), commissionController.reverseCommission);

// Rules
router.get('/rules', commissionController.getCommissionRules);
router.post('/rules', authorizeRoles('admin'), commissionController.updateCommissionRule);

module.exports = router;
