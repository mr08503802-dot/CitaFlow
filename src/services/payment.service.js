const prisma = require('../config/prisma');
const receiptService = require('./receipt.service');
const whatsappService = require('./whatsapp.service');
const realtimeService = require('./realtime.service');
const { getBaseUrl } = require('../config/url');

class PaymentService {
  constructor() {
    this.provider = process.env.PAYMENT_PROVIDER || 'mock'; // 'mock' | 'stripe' | 'mercadopago'
    this.stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
    this.stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
    this.mercadopagoAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || '';
    this.baseUrl = getBaseUrl();

    // In-memory store for active checkout sessions
    this.sessions = new Map();
  }

  /**
   * Initializes or returns Stripe client if configured
   */
  getStripeClient() {
    if (!this.stripeClient && this.stripeSecretKey) {
      const Stripe = require('stripe');
      this.stripeClient = new Stripe(this.stripeSecretKey, { apiVersion: '2024-06-20' });
    }
    return this.stripeClient;
  }

  /**
   * Creates a checkout session (Stripe, Mercado Pago, or Mock Simulator)
   */
  async createCheckoutSession({ appointmentId, amount, depositType = 'FULL' }) {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { service: true, staff: true, business: true },
    });

    if (!appointment) {
      const error = new Error('Cita no encontrada.');
      error.statusCode = 404;
      throw error;
    }

    const finalAmount = amount !== undefined ? parseFloat(amount) : appointment.service.price;
    const currency = (appointment.business?.currency || 'USD').toLowerCase();
    const sessionId = `cs_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const sessionData = {
      sessionId,
      appointmentId: appointment.id,
      businessId: appointment.business_id,
      amount: finalAmount,
      currency,
      depositType,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };

    // 1. Stripe Checkout Integration
    if (this.provider === 'stripe' && this.stripeSecretKey) {
      const stripe = this.getStripeClient();
      const unitAmount = Math.round(finalAmount * 100); // Stripe uses cents

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency,
              product_data: {
                name: `${appointment.service.name} (${appointment.business.name})`,
                description: `Cita con ${appointment.staff.name} el ${new Date(appointment.start_time).toLocaleDateString('es-ES')}`,
              },
              unit_amount: unitAmount,
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${this.baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}&apt=${appointment.id}`,
        cancel_url: `${this.baseUrl}/b/${appointment.business.slug}`,
        client_reference_id: appointment.id,
        customer_email: appointment.client_email,
        metadata: {
          appointmentId: appointment.id,
          businessId: appointment.business.id,
        },
      });

      this.sessions.set(session.id, { ...sessionData, stripeSessionId: session.id });
      return {
        checkoutUrl: session.url,
        sessionId: session.id,
        provider: 'stripe',
        amount: finalAmount,
        currency,
      };
    }

    // 2. Mercado Pago Preference Integration
    if (this.provider === 'mercadopago' && this.mercadopagoAccessToken) {
      const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.mercadopagoAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: [
            {
              title: `${appointment.service.name} - ${appointment.business.name}`,
              quantity: 1,
              currency_id: currency.toUpperCase(),
              unit_price: finalAmount,
            },
          ],
          external_reference: appointment.id,
          payer: {
            name: appointment.client_name,
            email: appointment.client_email,
          },
          back_urls: {
            success: `${this.baseUrl}/checkout/success?apt=${appointment.id}`,
            failure: `${this.baseUrl}/b/${appointment.business.slug}`,
            pending: `${this.baseUrl}/checkout/success?apt=${appointment.id}`,
          },
          auto_return: 'approved',
        }),
      });

      const mpData = await mpResponse.json();
      if (!mpResponse.ok) {
        throw new Error(mpData.message || 'Error creando preferencia de Mercado Pago');
      }

      this.sessions.set(sessionId, { ...sessionData, mpPreferenceId: mpData.id });
      return {
        checkoutUrl: mpData.init_point || mpData.sandbox_init_point,
        sessionId,
        provider: 'mercadopago',
        amount: finalAmount,
        currency,
      };
    }

    // 3. Mock / Simulation Gateway (Default zero-config local testing)
    this.sessions.set(sessionId, sessionData);
    const mockCheckoutUrl = `${this.baseUrl}/checkout/mock/${sessionId}`;

    return {
      checkoutUrl: mockCheckoutUrl,
      sessionId,
      provider: 'mock',
      amount: finalAmount,
      currency,
    };
  }

  /**
   * Processes successful payment and issues receipt in 3NF database
   */
  async processSuccessfulPayment({ appointmentId, paymentMethod = 'CARD', transactionId = null, amount }) {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { business: true, service: true, staff: true, receipt: true },
    });

    if (!appointment) {
      throw new Error(`Cita ID ${appointmentId} no encontrada.`);
    }

    const finalAmount = amount !== undefined ? parseFloat(amount) : appointment.service.price;

    // Issue receipt & mark appointment as COMPLETED or CONFIRMED
    const receiptResult = await receiptService.issueReceipt({
      appointmentId: appointment.id,
      businessId: appointment.business_id,
      totalAmount: finalAmount,
      paymentMethod,
    });

    // Update appointment status to CONFIRMED (since service is pre-paid and guaranteed)
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: 'CONFIRMED' },
    });

    console.log(`💳 [Payment Success] Appointment ${appointment.id} paid (${finalAmount} ${appointment.business.currency}). Receipt issued: ${receiptResult.receipt.receipt_number}`);

    // Send instant WhatsApp notification about verified payment
    const waText = 
`✅ ¡Pago Recibido con Éxito!

Hola *${appointment.client_name}*, hemos confirmado tu pago de *${finalAmount.toFixed(2)} ${appointment.business.currency}* para tu cita:
💈 *Servicio:* ${appointment.service.name}
✂️ *Especialista:* ${appointment.staff.name}
📅 *Fecha:* ${new Date(appointment.start_time).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
🧾 *Comprobante Digital:* ${receiptService.getReceiptUrl(appointment)}

¡Tu turno está 100% garantizado! Te esperamos.`;

    await whatsappService.sendMessage({
      to: appointment.client_phone,
      text: waText,
      appointmentId: appointment.id,
    });

    // Broadcast payment received to realtime SSE stream
    realtimeService.broadcastPaymentReceived(appointment.business_id, {
      appointmentId: appointment.id,
      clientName: appointment.client_name,
      amount: finalAmount,
      currency: appointment.business.currency,
      receiptNumber: receiptResult.receipt.receipt_number,
      receiptUrl: receiptService.getReceiptUrl(appointment),
      serviceName: appointment.service.name,
      staffName: appointment.staff.name,
    });

    return {
      success: true,
      appointmentId: appointment.id,
      receipt: receiptResult.receipt,
    };
  }

  /**
   * Retrieves active session details
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }
}

module.exports = new PaymentService();
