const express = require('express');
const { authController, registerSchema, loginSchema } = require('../controllers/auth.controller');
const { validateBody } = require('../middlewares/validate.middleware');
const { authenticateToken } = require('../middlewares/auth.middleware');
const { authLimiter } = require('../middlewares/rateLimiter.middleware');

const router = express.Router();

router.post('/register', authLimiter, validateBody(registerSchema), authController.register);
router.post('/login', authLimiter, validateBody(loginSchema), authController.login);
router.get('/me', authenticateToken, authController.getMe);

module.exports = router;
