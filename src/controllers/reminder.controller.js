const reminderService = require('../services/reminder.service');

class ReminderController {
  /**
   * Triggers the 24-hour reminder scan job manually (e.g. from admin panel or webhook)
   */
  async triggerCron(req, res, next) {
    try {
      const result = await reminderService.process24hReminders();
      res.status(200).json({
        success: true,
        message: `Proceso completado. ${result.processedCount} recordatorios generados y procesados.`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Generates and dispatches manual reminder for a specific appointment
   */
  async sendManual(req, res, next) {
    try {
      const { appointmentId } = req.params;
      const businessId = req.business.id;

      const result = await reminderService.sendManualReminder(appointmentId, businessId);
      res.status(200).json({
        success: true,
        message: 'Recordatorio generado correctamente.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = {
  reminderController: new ReminderController(),
};
