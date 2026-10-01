const crypto = require('crypto');
const prisma = require('../config/prisma');
const realtimeService = require('./realtime.service');

const DAYS_MAP = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

class BookingService {
  /**
   * Computes available booking slots for a business, service, staff and date
   */
  async getAvailableSlots({ businessId, serviceId, staffId, dateStr }) {
    // 1. Fetch Service to get duration
    const service = await prisma.service.findFirst({
      where: { id: serviceId, business_id: businessId },
    });

    if (!service) {
      const error = new Error('Servicio no encontrado.');
      error.statusCode = 404;
      throw error;
    }

    const durationMinutes = service.duration_minutes;

    // 2. Parse target date
    const [year, month, day] = dateStr.split('-').map(Number);
    const targetDate = new Date(year, month - 1, day);
    const dayOfWeek = DAYS_MAP[targetDate.getDay()];

    const startOfDay = new Date(year, month - 1, day, 0, 0, 0);
    const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);

    // 3. Fetch candidate staff members
    let staffList = [];
    if (staffId && staffId !== 'any') {
      const singleStaff = await prisma.staff.findFirst({
        where: { id: staffId, business_id: businessId },
      });
      if (singleStaff) staffList.push(singleStaff);
    } else {
      staffList = await prisma.staff.findMany({
        where: { business_id: businessId },
      });
    }

    if (staffList.length === 0) {
      return [];
    }

    const now = new Date();
    const isToday = now.getFullYear() === year && now.getMonth() === (month - 1) && now.getDate() === day;
    const minLeadTime = new Date(now.getTime() + 15 * 60000); // 15 min buffer for immediate bookings

    const slotMap = new Map(); // timeString -> { time, timestamp, availableStaff: [] }

    // 4. Calculate slots per specialist
    for (const member of staffList) {
      let schedule = {};
      try {
        schedule = typeof member.schedule_json === 'string' 
          ? JSON.parse(member.schedule_json) 
          : (member.schedule_json || {});
      } catch (e) {
        continue;
      }

      const daySchedule = schedule[dayOfWeek];
      if (!daySchedule || !daySchedule.active) {
        continue; // Staff does not work on this day
      }

      const [shiftStartH, shiftStartM] = (daySchedule.start || '09:00').split(':').map(Number);
      const [shiftEndH, shiftEndM] = (daySchedule.end || '19:00').split(':').map(Number);

      const shiftStart = new Date(year, month - 1, day, shiftStartH, shiftStartM, 0);
      const shiftEnd = new Date(year, month - 1, day, shiftEndH, shiftEndM, 0);

      let lunchStart = null;
      let lunchEnd = null;
      if (daySchedule.lunchStart && daySchedule.lunchEnd) {
        const [lStartH, lStartM] = daySchedule.lunchStart.split(':').map(Number);
        const [lEndH, lEndM] = daySchedule.lunchEnd.split(':').map(Number);
        lunchStart = new Date(year, month - 1, day, lStartH, lStartM, 0);
        lunchEnd = new Date(year, month - 1, day, lEndH, lEndM, 0);
      }

      // Fetch existing appointments for this staff member today (excluding cancelled)
      const existingAppointments = await prisma.appointment.findMany({
        where: {
          staff_id: member.id,
          status: { not: 'CANCELLED' },
          start_time: { gte: startOfDay, lte: endOfDay },
        },
      });

      // Generate slots every 30 minutes (or 15 if duration is small)
      const slotStepMinutes = durationMinutes <= 30 ? 15 : 30;
      let currentSlotStart = new Date(shiftStart);

      while (true) {
        const currentSlotEnd = new Date(currentSlotStart.getTime() + durationMinutes * 60000);

        // Break if slot extends beyond working shift
        if (currentSlotEnd > shiftEnd) {
          break;
        }

        // Check if slot is in the past
        if (isToday && currentSlotStart <= minLeadTime) {
          currentSlotStart = new Date(currentSlotStart.getTime() + slotStepMinutes * 60000);
          continue;
        }

        // Check lunch collision
        const collidesWithLunch = lunchStart && lunchEnd && (
          currentSlotStart < lunchEnd && currentSlotEnd > lunchStart
        );

        // Check appointment collisions
        const collidesWithAppointment = existingAppointments.some((apt) => {
          return currentSlotStart < apt.end_time && currentSlotEnd > apt.start_time;
        });

        if (!collidesWithLunch && !collidesWithAppointment) {
          const hours = String(currentSlotStart.getHours()).padStart(2, '0');
          const minutes = String(currentSlotStart.getMinutes()).padStart(2, '0');
          const timeKey = `${hours}:${minutes}`;

          if (!slotMap.has(timeKey)) {
            slotMap.set(timeKey, {
              time: timeKey,
              isoTime: currentSlotStart.toISOString(),
              availableStaff: [],
            });
          }

          slotMap.get(timeKey).availableStaff.push({
            id: member.id,
            name: member.name,
            avatar_url: member.avatar_url,
          });
        }

        currentSlotStart = new Date(currentSlotStart.getTime() + slotStepMinutes * 60000);
      }
    }

    // Convert map to sorted array
    const availableSlots = Array.from(slotMap.values()).sort((a, b) => 
      a.time.localeCompare(b.time)
    );

    return availableSlots;
  }

  /**
   * Creates an appointment and prevents double-booking
   */
  async createAppointment({
    businessId,
    serviceId,
    staffId,
    clientName,
    clientPhone,
    clientEmail,
    startTimeIso,
    notes,
  }) {
    // 1. Verify service
    const service = await prisma.service.findFirst({
      where: { id: serviceId, business_id: businessId },
    });
    if (!service) {
      const error = new Error('El servicio seleccionado no existe.');
      error.statusCode = 404;
      throw error;
    }

    // 2. Select staff if "any" was selected
    let assignedStaffId = staffId;
    const startTime = new Date(startTimeIso);
    const endTime = new Date(startTime.getTime() + service.duration_minutes * 60000);

    if (!assignedStaffId || assignedStaffId === 'any') {
      // Find the first available staff for this time window
      const dateStr = startTime.toISOString().split('T')[0];
      const slots = await this.getAvailableSlots({
        businessId,
        serviceId,
        staffId: 'any',
        dateStr,
      });

      const slot = slots.find(s => new Date(s.isoTime).getTime() === startTime.getTime());
      if (!slot || slot.availableStaff.length === 0) {
        const error = new Error('No hay especialistas disponibles en el horario seleccionado.');
        error.statusCode = 409;
        throw error;
      }
      assignedStaffId = slot.availableStaff[0].id;
    } else {
      // 3. Atomically check double-booking collision for this specialist
      const collision = await prisma.appointment.findFirst({
        where: {
          staff_id: assignedStaffId,
          status: { not: 'CANCELLED' },
          start_time: { lt: endTime },
          end_time: { gt: startTime },
        },
      });

      if (collision) {
        const error = new Error('El horario seleccionado ya ha sido reservado. Por favor selecciona otro.');
        error.statusCode = 409;
        throw error;
      }
    }

    // 4. Generate unique magic confirmation token
    const confirmationToken = `tok_${crypto.randomBytes(16).toString('hex')}`;

    // 5. Create Appointment
    const appointment = await prisma.appointment.create({
      data: {
        business_id: businessId,
        service_id: serviceId,
        staff_id: assignedStaffId,
        client_name: clientName.trim(),
        client_phone: clientPhone.trim(),
        client_email: clientEmail.toLowerCase().trim(),
        start_time: startTime,
        end_time: endTime,
        status: 'PENDING',
        confirmation_token: confirmationToken,
        notes: notes ? notes.trim() : null,
      },
      include: {
        service: true,
        staff: true,
        business: true,
      },
    });

    // Broadcast new appointment to live feed
    realtimeService.broadcastNewAppointment(appointment);

    return appointment;
  }

  /**
   * Magic Link action: Confirm attendance
   */
  async confirmByToken(token) {
    const appointment = await prisma.appointment.findUnique({
      where: { confirmation_token: token },
      include: { service: true, staff: true, business: true },
    });

    if (!appointment) {
      const error = new Error('Token de confirmación inválido o expirado.');
      error.statusCode = 404;
      throw error;
    }

    if (appointment.status === 'CANCELLED') {
      const error = new Error('Esta cita ya había sido cancelada previamente.');
      error.statusCode = 400;
      throw error;
    }

    const updated = await prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: 'CONFIRMED' },
      include: { service: true, staff: true, business: true },
    });

    // Broadcast status update to live feed
    realtimeService.broadcastAppointmentUpdated(updated);

    return updated;
  }

  /**
   * Magic Link action: Cancel appointment
   */
  async cancelByToken(token, reason) {
    const appointment = await prisma.appointment.findUnique({
      where: { confirmation_token: token },
      include: { service: true, staff: true, business: true },
    });

    if (!appointment) {
      const error = new Error('Token de cita no encontrado.');
      error.statusCode = 404;
      throw error;
    }

    const updated = await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        status: 'CANCELLED',
        notes: reason ? `${appointment.notes || ''} [Cancelado por cliente: ${reason}]`.trim() : appointment.notes,
      },
      include: { service: true, staff: true, business: true },
    });

    // Broadcast status update to live feed
    realtimeService.broadcastAppointmentUpdated(updated);

    return updated;
  }
}

module.exports = new BookingService();
