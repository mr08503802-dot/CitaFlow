const express = require('express');
const { webhookController } = require('../controllers/webhook.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');

const router = express.Router();

// Meta Cloud API Verification Handshake
router.get('/whatsapp', webhookController.verify);

// Live Inbound Webhook (Meta Cloud API / Twilio)
router.post('/whatsapp', webhookController.handleIncoming);

// Protected Admin simulation & status inspection
router.post('/simulate', authenticateToken, webhookController.simulate);
router.get('/status', authenticateToken, webhookController.getStatus);

module.exports = router;
