const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

const JWT_SECRET = process.env.JWT_SECRET || 'citaflow_super_secure_jwt_secret_2026';
const SALT_ROUNDS = 10;

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9 -]/g, '') // remove invalid chars
    .replace(/\s+/g, '-') // collapse whitespace and replace by -
    .replace(/-+/g, '-'); // collapse dashes
}

class AuthService {
  async register({ name, email, password, phone, address, currency = 'USD' }) {
    // 1. Check if email already registered
    const existing = await prisma.business.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (existing) {
      const error = new Error('El correo electrónico ya está registrado.');
      error.statusCode = 409;
      throw error;
    }

    // 2. Generate unique slug
    let baseSlug = slugify(name);
    if (!baseSlug) baseSlug = 'negocio';
    let slug = baseSlug;
    let counter = 1;

    while (await prisma.business.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    // 3. Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // 4. Create Business with transaction (auto-onboard default service and staff)
    const business = await prisma.$transaction(async (tx) => {
      const newBiz = await tx.business.create({
        data: {
          name: name.trim(),
          slug,
          email: email.toLowerCase().trim(),
          password_hash: passwordHash,
          phone: phone.trim(),
          address: address ? address.trim() : null,
          currency,
        },
      });

      // Default starter service
      await tx.service.create({
        data: {
          business_id: newBiz.id,
          name: 'Corte de Cabello Estándar',
          description: 'Corte personalizado con acabado profesional.',
          duration_minutes: 45,
          price: 15.0,
        },
      });

      // Default staff member
      const defaultSchedule = {
        monday: { active: true, start: '09:00', end: '19:00', lunchStart: '14:00', lunchEnd: '15:00' },
        tuesday: { active: true, start: '09:00', end: '19:00', lunchStart: '14:00', lunchEnd: '15:00' },
        wednesday: { active: true, start: '09:00', end: '19:00', lunchStart: '14:00', lunchEnd: '15:00' },
        thursday: { active: true, start: '09:00', end: '19:00', lunchStart: '14:00', lunchEnd: '15:00' },
        friday: { active: true, start: '09:00', end: '20:00', lunchStart: '14:00', lunchEnd: '15:00' },
        saturday: { active: true, start: '10:00', end: '18:00', lunchStart: '14:00', lunchEnd: '15:00' },
        sunday: { active: false, start: '10:00', end: '14:00' },
      };

      await tx.staff.create({
        data: {
          business_id: newBiz.id,
          name: 'Especialista Principal',
          email: newBiz.email,
          phone: newBiz.phone,
          schedule_json: JSON.stringify(defaultSchedule),
        },
      });

      return newBiz;
    });

    const token = this.generateToken(business.id);

    return {
      token,
      business: {
        id: business.id,
        name: business.name,
        slug: business.slug,
        email: business.email,
        phone: business.phone,
        currency: business.currency,
      },
    };
  }

  async login({ email, password }) {
    const business = await prisma.business.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!business) {
      const error = new Error('Credenciales incorrectas: correo o contraseña no válidos.');
      error.statusCode = 401;
      throw error;
    }

    const isValidPassword = await bcrypt.compare(password, business.password_hash);
    if (!isValidPassword) {
      const error = new Error('Credenciales incorrectas: correo o contraseña no válidos.');
      error.statusCode = 401;
      throw error;
    }

    const token = this.generateToken(business.id);

    return {
      token,
      business: {
        id: business.id,
        name: business.name,
        slug: business.slug,
        email: business.email,
        phone: business.phone,
        address: business.address,
        currency: business.currency,
      },
    };
  }

  generateToken(businessId) {
    return jwt.sign({ businessId }, JWT_SECRET, { expiresIn: '7d' });
  }
}

module.exports = new AuthService();
