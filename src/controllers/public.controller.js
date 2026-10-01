const { z } = require('zod');
const prisma = require('../config/prisma');
const bookingService = require('../services/booking.service');
const reminderService = require('../services/reminder.service');
const whatsappService = require('../services/whatsapp.service');

const getSlotsQuerySchema = z.object({
  serviceId: z.string().min(1, 'El ID de servicio es obligatorio'),
  staffId: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD'),
});

const bookSchema = z.object({
  serviceId: z.string().min(1, 'El ID de servicio es obligatorio'),
  staffId: z.string().optional(),
  clientName: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  clientPhone: z.string().min(6, 'Número de WhatsApp/teléfono inválido'),
  clientEmail: z.string().email('Correo electrónico inválido'),
  startTime: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T/)),
  notes: z.string().optional(),
});

class PublicController {
  /**
   * Retrieves business public profile, services, and staff
   */
  async getBusinessProfile(req, res, next) {
    try {
      const { slug } = req.params;

      const business = await prisma.business.findUnique({
        where: { slug },
        select: {
          id: true,
          name: true,
          slug: true,
          phone: true,
          address: true,
          currency: true,
          services: {
            select: {
              id: true,
              name: true,
              description: true,
              duration_minutes: true,
              price: true,
            },
            orderBy: { price: 'asc' },
          },
          staff: {
            select: {
              id: true,
              name: true,
              avatar_url: true,
            },
          },
        },
      });

      if (!business) {
        return res.status(404).json({
          success: false,
          message: 'El negocio especificado no existe.',
        });
      }

      res.status(200).json({
        success: true,
        data: business,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Calculates available time slots for booking
   */
  async getSlots(req, res, next) {
    try {
      const { slug } = req.params;
      const { serviceId, staffId, date } = req.query;

      const business = await prisma.business.findUnique({
        where: { slug },
        select: { id: true },
      });

      if (!business) {
        return res.status(404).json({
          success: false,
          message: 'Negocio no encontrado.',
        });
      }

      const availableSlots = await bookingService.getAvailableSlots({
        businessId: business.id,
        serviceId,
        staffId,
        dateStr: date,
      });

      res.status(200).json({
        success: true,
        data: availableSlots,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Creates client booking and returns confirmation payload
   */
  async createBooking(req, res, next) {
    try {
      const { slug } = req.params;
      const { serviceId, staffId, clientName, clientPhone, clientEmail, startTime, notes } = req.body;

      const business = await prisma.business.findUnique({
        where: { slug },
      });

      if (!business) {
        return res.status(404).json({
          success: false,
          message: 'Negocio no encontrado.',
        });
      }

      const appointment = await bookingService.createAppointment({
        businessId: business.id,
        serviceId,
        staffId,
        clientName,
        clientPhone,
        clientEmail,
        startTimeIso: startTime,
        notes,
      });

      // Generate WhatsApp share link & message
      const whatsapp = reminderService.buildWhatsAppConfirmationMessage(appointment);
      const magicLinks = reminderService.getMagicLinks(appointment.confirmation_token);

      // Automated dispatch via configured provider (Meta Cloud API / Twilio / Mock)
      await whatsappService.sendInstantConfirmation(appointment);

      res.status(201).json({
        success: true,
        message: '¡Cita reservada con éxito!',
        data: {
          appointment: {
            id: appointment.id,
            clientName: appointment.client_name,
            clientPhone: appointment.client_phone,
            clientEmail: appointment.client_email,
            startTime: appointment.start_time,
            endTime: appointment.end_time,
            status: appointment.status,
            serviceName: appointment.service.name,
            servicePrice: appointment.service.price,
            staffName: appointment.staff.name,
            confirmationToken: appointment.confirmation_token,
          },
          whatsappUrl: whatsapp.waLink,
          whatsappText: whatsapp.text,
          magicLinks,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Retrieves appointment details by magic token (for client self-service page)
   */
  async getByMagicToken(req, res, next) {
    try {
      const { token } = req.params;
      const appointment = await prisma.appointment.findUnique({
        where: { confirmation_token: token },
        include: {
          business: { select: { name: true, phone: true, address: true, currency: true } },
          service: true,
          staff: { select: { name: true, avatar_url: true } },
        },
      });

      if (!appointment) {
        return res.status(404).json({
          success: false,
          message: 'Enlace no válido o cita no encontrada.',
        });
      }

      res.status(200).json({
        success: true,
        data: appointment,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 1-Click Client Magic Confirmation
   */
  async confirmAttendance(req, res, next) {
    try {
      const { token } = req.params;
      const updated = await bookingService.confirmByToken(token);

      res.status(200).json({
        success: true,
        message: '¡Asistencia confirmada con éxito! Te esperamos.',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 1-Click Client Magic Cancellation
   */
  async cancelAppointment(req, res, next) {
    try {
      const { token } = req.params;
      const { reason } = req.body || {};
      const updated = await bookingService.cancelByToken(token, reason);

      res.status(200).json({
        success: true,
        message: 'Tu cita ha sido cancelada exitosamente.',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = {
  publicController: new PublicController(),
  getSlotsQuerySchema,
  bookSchema,
};
