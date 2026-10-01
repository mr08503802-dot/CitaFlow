const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding CitaFlow database...');

  // Clean existing data
  await prisma.receipt.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.service.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.business.deleteMany();

  const passwordHash = await bcrypt.hash('Password123!', 10);

  // 1. Create Business
  const business = await prisma.business.create({
    data: {
      name: 'Barbería Imperio',
      slug: 'barberia-imperio',
      email: 'admin@barberiaimperio.com',
      password_hash: passwordHash,
      phone: '+34 600 112 233',
      address: 'Gran Vía 42, Centro, Madrid',
      currency: 'EUR',
    },
  });

  console.log('Created Business:', business.name, `(slug: ${business.slug})`);

  // 2. Create Services
  const service1 = await prisma.service.create({
    data: {
      business_id: business.id,
      name: 'Corte Clásico & Degradado (Fade)',
      description: 'Corte a tijera o máquina con degradado suave, lavado capilar y peinado con cera mate.',
      duration_minutes: 45,
      price: 18.0,
    },
  });

  const service2 = await prisma.service.create({
    data: {
      business_id: business.id,
      name: 'Perfilado & Arreglo de Barba con Toalla Caliente',
      description: 'Ritual tradicional de afeitado con toalla caliente, aceites aromáticos y navaja desinfectada.',
      duration_minutes: 30,
      price: 14.0,
    },
  });

  const service3 = await prisma.service.create({
    data: {
      business_id: business.id,
      name: 'Servicio Completo: Corte + Barba + Tratamiento Facial',
      description: 'Nuestra experiencia estrella: corte premium, ritual completo de barba, toalla caliente y mascarilla purificante.',
      duration_minutes: 60,
      price: 30.0,
    },
  });

  const service4 = await prisma.service.create({
    data: {
      business_id: business.id,
      name: 'Camuflaje de Canas & Matiz Barba',
      description: 'Aplicación de pigmento orgánico de rápida acción para oscurecer canas de forma natural.',
      duration_minutes: 25,
      price: 12.0,
    },
  });

  console.log('Created 4 services');

  // 3. Create Staff / Specialists
  const defaultSchedule = {
    monday: { active: true, start: '09:00', end: '19:00', lunchStart: '14:00', lunchEnd: '15:00' },
    tuesday: { active: true, start: '09:00', end: '19:00', lunchStart: '14:00', lunchEnd: '15:00' },
    wednesday: { active: true, start: '09:00', end: '19:00', lunchStart: '14:00', lunchEnd: '15:00' },
    thursday: { active: true, start: '09:00', end: '19:00', lunchStart: '14:00', lunchEnd: '15:00' },
    friday: { active: true, start: '09:00', end: '20:00', lunchStart: '14:00', lunchEnd: '15:00' },
    saturday: { active: true, start: '10:00', end: '18:00', lunchStart: '14:00', lunchEnd: '15:00' },
    sunday: { active: false, start: '10:00', end: '14:00' },
  };

  const staff1 = await prisma.staff.create({
    data: {
      business_id: business.id,
      name: 'Carlos "El Mago" Mendoza',
      email: 'carlos@barberiaimperio.com',
      phone: '+34 611 223 344',
      avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
      schedule_json: JSON.stringify(defaultSchedule),
    },
  });

  const staff2 = await prisma.staff.create({
    data: {
      business_id: business.id,
      name: 'Mateo Silva',
      email: 'mateo@barberiaimperio.com',
      phone: '+34 622 334 455',
      avatar_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
      schedule_json: JSON.stringify(defaultSchedule),
    },
  });

  console.log('Created 2 staff members');

  // 4. Create sample appointments (today and upcoming)
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Past completed appointment
  const aptPastStart = new Date(today);
  aptPastStart.setHours(10, 0, 0, 0);
  const aptPastEnd = new Date(today);
  aptPastEnd.setHours(10, 45, 0, 0);

  const pastApt = await prisma.appointment.create({
    data: {
      business_id: business.id,
      service_id: service1.id,
      staff_id: staff1.id,
      client_name: 'Alejandro Morales',
      client_phone: '+34 699 001 122',
      client_email: 'alejandro.morales@example.com',
      start_time: aptPastStart,
      end_time: aptPastEnd,
      status: 'COMPLETED',
      confirmation_token: 'tok_past_' + Math.random().toString(36).substring(2, 10),
      notes: 'Cliente habitual, degradado número 1 al 0.',
    },
  });

  // Receipt for past appointment
  await prisma.receipt.create({
    data: {
      appointment_id: pastApt.id,
      receipt_number: 'REC-2026-0001',
      total_amount: 18.0,
      payment_method: 'CASH',
      status: 'PAID',
      issued_at: aptPastEnd,
    },
  });

  // Upcoming appointment 1 (CONFIRMED)
  const apt1Start = new Date(today);
  apt1Start.setHours(12, 0, 0, 0);
  const apt1End = new Date(today);
  apt1End.setHours(13, 0, 0, 0);

  await prisma.appointment.create({
    data: {
      business_id: business.id,
      service_id: service3.id,
      staff_id: staff1.id,
      client_name: 'David Navarro',
      client_phone: '+34 688 332 211',
      client_email: 'david.navarro@example.com',
      start_time: apt1Start,
      end_time: apt1End,
      status: 'CONFIRMED',
      confirmation_token: 'tok_conf_' + Math.random().toString(36).substring(2, 10),
      notes: 'Evento especial por la noche.',
    },
  });

  // Upcoming appointment 2 (PENDING reminder/confirmation)
  const apt2Start = new Date(today);
  apt2Start.setDate(today.getDate() + 1);
  apt2Start.setHours(16, 30, 0, 0);
  const apt2End = new Date(apt2Start);
  apt2End.setMinutes(apt2Start.getMinutes() + 30);

  await prisma.appointment.create({
    data: {
      business_id: business.id,
      service_id: service2.id,
      staff_id: staff2.id,
      client_name: 'Santiago Ruiz',
      client_phone: '+34 655 443 322',
      client_email: 'santiago.ruiz@example.com',
      start_time: apt2Start,
      end_time: apt2End,
      status: 'PENDING',
      confirmation_token: 'tok_magic_sample_123',
      notes: 'Primera visita a la barbería.',
    },
  });

  console.log('Database seeded successfully!');
  console.log('Credentials -> Email: admin@barberiaimperio.com | Password: Password123!');
  console.log('Public URL -> /b/barberia-imperio');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
