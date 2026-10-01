const express = require('express');
const { reminderController } = require('../controllers/reminder.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(authenticateToken);

// Trigger automated scan on demand
router.post('/trigger-cron', reminderController.triggerCron);

// Trigger manual reminder for single appointment
router.post('/send/:appointmentId', reminderController.sendManual);

module.exports = router;
