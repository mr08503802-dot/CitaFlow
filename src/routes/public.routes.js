const express = require('express');
const { publicController, getSlotsQuerySchema, bookSchema } = require('../controllers/public.controller');
const { validateBody, validateQuery } = require('../middlewares/validate.middleware');
const { bookingLimiter } = require('../middlewares/rateLimiter.middleware');

const router = express.Router();

// Business public information
router.get('/b/:slug', publicController.getBusinessProfile);

// Real-time slot availability calculation
router.get('/b/:slug/slots', validateQuery(getSlotsQuerySchema), publicController.getSlots);

// Public booking creation
router.post('/b/:slug/book', bookingLimiter, validateBody(bookSchema), publicController.createBooking);

// Client Magic Link actions
router.get('/magic/:token', publicController.getByMagicToken);
router.post('/magic/:token/confirm', publicController.confirmAttendance);
router.post('/magic/:token/cancel', publicController.cancelAppointment);

module.exports = router;
