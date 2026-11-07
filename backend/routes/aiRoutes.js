const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

router.post('/score-lead', aiController.scoreLead);
router.post('/recommend-schools', aiController.recommendSchools);
router.post('/generate-message', aiController.generateMessage);

module.exports = router;
