const prisma = require('../config/prisma');
const { getBaseUrl } = require('../config/url');

class GoogleCalendarService {
  /**
   * Format date into UTC iCalendar/Google format: YYYYMMDDTHHMMSSZ
   */
  formatUtcDate(date) {
    const d = new Date(date);
    return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  }

  /**
   * Generates a 1-click Google Calendar Add-to-Calendar Web Link
   */
  generateGoogleCalendarUrl(appointment) {
    const startUtc = this.formatUtcDate(appointment.start_time);
    const endUtc = this.formatUtcDate(appointment.end_time);

    const title = encodeURIComponent(`${appointment.service?.name || 'Cita'} - ${appointment.business?.name || 'CitaFlow'}`);
    const details = encodeURIComponent(
      `💈 Servicio: ${appointment.service?.name || ''}\n` +
      `✂️ Especialista: ${appointment.staff?.name || ''}\n` +
      `👤 Cliente: ${appointment.client_name}\n` +
      `📞 Teléfono: ${appointment.client_phone}\n` +
      `📍 Lugar: ${appointment.business?.address || ''}\n` +
      `🔗 Gestionar cita: ${getBaseUrl()}/confirm/${appointment.confirmation_token}`
    );
    const location = encodeURIComponent(appointment.business?.address || appointment.business?.name || '');

    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startUtc}/${endUtc}&details=${details}&location=${location}`;
  }

  /**
   * Generates RFC-5545 iCalendar (.ics) string for single appointment (Apple / Google / Outlook)
   */
  generateIcsFile(appointment) {
    const startUtc = this.formatUtcDate(appointment.start_time);
    const endUtc = this.formatUtcDate(appointment.end_time);
    const nowUtc = this.formatUtcDate(new Date());
    const uid = `citaflow-${appointment.id}@citaflow.local`;

    const summary = `${appointment.service?.name || 'Cita'} con ${appointment.staff?.name || 'Especialista'}`;
    const location = appointment.business?.address || appointment.business?.name || 'Local CitaFlow';
    const description = `Cita en ${appointment.business?.name || ''} para ${appointment.client_name}. Servicio: ${appointment.service?.name}.`;

    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//CitaFlow Micro-SaaS//ES',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${nowUtc}`,
      `DTSTART:${startUtc}`,
      `DTEND:${endUtc}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      `LOCATION:${location}`,
      'STATUS:CONFIRMED',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:Recordatorio de Cita en CitaFlow',
      'TRIGGER:-PT24H',
      'END:VALARM',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:Cita en 1 hora',
      'TRIGGER:-PT1H',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
  }

  /**
   * Generates dynamic live subscription feed (.ics) for all upcoming appointments of a business or specialist
   */
  async generateSubscriptionFeed({ businessSlug, staffId = null }) {
    const business = await prisma.business.findUnique({
      where: { slug: businessSlug },
      include: { services: true, staff: true },
    });

    if (!business) {
      throw new Error('Negocio no encontrado');
    }

    const where = {
      business_id: business.id,
      status: { not: 'CANCELLED' },
      start_time: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) }, // from 7 days ago onwards
    };

    if (staffId && staffId !== 'all') {
      where.staff_id = staffId;
    }

    const appointments = await prisma.appointment.findMany({
      where,
      include: { service: true, staff: true },
      orderBy: { start_time: 'asc' },
    });

    const nowUtc = this.formatUtcDate(new Date());
    const calName = staffId ? `CitaFlow - ${business.name}` : `CitaFlow Agenda - ${business.name}`;

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//CitaFlow Micro-SaaS//ES',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${calName}`,
      'X-WR-TIMEZONE:UTC',
      'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
      'X-PUBLISHED-TTL:PT15M',
    ];

    for (const apt of appointments) {
      const startUtc = this.formatUtcDate(apt.start_time);
      const endUtc = this.formatUtcDate(apt.end_time);
      const uid = `citaflow-${apt.id}@citaflow.local`;
      const summary = `[${apt.status}] ${apt.client_name} - ${apt.service?.name} (${apt.staff?.name})`;
      const desc = `Cliente: ${apt.client_name}\\nTel: ${apt.client_phone}\\nServicio: ${apt.service?.name}\\nEstado: ${apt.status}\\nNotas: ${apt.notes || 'Ninguna'}`;

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${uid}`);
      lines.push(`DTSTAMP:${nowUtc}`);
      lines.push(`DTSTART:${startUtc}`);
      lines.push(`DTEND:${endUtc}`);
      lines.push(`SUMMARY:${summary}`);
      lines.push(`DESCRIPTION:${desc}`);
      lines.push(`LOCATION:${business.address || business.name}`);
      lines.push(`STATUS:${apt.status === 'CONFIRMED' ? 'CONFIRMED' : 'TENTATIVE'}`);
      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }
}

module.exports = new GoogleCalendarService();
