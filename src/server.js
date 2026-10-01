require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const cron = require('node-cron');

const { apiLimiter } = require('./middlewares/rateLimiter.middleware');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler.middleware');

const authRoutes = require('./routes/auth.routes');
const publicRoutes = require('./routes/public.routes');
const appointmentRoutes = require('./routes/appointment.routes');
const serviceRoutes = require('./routes/service.routes');
const staffRoutes = require('./routes/staff.routes');
const receiptRoutes = require('./routes/receipt.routes');
const reminderRoutes = require('./routes/reminder.routes');
const webhookRoutes = require('./routes/webhook.routes');
const paymentRoutes = require('./routes/payment.routes');
const calendarRoutes = require('./routes/calendar.routes');
const liveFeedRoutes = require('./routes/liveFeed.routes');
const { paymentController } = require('./controllers/payment.controller');
const { receiptController } = require('./controllers/receipt.controller');
const { optionalAuth } = require('./middlewares/auth.middleware');
const reminderService = require('./services/reminder.service');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust reverse proxies (Render, Railway, Cloudflare) for secure cookies & rate limiting
app.set('trust proxy', 1);

// Security & Parsing Middlewares
app.use(helmet({
  contentSecurityPolicy: false, // Allows flexible UI rendering and CDN fonts
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend assets
app.use(express.static(path.join(__dirname, 'public')));

// Apply general API rate limiter
app.use('/api', apiLimiter);

// API Endpoints
app.use('/api/auth', authRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/public/checkout', paymentRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/admin/appointments', appointmentRoutes);
app.use('/api/admin/services', serviceRoutes);
app.use('/api/admin/staff', staffRoutes);
app.use('/api/admin/receipts', receiptRoutes);
app.use('/api/admin/reminders', reminderRoutes);
app.use('/api/admin/live', liveFeedRoutes);

// Checkout & Receipt Web Pages
app.get('/checkout/mock/:sessionId', paymentController.renderMockCheckout);
app.get('/checkout/success', paymentController.renderSuccessPage);
app.get('/receipt/:appointmentId', optionalAuth, receiptController.viewHtml);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'online',
    app: 'CitaFlow Micro-SaaS',
    timestamp: new Date().toISOString(),
  });
});

// Client and Admin Web Route Mappings (SPA / Clean HTML pages)
app.get('/b/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'booking.html'));
});

app.get('/confirm/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'confirm.html'));
});

app.get('/cancel/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cancel.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// Fallback to landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Automated 24-hour reminder background cron job (Runs every hour)
cron.schedule('0 * * * *', async () => {
  console.log('[Cron Job] Running automated 24-hour appointment reminder check...');
  try {
    const result = await reminderService.process24hReminders();
    console.log(`[Cron Job] Completed. ${result.processedCount} reminders processed.`);
  } catch (error) {
    console.error('[Cron Job Error]:', error);
  }
});

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 CitaFlow Micro-SaaS running on http://localhost:${PORT}`);
    console.log(`💈 Demo Public Booking: http://localhost:${PORT}/b/barberia-imperio`);
    console.log(`📊 Admin Dashboard:     http://localhost:${PORT}/admin`);
    console.log(`🔑 Demo Login: admin@barberiaimperio.com / Password123!`);
    console.log(`====================================================`);
  });
}

module.exports = app;
