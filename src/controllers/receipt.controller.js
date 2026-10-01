const { z } = require('zod');
const prisma = require('../config/prisma');
const receiptService = require('../services/receipt.service');

const issueReceiptSchema = z.object({
  appointmentId: z.string().min(1, 'El ID de la cita es obligatorio'),
  totalAmount: z.coerce.number().min(0, 'El importe debe ser válido').optional(),
  paymentMethod: z.enum(['CASH', 'TRANSFER', 'CARD']).default('CASH'),
});

class ReceiptController {
  /**
   * Issues receipt, marks appointment as COMPLETED and payment as PAID
   */
  async issue(req, res, next) {
    try {
      const { appointmentId, totalAmount, paymentMethod } = req.body;
      const businessId = req.business.id;

      const result = await receiptService.issueReceipt({
        appointmentId,
        businessId,
        totalAmount,
        paymentMethod,
      });

      res.status(201).json({
        success: true,
        message: 'Comprobante de pago emitido exitosamente.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * List all receipts for this business
   */
  async list(req, res, next) {
    try {
      const businessId = req.business.id;

      const receipts = await prisma.receipt.findMany({
        where: {
          appointment: { business_id: businessId },
        },
        include: {
          appointment: {
            include: {
              service: true,
              staff: true,
            },
          },
        },
        orderBy: { issued_at: 'desc' },
      });

      res.status(200).json({
        success: true,
        data: receipts,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * View / Print HTML Receipt (supports Admin session OR Client Token)
   */
  async viewHtml(req, res, next) {
    try {
      const { appointmentId } = req.params;
      const clientToken = req.query.token || req.headers['x-receipt-token'];
      const businessId = req.business?.id || null;

      const { receipt, appointment, business } = await receiptService.getReceiptWithAuth({
        appointmentId,
        businessId,
        clientToken,
      });

      const html = receiptService.generateReceiptHtml(receipt, appointment, business);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (error) {
      const status = error.statusCode || 500;
      if (status === 403 || status === 401 || status === 404) {
        return res.status(status).send(`
          <!DOCTYPE html>
          <html lang="es">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Comprobante de Pago | CitaFlow</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet">
            <style> body { font-family: 'Plus Jakarta Sans', sans-serif; } </style>
          </head>
          <body class="bg-zinc-950 text-zinc-100 min-h-screen flex items-center justify-center p-4">
            <div class="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-8 text-center space-y-4 shadow-2xl">
              <div class="text-4xl">🔒</div>
              <h1 class="text-xl font-bold text-white">Comprobante no disponible</h1>
              <p class="text-xs text-zinc-400 leading-relaxed">${error.message || 'Se requiere un enlace válido con token de seguridad para visualizar este comprobante.'}</p>
              <div class="pt-2">
                <a href="/" class="inline-block px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 transition">
                  Volver al inicio
                </a>
              </div>
            </div>
          </body>
          </html>
        `);
      }
      next(error);
    }
  }
}

module.exports = {
  receiptController: new ReceiptController(),
  issueReceiptSchema,
};
