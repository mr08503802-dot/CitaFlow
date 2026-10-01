const { z } = require('zod');
const prisma = require('../config/prisma');

const staffSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  avatar_url: z.string().url().optional().or(z.literal('')),
  schedule: z.any().optional(),
});

class StaffController {
  async list(req, res, next) {
    try {
      const staffList = await prisma.staff.findMany({
        where: { business_id: req.business.id },
        orderBy: { created_at: 'asc' },
      });
      res.status(200).json({ success: true, data: staffList });
    } catch (error) {
      next(error);
    }
  }

  async create(req, res, next) {
    try {
      const { name, email, phone, avatar_url, schedule } = req.body;

      const defaultSchedule = schedule || {
        monday: { active: true, start: '09:00', end: '19:00', lunchStart: '14:00', lunchEnd: '15:00' },
        tuesday: { active: true, start: '09:00', end: '19:00', lunchStart: '14:00', lunchEnd: '15:00' },
        wednesday: { active: true, start: '09:00', end: '19:00', lunchStart: '14:00', lunchEnd: '15:00' },
        thursday: { active: true, start: '09:00', end: '19:00', lunchStart: '14:00', lunchEnd: '15:00' },
        friday: { active: true, start: '09:00', end: '20:00', lunchStart: '14:00', lunchEnd: '15:00' },
        saturday: { active: true, start: '10:00', end: '18:00', lunchStart: '14:00', lunchEnd: '15:00' },
        sunday: { active: false, start: '10:00', end: '14:00' },
      };

      const staff = await prisma.staff.create({
        data: {
          business_id: req.business.id,
          name: name.trim(),
          email: email ? email.trim() : null,
          phone: phone ? phone.trim() : null,
          avatar_url: avatar_url || null,
          schedule_json: typeof defaultSchedule === 'string' ? defaultSchedule : JSON.stringify(defaultSchedule),
        },
      });

      res.status(201).json({ success: true, message: 'Especialista agregado correctamente.', data: staff });
    } catch (error) {
      next(error);
    }
  }

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const { name, email, phone, avatar_url, schedule } = req.body;

      const existing = await prisma.staff.findFirst({
        where: { id, business_id: req.business.id },
      });
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Especialista no encontrado.' });
      }

      const updated = await prisma.staff.update({
        where: { id },
        data: {
          name: name ? name.trim() : existing.name,
          email: email !== undefined ? (email ? email.trim() : null) : existing.email,
          phone: phone !== undefined ? (phone ? phone.trim() : null) : existing.phone,
          avatar_url: avatar_url !== undefined ? avatar_url : existing.avatar_url,
          schedule_json: schedule ? (typeof schedule === 'string' ? schedule : JSON.stringify(schedule)) : existing.schedule_json,
        },
      });

      res.status(200).json({ success: true, message: 'Especialista actualizado con éxito.', data: updated });
    } catch (error) {
      next(error);
    }
  }

  async delete(req, res, next) {
    try {
      const { id } = req.params;

      const existing = await prisma.staff.findFirst({
        where: { id, business_id: req.business.id },
      });
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Especialista no encontrado.' });
      }

      const activeAppointments = await prisma.appointment.count({
        where: { staff_id: id, status: { in: ['PENDING', 'CONFIRMED'] } },
      });

      if (activeAppointments > 0) {
        return res.status(400).json({
          success: false,
          message: 'No puedes eliminar este especialista porque tiene citas activas pendientes o confirmadas.',
        });
      }

      await prisma.staff.delete({ where: { id } });
      res.status(200).json({ success: true, message: 'Especialista eliminado con éxito.' });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = {
  staffController: new StaffController(),
  staffSchema,
};
