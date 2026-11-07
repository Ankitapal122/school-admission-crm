const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { verifyToken } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/rbac');

router.use(verifyToken);

router.get('/', authorizeRoles('admin'), userController.getAllUsers);
router.post('/', authorizeRoles('admin'), userController.createUser);
router.patch('/:id/status', authorizeRoles('admin'), userController.toggleUserStatus);
router.post('/:id/reset-password', authorizeRoles('admin'), userController.adminResetPassword);

module.exports = router;
