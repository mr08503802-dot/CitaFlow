const prisma = require('../config/prisma');
const whatsappService = require('./whatsapp.service');
const { getBaseUrl } = require('../config/url');

class ReminderService {
  constructor() {
    this.baseUrl = getBaseUrl();
  }

  /**
   * Format friendly date and time in Spanish
   */
  formatDateTime(dateObj) {
    const d = new Date(dateObj);
    const dateFormatted = d.toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const timeFormatted = d.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return { dateFormatted, timeFormatted };
  }

  /**
   * Generates URLs for single-click magic actions
   */
  getMagicLinks(token) {
    return {
      confirmUrl: `${this.baseUrl}/confirm/${token}`,
      cancelUrl: `${this.baseUrl}/cancel/${token}`,
    };
  }

  /**
   * Builds the formatted WhatsApp confirmation message and direct link
   */
  buildWhatsAppConfirmationMessage(appointment) {
    const { dateFormatted, timeFormatted } = this.formatDateTime(appointment.start_time);
    const { confirmUrl } = this.getMagicLinks(appointment.confirmation_token);
    const businessName = appointment.business?.name || 'Nuestro negocio';
    const serviceName = appointment.service?.name || 'Servicio';
    const staffName = appointment.staff?.name || 'Especialista';
    const address = appointment.business?.address ? `📍 *Ubicación:* ${appointment.business.address}\n` : '';

    const text = 
`👋 ¡Hola *${appointment.client_name}*!

Tu cita en *${businessName}* ha sido registrada con éxito:

💈 *Servicio:* ${serviceName}
✂️ *Especialista:* ${staffName}
📅 *Fecha:* ${dateFormatted}
⏰ *Hora:* ${timeFormatted}
${address}
👉 *Confirma tu asistencia con 1 solo clic aquí:*
${confirmUrl}

¡Te esperamos! Si necesitas reagendar, responde a este mensaje.`;

    // Normalize phone number (strip non-digits, ensure country code)
    let cleanPhone = (appointment.client_phone || '').replace(/\D/g, '');
    const waLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;

    return { text, waLink };
  }

  /**
   * Builds 24-hour reminder message with magic confirmation & cancellation links
   */
  buildWhatsAppReminderMessage(appointment) {
    const { dateFormatted, timeFormatted } = this.formatDateTime(appointment.start_time);
    const { confirmUrl, cancelUrl } = this.getMagicLinks(appointment.confirmation_token);
    const businessName = appointment.business?.name || 'Nuestro negocio';
    const serviceName = appointment.service?.name || 'Servicio';
    const staffName = appointment.staff?.name || 'Especialista';

    const text = 
`⏰ *Recordatorio de Cita en ${businessName}*

Hola *${appointment.client_name}*, te recordamos tu cita programada:
📅 *Fecha:* ${dateFormatted}
⏰ *Hora:* ${timeFormatted}
💈 *Servicio:* ${serviceName} con *${staffName}*

Para asegurarnos de no perder tu espacio, por favor selecciona una opción:

✅ *Confirmar Asistencia (1 clic):*
${confirmUrl}

❌ *No podré asistir (liberar horario):*
${cancelUrl}

¡Gracias por tu puntualidad!`;

    let cleanPhone = (appointment.client_phone || '').replace(/\D/g, '');
    const waLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;

    return { text, waLink };
  }

  /**
   * Process 24-hour reminders automatically
   */
  async process24hReminders() {
    const now = new Date();
    // Look for appointments happening in the next 20 to 28 hours (centered around 24 hours)
    const windowStart = new Date(now.getTime() + 20 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 28 * 60 * 60 * 1000);

    const pendingAppointments = await prisma.appointment.findMany({
      where: {
        status: 'PENDING',
        reminder_sent_at: null,
        start_time: {
          gte: windowStart,
          lte: windowEnd,
        },
      },
      include: {
        business: true,
        service: true,
        staff: true,
      },
    });

    const results = [];

    for (const apt of pendingAppointments) {
      const reminder = this.buildWhatsAppReminderMessage(apt);
      
      // Mark reminder as sent
      await prisma.appointment.update({
        where: { id: apt.id },
        data: { reminder_sent_at: new Date() },
      });

      // Dispatch directly via configured WhatsApp provider (Meta Cloud API / Twilio / Mock)
      await whatsappService.send24hReminder(apt);

      console.log(`[Auto-Reminder] Dispatched 24h reminder for Appointment ID ${apt.id} (${apt.client_name})`);

      results.push({
        appointmentId: apt.id,
        clientName: apt.client_name,
        clientPhone: apt.client_phone,
        clientEmail: apt.client_email,
        startTime: apt.start_time,
        reminderMessage: reminder.text,
        waLink: reminder.waLink,
      });
    }

    return {
      processedCount: results.length,
      reminders: results,
    };
  }

  /**
   * Manually trigger/send reminder for an appointment from Admin Dashboard
   */
  async sendManualReminder(appointmentId, businessId) {
    const apt = await prisma.appointment.findFirst({
      where: { id: appointmentId, business_id: businessId },
      include: { business: true, service: true, staff: true },
    });

    if (!apt) {
      const error = new Error('Cita no encontrada.');
      error.statusCode = 404;
      throw error;
    }

    const reminder = this.buildWhatsAppReminderMessage(apt);

    // Update reminder_sent_at timestamp
    await prisma.appointment.update({
      where: { id: apt.id },
      data: { reminder_sent_at: new Date() },
    });

    // Dispatch directly via WhatsApp provider
    await whatsappService.send24hReminder(apt);

    return {
      success: true,
      appointment: apt,
      reminderMessage: reminder.text,
      waLink: reminder.waLink,
    };
  }
}

module.exports = new ReminderService();
