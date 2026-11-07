const express = require('express');
const router = express.Router();
const followUpController = require('../controllers/followUpController');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

router.get('/', followUpController.getFollowUps);
router.post('/log', followUpController.logFollowUp);

module.exports = router;
