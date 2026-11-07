const express = require('express');
const router = express.Router();
const teamController = require('../controllers/teamController');
const { verifyToken } = require('../middleware/auth');
const { authorizeRoles } = require('../middleware/rbac');

router.use(verifyToken);

router.get('/', authorizeRoles('admin', 'manager'), teamController.getAllTeams);
router.post('/', authorizeRoles('admin'), teamController.createTeam);
router.put('/:id', authorizeRoles('admin'), teamController.updateTeam);
router.patch('/:id/status', authorizeRoles('admin'), teamController.toggleTeamStatus);

module.exports = router;
