const EventEmitter = require('events');

class RealtimeService extends EventEmitter {
  constructor() {
    super();
    // Map of businessId (string) -> Set of Express response objects
    this.clients = new Map();
    this.setMaxListeners(100);
  }

  /**
   * Registers a client SSE connection for a specific business
   */
  registerClient(businessId, res) {
    if (!this.clients.has(businessId)) {
      this.clients.set(businessId, new Set());
    }

    const businessClients = this.clients.get(businessId);
    businessClients.add(res);

    console.log(`📡 [Realtime SSE] Admin client connected for business [${businessId}]. Active clients: ${businessClients.size}`);

    // Send initial handshake event
    res.write(`event: connected\ndata: ${JSON.stringify({
      status: 'connected',
      businessId,
      message: 'Conexión SSE establecida con el Feed en Vivo de CitaFlow',
      connectedAt: new Date().toISOString(),
    })}\n\n`);

    // Keep-alive heartbeat ping every 20 seconds
    const pingInterval = setInterval(() => {
      try {
        res.write(`event: ping\ndata: {"time":"${new Date().toISOString()}"}\n\n`);
      } catch (err) {
        clearInterval(pingInterval);
      }
    }, 20000);

    // Clean up when client disconnects
    res.on('close', () => {
      clearInterval(pingInterval);
      const set = this.clients.get(businessId);
      if (set) {
        set.delete(res);
        if (set.size === 0) {
          this.clients.delete(businessId);
        }
      }
      console.log(`📡 [Realtime SSE] Admin client disconnected for business [${businessId}].`);
    });
  }

  /**
   * Returns count of active SSE connections for a business
   */
  getClientCount(businessId) {
    return this.clients.get(businessId)?.size || 0;
  }

  /**
   * Broadcasts an event to all connected clients belonging to a business
   */
  broadcast(businessId, eventType, payload) {
    const clients = this.clients.get(businessId);
    const eventPayload = {
      type: eventType,
      data: payload,
      timestamp: new Date().toISOString(),
    };
    const message = `event: message\ndata: ${JSON.stringify(eventPayload)}\n\n`;

    if (clients && clients.size > 0) {
      console.log(`📡 [Realtime SSE] Broadcasting '${eventType}' to ${clients.size} client(s) for business [${businessId}]`);
      for (const res of clients) {
        try {
          res.write(message);
        } catch (err) {
          console.error('[Realtime SSE Error]:', err.message);
        }
      }
    }

    // Emit event locally for testing / server listeners
    this.emit(`business:${businessId}`, eventPayload);
    this.emit('broadcast', { businessId, ...eventPayload });
  }

  /**
   * Helper: Broadcast newly created booking
   */
  broadcastNewAppointment(appointment) {
    if (!appointment || !appointment.business_id) return;
    this.broadcast(appointment.business_id, 'appointment:created', {
      appointment,
      summary: `Nueva reserva: ${appointment.client_name} - ${appointment.service?.name || 'Servicio'} (${appointment.staff?.name || 'Especialista'})`,
    });
  }

  /**
   * Helper: Broadcast appointment status update (CONFIRMED, CANCELLED, etc.)
   */
  broadcastAppointmentUpdated(appointment) {
    if (!appointment || !appointment.business_id) return;
    this.broadcast(appointment.business_id, 'appointment:updated', {
      appointment,
      summary: `Cita #${appointment.id.substring(0, 8)} actualizada a ${appointment.status}`,
    });
  }

  /**
   * Helper: Broadcast payment received
   */
  broadcastPaymentReceived(businessId, paymentData) {
    if (!businessId) return;
    this.broadcast(businessId, 'payment:received', paymentData);
  }

  /**
   * Helper: Broadcast receipt issued
   */
  broadcastReceiptIssued(businessId, receiptData) {
    if (!businessId) return;
    this.broadcast(businessId, 'receipt:issued', receiptData);
  }
}

module.exports = new RealtimeService();
