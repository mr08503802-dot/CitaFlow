const whatsappService = require('../services/whatsapp.service');

const VERIFY_TOKEN = process.env.META_WA_VERIFY_TOKEN || 'citaflow_meta_verify_token_2026';

class WebhookController {
  /**
   * Meta WhatsApp Webhook Verification Handshake (GET /api/webhook/whatsapp)
   */
  verify(req, res) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
      if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('✅ [Meta Webhook Verified] Successfully subscribed to WhatsApp Cloud API events.');
        return res.status(200).send(challenge);
      }
      return res.status(403).send('Verification token mismatch');
    }

    res.status(400).send('Invalid verification request');
  }

  /**
   * Meta / Twilio Webhook Event Handler (POST /api/webhook/whatsapp)
   */
  async handleIncoming(req, res, next) {
    try {
      // Respond 200 immediately to prevent Meta timeout
      res.status(200).json({ status: 'EVENT_RECEIVED' });

      // Process asynchronously
      await whatsappService.handleIncomingWebhook(req.body);
    } catch (error) {
      console.error('[Webhook Processing Error]:', error);
      // Already sent 200 to caller
    }
  }

  /**
   * Interactive Simulator endpoint for local testing directly from dashboard
   */
  async simulate(req, res, next) {
    try {
      const { buttonPayload, phone, text } = req.body;
      const result = await whatsappService.handleIncomingWebhook({
        buttonPayload,
        phone,
        text,
      });

      res.status(200).json({
        success: true,
        message: 'Evento de WhatsApp simulado correctamente.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get WhatsApp engine status and recent dispatch log
   */
  getStatus(req, res) {
    res.status(200).json({
      success: true,
      data: whatsappService.getStatus(),
    });
  }
}

module.exports = {
  webhookController: new WebhookController(),
};
