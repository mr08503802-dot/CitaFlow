const crypto = require('crypto');
const prisma = require('../config/prisma');
const { getBaseUrl } = require('../config/url');

class ReceiptService {
  constructor() {
    this.baseUrl = getBaseUrl();
    this.secret = process.env.JWT_SECRET || 'citaflow_receipt_hmac_secret_2026';
  }

  /**
   * Creates a tamper-proof HMAC signed token for receipt access in URLs
   */
  createSignedReceiptToken(appointmentId) {
    return crypto
      .createHmac('sha256', this.secret)
      .update(appointmentId)
      .digest('hex')
      .substring(0, 32);
  }

  /**
   * Generates public client URL with security token for receipt viewing
   */
  getReceiptUrl(appointment) {
    const token = appointment.confirmation_token || this.createSignedReceiptToken(appointment.id);
    return `${this.baseUrl}/receipt/${appointment.id}?token=${token}`;
  }

  /**
   * Issues or updates a receipt for an appointment and marks it as PAID/COMPLETED
   */
  async issueReceipt({ appointmentId, businessId, totalAmount, paymentMethod = 'CASH' }) {
    // 1. Fetch appointment with business and service
    const appointment = await prisma.appointment.findFirst({
      where: { id: appointmentId, business_id: businessId },
      include: {
        business: true,
        service: true,
        staff: true,
        receipt: true,
      },
    });

    if (!appointment) {
      const error = new Error('Cita no encontrada.');
      error.statusCode = 404;
      throw error;
    }

    const year = new Date().getFullYear();
    const finalAmount = totalAmount !== undefined ? parseFloat(totalAmount) : appointment.service.price;
    const receiptNumber = appointment.receipt?.receipt_number || `REC-${year}-${Math.floor(10000 + Math.random() * 90000)}`;

    // 2. Transaction: Update appointment status to COMPLETED and upsert Receipt
    const result = await prisma.$transaction(async (tx) => {
      await tx.appointment.update({
        where: { id: appointment.id },
        data: { status: 'COMPLETED' },
      });

      const receipt = await tx.receipt.upsert({
        where: { appointment_id: appointment.id },
        update: {
          total_amount: finalAmount,
          payment_method: paymentMethod.toUpperCase(),
          status: 'PAID',
          issued_at: new Date(),
        },
        create: {
          appointment_id: appointment.id,
          receipt_number: receiptNumber,
          total_amount: finalAmount,
          payment_method: paymentMethod.toUpperCase(),
          status: 'PAID',
          issued_at: new Date(),
        },
      });

      return receipt;
    });

    return {
      receipt: result,
      appointment,
    };
  }

  /**
   * Retrieves receipt with unified authentication:
   * - Authorizes if businessId matches appointment's business (Admin session)
   * - Authorizes if clientToken matches confirmation_token or HMAC signed token (Client link)
   */
  async getReceiptWithAuth({ appointmentId, businessId = null, clientToken = null }) {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        business: true,
        service: true,
        staff: true,
        receipt: true,
      },
    });

    if (!appointment || !appointment.receipt) {
      const error = new Error('Comprobante de pago no encontrado para esta cita.');
      error.statusCode = 404;
      throw error;
    }

    // Check authorization:
    let isAuthorized = false;

    // 1. Authorized as Admin
    if (businessId && businessId === appointment.business_id) {
      isAuthorized = true;
    }

    // 2. Authorized as Client via token
    if (clientToken) {
      const isConfirmationTokenMatch = clientToken === appointment.confirmation_token;
      const isSignedTokenMatch = clientToken === this.createSignedReceiptToken(appointment.id);
      if (isConfirmationTokenMatch || isSignedTokenMatch) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      const error = new Error('Acceso no autorizado: Debe proporcionar el token de comprobante del cliente o iniciar sesión como administrador.');
      error.statusCode = 403;
      throw error;
    }

    return {
      receipt: appointment.receipt,
      appointment,
      business: appointment.business,
    };
  }

  /**
   * Backwards-compatible getReceipt method
   */
  async getReceipt(appointmentId, businessId) {
    return this.getReceiptWithAuth({ appointmentId, businessId });
  }

  /**
   * Generates clean, printer-friendly HTML for receipts (Downloadable / Printable as PDF)
   */
  generateReceiptHtml(receipt, appointment, business) {
    const issuedDate = new Date(receipt.issued_at).toLocaleString('es-ES', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    const paymentMethodLabel = {
      CASH: 'Efectivo',
      TRANSFER: 'Transferencia Bancaria',
      CARD: 'Tarjeta de Crédito / Débito',
    }[receipt.payment_method] || receipt.payment_method;

    const currencySymbol = business.currency === 'EUR' ? '€' : (business.currency === 'USD' ? '$' : business.currency);

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Comprobante de Pago - ${receipt.receipt_number}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: 'Inter', -apple-system, sans-serif;
      background-color: #f3f4f6;
      color: #1f2937;
      padding: 40px 20px;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    .receipt-container {
      background: #ffffff;
      width: 100%;
      max-width: 520px;
      padding: 36px;
      border-radius: 16px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04);
      position: relative;
    }
    .header {
      text-align: center;
      border-bottom: 2px dashed #e5e7eb;
      padding-bottom: 24px;
      margin-bottom: 24px;
    }
    .biz-name {
      font-size: 24px;
      font-weight: 700;
      color: #111827;
      letter-spacing: -0.5px;
    }
    .biz-info {
      font-size: 13px;
      color: #6b7280;
      margin-top: 4px;
    }
    .receipt-badge {
      display: inline-block;
      background: #dcfce7;
      color: #15803d;
      font-size: 12px;
      font-weight: 600;
      padding: 4px 12px;
      border-radius: 9999px;
      margin-top: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .details-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      font-size: 13px;
      margin-bottom: 24px;
    }
    .detail-item span.label {
      color: #6b7280;
      display: block;
      margin-bottom: 2px;
    }
    .detail-item span.val {
      font-weight: 600;
      color: #111827;
    }
    .table-container {
      margin-bottom: 24px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th {
      text-align: left;
      padding: 10px 0;
      color: #6b7280;
      font-weight: 500;
      border-bottom: 1px solid #e5e7eb;
    }
    th.text-right, td.text-right {
      text-align: right;
    }
    td {
      padding: 14px 0;
      border-bottom: 1px solid #f3f4f6;
    }
    .service-desc {
      font-size: 12px;
      color: #6b7280;
      margin-top: 2px;
    }
    .total-section {
      background: #f9fafb;
      padding: 16px;
      border-radius: 12px;
      margin-bottom: 28px;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 18px;
      font-weight: 700;
      color: #111827;
    }
    .footer {
      text-align: center;
      font-size: 12px;
      color: #9ca3af;
      border-top: 1px solid #f3f4f6;
      padding-top: 20px;
    }
    .actions-bar {
      display: flex;
      gap: 12px;
      margin-top: 24px;
    }
    .btn {
      flex: 1;
      padding: 12px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      text-align: center;
      border: none;
      transition: all 0.2s ease;
      text-decoration: none;
    }
    .btn-print {
      background: #111827;
      color: white;
    }
    .btn-print:hover {
      background: #374151;
    }
    .btn-close {
      background: #f3f4f6;
      color: #4b5563;
    }
    .btn-close:hover {
      background: #e5e7eb;
    }
    @media print {
      body {
        background: transparent;
        padding: 0;
      }
      .receipt-container {
        box-shadow: none;
        padding: 10px;
        width: 100%;
        max-width: 100%;
      }
      .actions-bar {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="receipt-container">
    <div class="header">
      <h1 class="biz-name">${business.name}</h1>
      <div class="biz-info">${business.address || 'Estudio Profesional'}</div>
      <div class="biz-info">Tel: ${business.phone || 'N/A'}</div>
      <div class="receipt-badge">✓ Pagado & Verificado</div>
    </div>

    <div class="details-grid">
      <div class="detail-item">
        <span class="label">Nº Comprobante:</span>
        <span class="val">${receipt.receipt_number}</span>
      </div>
      <div class="detail-item">
        <span class="label">Fecha y Hora:</span>
        <span class="val">${issuedDate}</span>
      </div>
      <div class="detail-item">
        <span class="label">Cliente:</span>
        <span class="val">${appointment.client_name}</span>
      </div>
      <div class="detail-item">
        <span class="label">Método de Pago:</span>
        <span class="val">${paymentMethodLabel}</span>
      </div>
      <div class="detail-item">
        <span class="label">Especialista:</span>
        <span class="val">${appointment.staff?.name || 'Profesional Asignado'}</span>
      </div>
      <div class="detail-item">
        <span class="label">Estado de Cita:</span>
        <span class="val">Completada</span>
      </div>
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Concepto / Servicio</th>
            <th class="text-right">Duración</th>
            <th class="text-right">Importe</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>${appointment.service?.name}</strong>
              <div class="service-desc">${appointment.service?.description || 'Servicio profesional de cuidado personal'}</div>
            </td>
            <td class="text-right">${appointment.service?.duration_minutes} min</td>
            <td class="text-right">${currencySymbol}${receipt.total_amount.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="total-section">
      <div class="total-row">
        <span>Total Pagado:</span>
        <span>${currencySymbol}${receipt.total_amount.toFixed(2)}</span>
      </div>
    </div>

    <div class="footer">
      <p>¡Gracias por elegir ${business.name}!</p>
      <p style="margin-top: 4px;">Comprobante digital emitido automáticamente vía CitaFlow Micro-SaaS.</p>
    </div>

    <div class="actions-bar">
      <button class="btn btn-print" onclick="window.print()">Imprimir / Guardar PDF</button>
      <button class="btn btn-close" onclick="window.close()">Cerrar</button>
    </div>
  </div>
</body>
</html>`;
  }
}

module.exports = new ReceiptService();
