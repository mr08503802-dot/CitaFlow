const googleCalendarService = require('../services/googleCalendar.service');
const prisma = require('../config/prisma');

class CalendarController {
  /**
   * Retrieves 1-click Google Calendar URL and ICS links for an appointment
   */
  async getLinks(req, res, next) {
    try {
      const { appointmentId } = req.params;
      const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: { service: true, staff: true, business: true },
      });

      if (!appointment) {
        return res.status(404).json({ success: false, message: 'Cita no encontrada' });
      }

      const googleCalendarUrl = googleCalendarService.generateGoogleCalendarUrl(appointment);
      const icsDownloadUrl = `/api/calendar/appointment/${appointment.id}/download.ics`;

      res.status(200).json({
        success: true,
        data: {
          googleCalendarUrl,
          icsDownloadUrl,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Downloads single appointment as standard RFC-5545 .ics file
   */
  async downloadIcs(req, res, next) {
    try {
      const { appointmentId } = req.params;
      const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: { service: true, staff: true, business: true },
      });

      if (!appointment) {
        return res.status(404).send('Cita no encontrada');
      }

      const icsContent = googleCalendarService.generateIcsFile(appointment);

      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="cita-${appointment.id.slice(-6)}.ics"`);
      res.send(icsContent);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Live Subscription Calendar Feed (.ics) for entire business or specific specialist
   */
  async getLiveFeed(req, res, next) {
    try {
      const { businessSlug, staffId } = req.params;
      const icsContent = await googleCalendarService.generateSubscriptionFeed({
        businessSlug,
        staffId,
      });

      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(icsContent);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = {
  calendarController: new CalendarController(),
};
