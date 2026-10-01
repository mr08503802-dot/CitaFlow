const rateLimit = require('express-rate-limit');

// General API rate limiter: 300 requests per 15 minutes per IP
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiadas solicitudes desde esta IP, por favor inténtalo de nuevo en unos minutos.',
  },
});

// Stricter limiter for public booking creation & auth endpoints: 20 bookings/auth calls per 15 minutes
const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Has alcanzado el límite de reservas por ahora. Por favor espera unos minutos antes de intentar de nuevo.',
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiados intentos de autenticación. Intenta nuevamente en 15 minutos.',
  },
});

module.exports = {
  apiLimiter,
  bookingLimiter,
  authLimiter,
};
