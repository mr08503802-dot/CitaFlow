const paymentService = require('../services/payment.service');
const prisma = require('../config/prisma');

class PaymentController {
  /**
   * Creates Checkout Session
   */
  async createSession(req, res, next) {
    try {
      const { appointmentId, amount, depositType } = req.body;
      const result = await paymentService.createCheckoutSession({
        appointmentId,
        amount,
        depositType,
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Stripe Webhook Handler
   */
  async handleStripeWebhook(req, res, next) {
    try {
      const stripe = paymentService.getStripeClient();
      const sig = req.headers['stripe-signature'];
      let event;

      if (paymentService.stripeWebhookSecret && stripe && sig) {
        event = stripe.webhooks.constructEvent(req.rawBody || req.body, sig, paymentService.stripeWebhookSecret);
      } else {
        event = req.body;
      }

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const appointmentId = session.client_reference_id || session.metadata?.appointmentId;
        const amountTotal = (session.amount_total || 0) / 100;

        if (appointmentId) {
          await paymentService.processSuccessfulPayment({
            appointmentId,
            paymentMethod: 'CARD',
            transactionId: session.id,
            amount: amountTotal,
          });
        }
      }

      res.status(200).json({ received: true });
    } catch (error) {
      console.error('[Stripe Webhook Error]:', error.message);
      res.status(400).send(`Webhook Error: ${error.message}`);
    }
  }

  /**
   * Mercado Pago Webhook Handler
   */
  async handleMercadoPagoWebhook(req, res, next) {
    try {
      const { type, data } = req.body;

      if (type === 'payment' && data?.id) {
        // In live mode: query payment from Mercado Pago API
        // For now, accept and acknowledge
        console.log(`[Mercado Pago Webhook] Payment event ID: ${data.id}`);
      }

      res.status(200).json({ received: true });
    } catch (error) {
      console.error('[Mercado Pago Webhook Error]:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Simulate instant payment success (Development & Demo mode)
   */
  async simulateSuccess(req, res, next) {
    try {
      const { sessionId, appointmentId } = req.body;
      let targetAptId = appointmentId;

      if (sessionId) {
        const session = paymentService.getSession(sessionId);
        if (session) targetAptId = session.appointmentId;
      }

      if (!targetAptId) {
        return res.status(400).json({ success: false, message: 'ID de cita requerido' });
      }

      const result = await paymentService.processSuccessfulPayment({
        appointmentId: targetAptId,
        paymentMethod: 'CARD',
        transactionId: `tx_mock_${Date.now()}`,
      });

      res.status(200).json({
        success: true,
        message: '¡Pago simulado con éxito! Cita confirmada y recibo emitido.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Render Mock Checkout Page
   */
  async renderMockCheckout(req, res) {
    const { sessionId } = req.params;
    const session = paymentService.getSession(sessionId);

    if (!session) {
      return res.status(404).send('Sesión de pago no válida o expirada.');
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: session.appointmentId },
      include: { business: true, service: true, staff: true },
    });

    if (!appointment) {
      return res.status(404).send('Cita no encontrada.');
    }

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pasarela Segura de Pago | CitaFlow Pay</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style> body { font-family: 'Plus Jakarta Sans', sans-serif; } </style>
</head>
<body class="bg-zinc-950 text-zinc-100 min-h-screen flex items-center justify-center p-4">
  <div class="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
    <div class="flex items-center justify-between border-b border-zinc-800 pb-4">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white text-sm">C</div>
        <span class="font-bold text-sm text-white">CitaFlow <span class="text-emerald-400">Pay</span></span>
      </div>
      <span class="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Pago Seguro SSL</span>
    </div>

    <div>
      <h2 class="text-xl font-extrabold text-white">Confirmar Pago en Línea</h2>
      <p class="text-xs text-zinc-400 mt-1">${appointment.business.name}</p>
    </div>

    <div class="bg-zinc-950/60 rounded-2xl p-4 border border-zinc-800 space-y-2 text-xs">
      <div class="flex justify-between text-zinc-400">
        <span>Concepto:</span>
        <span class="font-bold text-white">${appointment.service.name}</span>
      </div>
      <div class="flex justify-between text-zinc-400">
        <span>Especialista:</span>
        <span class="font-bold text-white">${appointment.staff.name}</span>
      </div>
      <div class="flex justify-between text-zinc-400">
        <span>Fecha:</span>
        <span class="font-bold text-indigo-400">${new Date(appointment.start_time).toLocaleDateString('es-ES')}</span>
      </div>
      <div class="flex justify-between text-zinc-400 pt-2 border-t border-zinc-800">
        <span class="text-sm font-semibold text-zinc-200">Importe a Pagar:</span>
        <span class="text-lg font-extrabold text-emerald-400">$${session.amount.toFixed(2)} ${session.currency.toUpperCase()}</span>
      </div>
    </div>

    <!-- Payment Simulation Controls -->
    <div class="space-y-3">
      <button onclick="payNow()" id="btn-pay" class="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 font-bold text-white text-sm transition shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2">
        <span>💳 Pagar Ahora $${session.amount.toFixed(2)}</span>
      </button>

      <a href="/b/${appointment.business.slug}" class="block text-center text-xs text-zinc-500 hover:text-zinc-300">
        Cancelar y pagar en el establecimiento
      </a>
    </div>

    <div class="text-[11px] text-zinc-500 text-center flex items-center justify-center gap-2">
      <span>🔒 Simulación de Checkout Seguro (Stripe / Mercado Pago)</span>
    </div>
  </div>

  <script>
    async function payNow() {
      const btn = document.getElementById('btn-pay');
      btn.disabled = true;
      btn.innerHTML = '<span class="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span> Procesando pago seguro...';

      try {
        const res = await fetch('/api/public/checkout/simulate-success', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: '${sessionId}',
            appointmentId: '${appointment.id}',
          }),
        });
        const data = await res.json();
        if (data.success) {
          window.location.href = '/checkout/success?apt=${appointment.id}';
        } else {
          alert('Error procesando pago: ' + data.message);
          btn.disabled = false;
        }
      } catch (e) {
        alert('Error conectando con la pasarela.');
        btn.disabled = false;
      }
    }
  </script>
</body>
</html>`;

    res.send(html);
  }

  /**
   * Render Checkout Success Page
   */
  async renderSuccessPage(req, res) {
    const { apt } = req.query;
    let appointment = null;
    if (apt) {
      appointment = await prisma.appointment.findUnique({
        where: { id: apt },
        include: { business: true, service: true, staff: true, receipt: true },
      });
    }

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>¡Pago Exitoso! | CitaFlow</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style> body { font-family: 'Plus Jakarta Sans', sans-serif; } </style>
</head>
<body class="bg-zinc-950 text-zinc-100 min-h-screen flex items-center justify-center p-4">
  <div class="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-8 text-center shadow-2xl space-y-6">
    <div class="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-3xl mx-auto animate-bounce">
      ✓
    </div>

    <div>
      <h1 class="text-2xl font-extrabold text-white">¡Pago Confirmado!</h1>
      <p class="text-xs text-zinc-400 mt-1">Tu cita y pago han sido procesados y garantizados con éxito.</p>
    </div>

    ${appointment ? `
      <div class="bg-zinc-950/60 rounded-2xl p-4 border border-zinc-800 text-left text-xs space-y-2">
        <div class="flex justify-between">
          <span class="text-zinc-400">Nº Comprobante:</span>
          <span class="font-mono font-bold text-indigo-400">${appointment.receipt?.receipt_number || 'REC-CONFIRMED'}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-zinc-400">Servicio:</span>
          <span class="font-bold text-white">${appointment.service?.name}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-zinc-400">Especialista:</span>
          <span class="font-bold text-white">${appointment.staff?.name}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-zinc-400">Fecha y Hora:</span>
          <span class="font-bold text-emerald-400">${new Date(appointment.start_time).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}</span>
        </div>
      </div>
    ` : ''}

    <div class="space-y-3 pt-2">
      ${appointment?.receipt ? `
        <a href="/receipt/${appointment.id}?token=${appointment.confirmation_token}" target="_blank" class="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition flex items-center justify-center gap-2">
          🖨️ Ver Comprobante Oficial de Pago
        </a>
      ` : ''}
      <a href="/" class="block w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition">
        Volver a la página principal
      </a>
    </div>
  </div>
</body>
</html>`;

    res.send(html);
  }
}

module.exports = {
  paymentController: new PaymentController(),
};
