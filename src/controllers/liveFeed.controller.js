const crypto = require('crypto');
const prisma = require('../config/prisma');
const realtimeService = require('../services/realtime.service');

class LiveFeedController {
  /**
   * Server-Sent Events (SSE) Endpoint for real-time live feed
   * GET /api/admin/live/stream
   */
  stream(req, res) {
    const businessId = req.business.id;

    // Set standard SSE response headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable buffering in Nginx/proxies
    });

    // Flush headers immediately
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    // Register with real-time manager
    realtimeService.registerClient(businessId, res);
  }

  /**
   * Returns recent appointment history across all dates (no date filtering required)
   * GET /api/admin/live/history
   */
  async getHistory(req, res, next) {
    try {
      const businessId = req.business.id;
      const limit = parseInt(req.query.limit, 10) || 30;

      const appointments = await prisma.appointment.findMany({
        where: { business_id: businessId },
        include: {
          service: true,
          staff: true,
          receipt: true,
        },
        orderBy: { created_at: 'desc' },
        take: limit,
      });

      res.status(200).json({
        success: true,
        total: appointments.length,
        data: appointments,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Simulates an incoming booking to test the live stream immediately
   * POST /api/admin/live/simulate
   */
  async simulateBooking(req, res, next) {
    try {
      const businessId = req.business.id;

      // Find first service and staff
      const business = await prisma.business.findUnique({
        where: { id: businessId },
        include: { services: true, staff: true },
      });

      if (!business || business.services.length === 0 || business.staff.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'El negocio debe tener al menos un servicio y un especialista configurado.',
        });
      }

      const sampleNames = [
        'Mateo Fernández', 'Sofía Ramírez', 'Lucas Herrera', 'Valentina Silva',
        'Daniel Morales', 'Isabella Castro', 'Gabriel Ortiz', 'Camila Benítez'
      ];
      const randomName = sampleNames[Math.floor(Math.random() * sampleNames.length)];
      const randomPhone = `+34 6${Math.floor(10000000 + Math.random() * 90000000)}`;
      const randomService = business.services[Math.floor(Math.random() * business.services.length)];
      const randomStaff = business.staff[Math.floor(Math.random() * business.staff.length)];

      const futureDate = new Date(Date.now() + (Math.floor(Math.random() * 5) + 1) * 24 * 3600 * 1000);
      futureDate.setHours(10 + Math.floor(Math.random() * 8), (Math.random() > 0.5 ? 0 : 30), 0, 0);
      const endDate = new Date(futureDate.getTime() + randomService.duration_minutes * 60000);

      const token = `tok_sim_${crypto.randomBytes(12).toString('hex')}`;

      const appointment = await prisma.appointment.create({
        data: {
          business_id: businessId,
          service_id: randomService.id,
          staff_id: randomStaff.id,
          client_name: randomName,
          client_phone: randomPhone,
          client_email: `${randomName.toLowerCase().replace(/\s+/g, '.')}@simulated.local`,
          start_time: futureDate,
          end_time: endDate,
          status: 'PENDING',
          confirmation_token: token,
          notes: 'Reserva simulada en tiempo real para verificación de feed',
        },
        include: {
          service: true,
          staff: true,
          business: true,
        },
      });

      // Broadcast live event
      realtimeService.broadcastNewAppointment(appointment);

      res.status(201).json({
        success: true,
        message: 'Reserva simulada creada y transmitida por SSE exitosamente.',
        data: appointment,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = {
  liveFeedController: new LiveFeedController(),
};
