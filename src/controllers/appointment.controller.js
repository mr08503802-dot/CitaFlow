const { z } = require('zod');
const crypto = require('crypto');
const prisma = require('../config/prisma');
const realtimeService = require('../services/realtime.service');

const updateStatusSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED']),
});

const walkInSchema = z.object({
  serviceId: z.string().min(1, 'El servicio es requerido'),
  staffId: z.string().min(1, 'El especialista es requerido'),
  clientName: z.string().min(2, 'Nombre de cliente requerido'),
  clientPhone: z.string().min(6, 'Teléfono requerido'),
  clientEmail: z.string().email().optional().or(z.literal('')),
  startTime: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T/)),
  notes: z.string().optional(),
});

class AppointmentController {
  /**
   * Retrieves business appointments with filters (date range, staff, status)
   */
  async list(req, res, next) {
    try {
      const businessId = req.business.id;
      const { date, startDate, endDate, staffId, status } = req.query;

      const where = { business_id: businessId };

      if (date) {
        const start = new Date(`${date}T00:00:00.000Z`);
        const end = new Date(`${date}T23:59:59.999Z`);
        where.start_time = { gte: start, lte: end };
      } else if (startDate && endDate) {
        where.start_time = {
          gte: new Date(startDate),
          lte: new Date(endDate),
        };
      }

      if (staffId && staffId !== 'all') {
        where.staff_id = staffId;
      }

      if (status && status !== 'all') {
        where.status = status;
      }

      const appointments = await prisma.appointment.findMany({
        where,
        include: {
          service: true,
          staff: true,
          receipt: true,
        },
        orderBy: { start_time: 'asc' },
      });

      res.status(200).json({
        success: true,
        data: appointments,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Quick Dashboard KPI summary metrics
   */
  async getDashboardSummary(req, res, next) {
    try {
      const businessId = req.business.id;
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

      // Total today
      const todayAppointments = await prisma.appointment.findMany({
        where: {
          business_id: businessId,
          start_time: { gte: startOfDay, lte: endOfDay },
        },
        include: { receipt: true, service: true },
      });

      // Overall stats
      const totalAppointments = await prisma.appointment.count({
        where: { business_id: businessId },
      });

      const confirmedCount = await prisma.appointment.count({
        where: { business_id: businessId, status: 'CONFIRMED' },
      });

      const pendingCount = await prisma.appointment.count({
        where: { business_id: businessId, status: 'PENDING' },
      });

      const completedCount = await prisma.appointment.count({
        where: { business_id: businessId, status: 'COMPLETED' },
      });

      const cancelledCount = await prisma.appointment.count({
        where: { business_id: businessId, status: 'CANCELLED' },
      });

      // Total revenue from receipts
      const receipts = await prisma.receipt.findMany({
        where: {
          appointment: { business_id: businessId },
          status: 'PAID',
        },
        select: { total_amount: true },
      });

      const totalRevenue = receipts.reduce((sum, r) => sum + r.total_amount, 0);

      // Estimated avoided no-shows (assuming confirmed appointments have a 95% attendance vs 65% industry baseline)
      const confirmedRatio = totalAppointments > 0 ? ((confirmedCount + completedCount) / totalAppointments) * 100 : 0;

      res.status(200).json({
        success: true,
        data: {
          todayCount: todayAppointments.length,
          totalAppointments,
          confirmedCount,
          pendingCount,
          completedCount,
          cancelledCount,
          totalRevenue,
          confirmedRatio: Math.round(confirmedRatio),
          currency: req.business.currency,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update appointment status (e.g. mark as CONFIRMED, COMPLETED, CANCELLED)
   */
  async updateStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const businessId = req.business.id;

      const appointment = await prisma.appointment.findFirst({
        where: { id, business_id: businessId },
      });

      if (!appointment) {
        return res.status(404).json({
          success: false,
          message: 'Cita no encontrada.',
        });
      }

      const updated = await prisma.appointment.update({
        where: { id },
        data: { status },
        include: { service: true, staff: true, receipt: true },
      });

      realtimeService.broadcastAppointmentUpdated(updated);

      res.status(200).json({
        success: true,
        message: `Estado de la cita actualizado a ${status}.`,
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create walk-in or manual appointment from admin calendar
   */
  async createWalkIn(req, res, next) {
    try {
      const businessId = req.business.id;
      const { serviceId, staffId, clientName, clientPhone, clientEmail, startTime, notes } = req.body;

      const service = await prisma.service.findFirst({
        where: { id: serviceId, business_id: businessId },
      });
      if (!service) {
        return res.status(404).json({ success: false, message: 'Servicio no encontrado.' });
      }

      const start = new Date(startTime);
      const end = new Date(start.getTime() + service.duration_minutes * 60000);

      // Check collision
      const collision = await prisma.appointment.findFirst({
        where: {
          staff_id: staffId,
          status: { not: 'CANCELLED' },
          start_time: { lt: end },
          end_time: { gt: start },
        },
      });

      if (collision) {
        return res.status(409).json({
          success: false,
          message: 'Existe un conflicto de horario con otra cita para este especialista.',
        });
      }

      const token = `tok_walkin_${crypto.randomBytes(12).toString('hex')}`;

      const appointment = await prisma.appointment.create({
        data: {
          business_id: businessId,
          service_id: serviceId,
          staff_id: staffId,
          client_name: clientName,
          client_phone: clientPhone,
          client_email: clientEmail || `${clientPhone.replace(/\D/g, '')}@citaflow.local`,
          start_time: start,
          end_time: end,
          status: 'CONFIRMED', // Walk-ins created by admin are confirmed by default
          confirmation_token: token,
          notes: notes || 'Registro directo en recepción / Walk-in',
        },
        include: { service: true, staff: true, business: true },
      });

      realtimeService.broadcastNewAppointment(appointment);

      res.status(201).json({
        success: true,
        message: 'Cita agendada correctamente en la agenda.',
        data: appointment,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = {
  appointmentController: new AppointmentController(),
  updateStatusSchema,
  walkInSchema,
};
