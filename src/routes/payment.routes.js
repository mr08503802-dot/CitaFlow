const express = require('express');
const { paymentController } = require('../controllers/payment.controller');

const router = express.Router();

// Create checkout session (Client/Admin)
router.post('/create-session', paymentController.createSession);

// Instant payment simulation for local development / testing
router.post('/simulate-success', paymentController.simulateSuccess);

// Payment webhooks
router.post('/webhook/stripe', paymentController.handleStripeWebhook);
router.post('/webhook/mercadopago', paymentController.handleMercadoPagoWebhook);

module.exports = router;
