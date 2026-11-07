const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken } = require('../middleware/auth');

router.post('/login', authController.login);
router.post('/verify-2fa', authController.verify2FA);
router.post('/forgot-password', authController.forgotPassword);
router.post('/verify-otp', authController.verifyResetOTP);
router.post('/reset-password', authController.resetPassword);

// Protected Auth Routes
router.get('/me', verifyToken, authController.getMe);
router.get('/setup-2fa', verifyToken, authController.setup2FA);
router.post('/enable-2fa', verifyToken, authController.enable2FA);
router.post('/disable-2fa', verifyToken, authController.disable2FA);
router.get('/sessions', verifyToken, authController.getSessions);
router.post('/revoke-sessions', verifyToken, authController.revokeOtherSessions);

module.exports = router;
