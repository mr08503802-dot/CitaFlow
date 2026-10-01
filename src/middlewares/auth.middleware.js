const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

const JWT_SECRET = process.env.JWT_SECRET || 'citaflow_super_secure_jwt_secret_2026';

async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.split(' ')[1] 
      : (req.query.admin_token || req.query.jwt);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Acceso no autorizado: Token no proporcionado.',
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Find the business/user
    const business = await prisma.business.findUnique({
      where: { id: decoded.businessId },
      select: {
        id: true,
        name: true,
        slug: true,
        email: true,
        phone: true,
        currency: true,
      },
    });

    if (!business) {
      return res.status(401).json({
        success: false,
        message: 'Negocio o usuario no encontrado.',
      });
    }

    req.business = business;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'La sesión ha expirado. Por favor ingresa nuevamente.',
      });
    }
    return res.status(403).json({
      success: false,
      message: 'Token de autenticación inválido.',
    });
  }
}

async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.split(' ')[1] 
      : (req.query.admin_token || req.query.jwt);

    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      const business = await prisma.business.findUnique({
        where: { id: decoded.businessId },
        select: { id: true, name: true, slug: true, email: true, phone: true, currency: true },
      });
      if (business) {
        req.business = business;
      }
    }
  } catch (error) {
    // Non-fatal for optional auth
  }
  next();
}

module.exports = {
  authenticateToken,
  optionalAuth,
};
