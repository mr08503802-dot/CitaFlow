const prisma = require('../config/prisma');
const realtimeService = require('./realtime.service');

/**
 * Enterprise-grade WhatsApp Service supporting:
 * 1. Meta WhatsApp Cloud API (Graph API)
 * 2. Twilio Programmable Messaging API
 * 3. Mock/Development Engine with simulation logging and interactive webhook simulation
 */
class WhatsAppService {
  constructor() {
    this.provider = process.env.WHATSAPP_PROVIDER || 'mock'; // 'cloud_api' | 'twilio' | 'mock'
    
    // Meta Cloud API credentials
    this.metaPhoneNumberId = process.env.META_WA_PHONE_NUMBER_ID || '';
    this.metaAccessToken = process.env.META_WA_ACCESS_TOKEN || '';
    this.metaApiVersion = process.env.META_WA_API_VERSION || 'v21.0';

    // Twilio credentials
    this.twilioAccountSid = process.env.TWILIO_ACCOUNT_SID || '';
    this.twilioAuthToken = process.env.TWILIO_AUTH_TOKEN || '';
    this.twilioFromNumber = process.env.TWILIO_WHATSAPP_NUMBER || '';
    const { getBaseUrl } = require('../config/url');
    this.baseUrl = getBaseUrl();

    // In-memory dispatch audit log (persists recent sent messages for dashboard visibility)
    this.dispatchLog = [];
  }

  /**
   * Cleans and formats phone number for international WhatsApp delivery (E.164)
   */
  normalizePhoneNumber(phone) {
    if (!phone) return '';
    let digits = phone.replace(/\D/g, '');
    // If local Spanish 9-digit number without country code, prepend 34
    if (digits.length === 9 && (digits.startsWith('6') || digits.startsWith('7'))) {
      digits = '34' + digits;
    }
    return digits;
  }

  /**
   * Main dispatch method - routes to configured provider
   */
  async sendMessage({ to, text, interactiveButtons = null, appointmentId = null }) {
    const cleanPhone = this.normalizePhoneNumber(to);
    const logEntry = {
      id: `wa_msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      to: cleanPhone,
      text,
      hasButtons: Boolean(interactiveButtons),
      appointmentId,
      provider: this.provider,
      sentAt: new Date().toISOString(),
      status: 'DELIVERED',
    };

    if (this.provider === 'cloud_api' && this.metaAccessToken && this.metaPhoneNumberId) {
      await this.sendMetaCloudApiMessage(cleanPhone, text, interactiveButtons);
    } else if (this.provider === 'twilio' && this.twilioAccountSid && this.twilioAuthToken) {
      await this.sendTwilioMessage(cleanPhone, text);
    } else {
      // Mock / Simulation mode (Logs cleanly and registers in audit log)
      console.log(`\n======================================================`);
      console.log(`📱 [WhatsApp Mock Dispatch] To: +${cleanPhone}`);
      console.log(`💬 Message:\n${text}`);
      if (interactiveButtons) {
        console.log(`🔘 Interactive Buttons:`, interactiveButtons.map(b => `[${b.title}]`).join(' '));
      }
      console.log(`======================================================\n`);
    }

    this.dispatchLog.unshift(logEntry);
    if (this.dispatchLog.length > 50) this.dispatchLog.pop(); // keep last 50

    return {
      success: true,
      messageId: logEntry.id,
      provider: this.provider,
      recipient: cleanPhone,
    };
  }

  /**
   * Meta WhatsApp Cloud API (Graph API) Dispatcher
   */
  async sendMetaCloudApiMessage(to, text, interactiveButtons) {
    const url = `https://graph.facebook.com/${this.metaApiVersion}/${this.metaPhoneNumberId}/messages`;

    let payload;
    if (interactiveButtons && interactiveButtons.length > 0) {
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text },
          action: {
            buttons: interactiveButtons.slice(0, 3).map(btn => ({
              type: 'reply',
              reply: {
                id: btn.id,
                title: btn.title.substring(0, 20), // Meta button limit is 20 chars
              },
            })),
          },
        },
      };
    } else {
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: true, body: text },
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.metaAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('[Meta Cloud API Error]:', data);
      throw new Error(data.error?.message || 'Error enviando mensaje con Meta WhatsApp Cloud API');
    }

    return data;
  }

  /**
   * Twilio Programmable Messaging Dispatcher
   */
  async sendTwilioMessage(to, text) {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.twilioAccountSid}/Messages.json`;
    const from = this.twilioFromNumber.startsWith('whatsapp:') 
      ? this.twilioFromNumber 
      : `whatsapp:${this.twilioFromNumber}`;

    const body = new URLSearchParams({
      From: from,
      To: `whatsapp:+${to}`,
      Body: text,
    });

    const auth = Buffer.from(`${this.twilioAccountSid}:${this.twilioAuthToken}`).toString('base64');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('[Twilio WhatsApp Error]:', data);
      throw new Error(data.message || 'Error enviando mensaje vía Twilio');
    }

    return data;
  }

  /**
   * Sends instant booking confirmation with interactive buttons
   */
  async sendInstantConfirmation(appointment) {
    const d = new Date(appointment.start_time);
    const dateFormatted = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    const timeFormatted = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
    const confirmUrl = `${this.baseUrl}/confirm/${appointment.confirmation_token}`;
    const businessName = appointment.business?.name || 'Nuestro negocio';
    const serviceName = appointment.service?.name || 'Servicio';
    const staffName = appointment.staff?.name || 'Especialista';

    const text = 
`👋 ¡Hola *${appointment.client_name}*!

Tu cita en *${businessName}* fue registrada con éxito:
💈 *Servicio:* ${serviceName}
✂️ *Especialista:* ${staffName}
📅 *Fecha:* ${dateFormatted}
⏰ *Hora:* ${timeFormatted}

Por favor confirma tu turno tocando el botón de abajo o ingresando al enlace:
👉 ${confirmUrl}`;

    const buttons = [
      { id: `CONFIRM_${appointment.id}`, title: '✅ Confirmar Turno' },
      { id: `CANCEL_${appointment.id}`, title: '❌ Cancelar Turno' },
    ];

    return this.sendMessage({
      to: appointment.client_phone,
      text,
      interactiveButtons: buttons,
      appointmentId: appointment.id,
    });
  }

  /**
   * Sends 24-hour reminder with interactive confirmation/cancellation buttons
   */
  async send24hReminder(appointment) {
    const d = new Date(appointment.start_time);
    const dateFormatted = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    const timeFormatted = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
    const confirmUrl = `${this.baseUrl}/confirm/${appointment.confirmation_token}`;
    const cancelUrl = `${this.baseUrl}/cancel/${appointment.confirmation_token}`;
    const businessName = appointment.business?.name || 'Nuestro negocio';
    const serviceName = appointment.service?.name || 'Servicio';
    const staffName = appointment.staff?.name || 'Especialista';

    const text = 
`⏰ *Recordatorio de Cita en ${businessName}*

Hola *${appointment.client_name}*, te recordamos tu cita programada para mañana:
📅 *Fecha:* ${dateFormatted}
⏰ *Hora:* ${timeFormatted}
💈 *Servicio:* ${serviceName} con *${staffName}*

Para evitar cancelaciones y asegurar tu espacio, confirma tu asistencia tocando abajo:
👉 Confirmar: ${confirmUrl}
👉 Cancelar: ${cancelUrl}`;

    const buttons = [
      { id: `CONFIRM_${appointment.id}`, title: '✅ Sí, Asistiré' },
      { id: `CANCEL_${appointment.id}`, title: '❌ No Podré Asistir' },
    ];

    return this.sendMessage({
      to: appointment.client_phone,
      text,
      interactiveButtons: buttons,
      appointmentId: appointment.id,
    });
  }

  /**
   * Webhook Processor: Handles incoming button clicks and messages from Meta/Twilio
   */
  async handleIncomingWebhook(body) {
    console.log('[WhatsApp Webhook Received]:', JSON.stringify(body, null, 2));

    let senderPhone = null;
    let buttonPayload = null;
    let messageText = null;

    // 1. Parse Meta Cloud API Webhook payload
    if (body.object === 'whatsapp_business_account' && body.entry) {
      for (const entry of body.entry) {
        for (const change of entry.changes || []) {
          const value = change.value;
          if (value && value.messages && value.messages[0]) {
            const msg = value.messages[0];
            senderPhone = msg.from;

            if (msg.type === 'interactive' && msg.interactive?.button_reply) {
              buttonPayload = msg.interactive.button_reply.id;
            } else if (msg.type === 'text') {
              messageText = msg.text.body.trim().toUpperCase();
            }
          }
        }
      }
    } 
    // 2. Parse direct simulation or Twilio payload
    else if (body.ButtonPayload || body.buttonPayload) {
      buttonPayload = body.ButtonPayload || body.buttonPayload;
      senderPhone = body.From || body.from || body.phone;
    } else if (body.Body || body.text) {
      messageText = (body.Body || body.text).trim().toUpperCase();
      senderPhone = body.From || body.from || body.phone;
    }

    if (!buttonPayload && !messageText) {
      return { handled: false, reason: 'No action message found in webhook' };
    }

    // Process button actions: CONFIRM_<aptId> or CANCEL_<aptId>
    let action = null;
    let appointmentId = null;

    if (buttonPayload) {
      if (buttonPayload.startsWith('CONFIRM_')) {
        action = 'CONFIRM';
        appointmentId = buttonPayload.replace('CONFIRM_', '');
      } else if (buttonPayload.startsWith('CANCEL_')) {
        action = 'CANCEL';
        appointmentId = buttonPayload.replace('CANCEL_', '');
      }
    } else if (messageText) {
      if (messageText === '1' || messageText.includes('CONFIRMAR') || messageText.includes('SI')) {
        action = 'CONFIRM';
      } else if (messageText === '2' || messageText.includes('CANCELAR') || messageText.includes('NO')) {
        action = 'CANCEL';
      }

      // If text response without explicit appointmentId, find last pending appointment for senderPhone
      if (senderPhone && !appointmentId) {
        const clean = this.normalizePhoneNumber(senderPhone);
        const apt = await prisma.appointment.findFirst({
          where: {
            client_phone: { contains: clean.slice(-8) },
            status: 'PENDING',
          },
          orderBy: { start_time: 'asc' },
        });
        if (apt) appointmentId = apt.id;
      }
    }

    if (!appointmentId) {
      return { handled: false, reason: 'No matching appointment found for action' };
    }

    // Execute state transition
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { business: true, service: true, staff: true },
    });

    if (!appointment) {
      return { handled: false, reason: 'Appointment not found' };
    }

    if (action === 'CONFIRM') {
      const updated = await prisma.appointment.update({
        where: { id: appointment.id },
        data: { status: 'CONFIRMED' },
        include: { business: true, service: true, staff: true },
      });

      realtimeService.broadcastAppointmentUpdated(updated);

      const replyText = `✅ ¡Excelente, *${appointment.client_name}*! Tu cita de *${appointment.service.name}* en *${appointment.business.name}* ha sido confirmada. Te esperamos con puntualidad.`;
      await this.sendMessage({ to: appointment.client_phone, text: replyText, appointmentId: appointment.id });

      return {
        handled: true,
        action: 'CONFIRMED',
        appointmentId: appointment.id,
        clientName: appointment.client_name,
      };
    } else if (action === 'CANCEL') {
      const updated = await prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          status: 'CANCELLED',
          notes: `${appointment.notes || ''} [Cancelado vía WhatsApp Webhook]`.trim(),
        },
        include: { business: true, service: true, staff: true },
      });

      realtimeService.broadcastAppointmentUpdated(updated);

      const replyText = `❌ Tu cita ha sido cancelada correctamente y el turno ha sido liberado. Agradecemos mucho tu aviso con anticipación. ¡Esperamos verte pronto!`;
      await this.sendMessage({ to: appointment.client_phone, text: replyText, appointmentId: appointment.id });

      return {
        handled: true,
        action: 'CANCELLED',
        appointmentId: appointment.id,
        clientName: appointment.client_name,
      };
    }

    return { handled: false, reason: 'Unknown action' };
  }

  /**
   * Returns current settings and recent dispatch logs
   */
  getStatus() {
    return {
      provider: this.provider,
      metaConfigured: Boolean(this.metaAccessToken && this.metaPhoneNumberId),
      twilioConfigured: Boolean(this.twilioAccountSid && this.twilioAuthToken),
      recentDispatches: this.dispatchLog,
    };
  }
}

module.exports = new WhatsAppService();
