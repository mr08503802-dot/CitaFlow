const { z } = require('zod');
const prisma = require('../config/prisma');

const serviceSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  description: z.string().optional(),
  duration_minutes: z.coerce.number().int().positive('La duración debe ser mayor a 0 minutos'),
  price: z.coerce.number().min(0, 'El precio no puede ser negativo'),
});

class ServiceController {
  async list(req, res, next) {
    try {
      const services = await prisma.service.findMany({
        where: { business_id: req.business.id },
        orderBy: { created_at: 'asc' },
      });
      res.status(200).json({ success: true, data: services });
    } catch (error) {
      next(error);
    }
  }

  async create(req, res, next) {
    try {
      const { name, description, duration_minutes, price } = req.body;
      const service = await prisma.service.create({
        data: {
          business_id: req.business.id,
          name: name.trim(),
          description: description ? description.trim() : null,
          duration_minutes,
          price,
        },
      });
      res.status(201).json({ success: true, message: 'Servicio creado correctamente', data: service });
    } catch (error) {
      next(error);
    }
  }

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const { name, description, duration_minutes, price } = req.body;

      const existing = await prisma.service.findFirst({
        where: { id, business_id: req.business.id },
      });
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Servicio no encontrado.' });
      }

      const updated = await prisma.service.update({
        where: { id },
        data: {
          name: name.trim(),
          description: description !== undefined ? description.trim() : existing.description,
          duration_minutes,
          price,
        },
      });
      res.status(200).json({ success: true, message: 'Servicio actualizado correctamente', data: updated });
    } catch (error) {
      next(error);
    }
  }

  async delete(req, res, next) {
    try {
      const { id } = req.params;

      const existing = await prisma.service.findFirst({
        where: { id, business_id: req.business.id },
      });
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Servicio no encontrado.' });
      }

      // Check if service has non-cancelled appointments
      const activeAppointments = await prisma.appointment.count({
        where: { service_id: id, status: { in: ['PENDING', 'CONFIRMED'] } },
      });

      if (activeAppointments > 0) {
        return res.status(400).json({
          success: false,
          message: 'No puedes eliminar este servicio porque tiene citas activas programadas.',
        });
      }

      await prisma.service.delete({ where: { id } });
      res.status(200).json({ success: true, message: 'Servicio eliminado correctamente.' });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = {
  serviceController: new ServiceController(),
  serviceSchema,
};
