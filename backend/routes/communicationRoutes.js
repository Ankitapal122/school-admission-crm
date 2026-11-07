const express = require('express');
const router = express.Router();
const communicationController = require('../controllers/communicationController');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

router.get('/logs', communicationController.getLogs);
router.post('/whatsapp/send', communicationController.sendWhatsApp);
router.post('/email/send', communicationController.sendEmail);

module.exports = router;
