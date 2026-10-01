const express = require('express');
const { calendarController } = require('../controllers/calendar.controller');

const router = express.Router();

// 1-Click calendar links for an appointment
router.get('/appointment/:appointmentId/links', calendarController.getLinks);

// Download single appointment .ics file
router.get('/appointment/:appointmentId/download.ics', calendarController.downloadIcs);

// Live iCalendar Subscription Feeds (Sync with Google Calendar / Apple Calendar app)
router.get('/feed/:businessSlug.ics', calendarController.getLiveFeed);
router.get('/feed/:businessSlug/staff/:staffId.ics', calendarController.getLiveFeed);

module.exports = router;
