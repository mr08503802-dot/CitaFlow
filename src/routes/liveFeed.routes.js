const express = require('express');
const { liveFeedController } = require('../controllers/liveFeed.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(authenticateToken);

// Real-time SSE Stream
router.get('/stream', (req, res) => liveFeedController.stream(req, res));

// History across all dates (no date filtering required)
router.get('/history', (req, res, next) => liveFeedController.getHistory(req, res, next));

// Instant simulation trigger for testing
router.post('/simulate', (req, res, next) => liveFeedController.simulateBooking(req, res, next));

module.exports = router;
