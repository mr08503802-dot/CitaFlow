const { z } = require('zod');
const authService = require('../services/auth.service');

const registerSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  email: z.string().email('Correo electrónico inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  phone: z.string().min(6, 'El teléfono debe tener al menos 6 caracteres'),
  address: z.string().optional(),
  currency: z.string().default('USD'),
});

const loginSchema = z.object({
  email: z.string().email('Correo electrónico inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});

class AuthController {
  async register(req, res, next) {
    try {
      const result = await authService.register(req.body);
      res.status(201).json({
        success: true,
        message: '¡Registro exitoso! Tu negocio ha sido creado y configurado.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async login(req, res, next) {
    try {
      const result = await authService.login(req.body);
      res.status(200).json({
        success: true,
        message: 'Sesión iniciada correctamente.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getMe(req, res) {
    res.status(200).json({
      success: true,
      data: req.business,
    });
  }
}

module.exports = {
  authController: new AuthController(),
  registerSchema,
  loginSchema,
};
