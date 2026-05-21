const fs = require('fs');
const path = require('path');
const axios = require('axios');
const mongoose = require('mongoose');

// 1. Read .env file
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const dotenvContent = fs.readFileSync(envPath, 'utf-8');
  dotenvContent.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim();
      process.env[key] = val;
    }
  });
}

const PORT = process.env.PORT || 3000;
const API_URL = `http://localhost:${PORT}`;
const MONGODB_URI = process.env.MONGODB_URI;

async function run() {
  console.log('=== INICIANDO PRUEBAS DE FLUJO ===');
  console.log(`API URL: ${API_URL}`);
  
  // Connect to MongoDB to promote admin
  console.log('Conectando a MongoDB Atlas...');
  await mongoose.connect(MONGODB_URI);
  console.log('Conectado a MongoDB.');

  const adminEmail = 'test_admin@example.com';
  const userEmail = 'test_user@example.com';
  const password = 'SecurePassword123!';

  // Clean up existing test users if any
  console.log('Limpiando usuarios de prueba anteriores...');
  const User = mongoose.connection.collection('users');
  await User.deleteMany({ email: { $in: [adminEmail, userEmail] } });

  // 1. Register test admin
  console.log('\n--- 1. Registrando Administrador de Prueba ---');
  let adminRegisterRes;
  try {
    adminRegisterRes = await axios.post(`${API_URL}/auth/register`, {
      name: 'Test Admin',
      email: adminEmail,
      password: password
    });
    console.log('Registro de admin local exitoso.');
  } catch (error) {
    console.error('Error al registrar admin:', error.response ? JSON.stringify(error.response.data) : error.message);
    process.exit(1);
  }

  // 2. Promote to admin in MongoDB
  console.log('Promoviendo usuario a rol ADMIN en la base de datos...');
  await User.updateOne({ email: adminEmail }, { $set: { role: 'admin' } });
  console.log('Usuario promovido con éxito.');

  // 3. Register test normal user
  console.log('\n--- 2. Registrando Usuario Normal de Prueba ---');
  let userRegisterRes;
  try {
    userRegisterRes = await axios.post(`${API_URL}/auth/register`, {
      name: 'Test User',
      email: userEmail,
      password: password
    });
    console.log('Registro de usuario normal local exitoso.');
  } catch (error) {
    console.error('Error al registrar usuario:', error.response ? JSON.stringify(error.response.data) : error.message);
    process.exit(1);
  }

  // 4. Log in both to get tokens
  console.log('\n--- 3. Iniciando Sesión para Obtener Tokens JWT ---');
  let adminToken, userToken;
  try {
    const adminLogin = await axios.post(`${API_URL}/auth/login`, {
      email: adminEmail,
      password: password
    });
    adminToken = adminLogin.data.token;
    console.log('Token de Admin obtenido con éxito.');

    const userLogin = await axios.post(`${API_URL}/auth/login`, {
      email: userEmail,
      password: password
    });
    userToken = userLogin.data.token;
    console.log('Token de Usuario obtenido con éxito.');
  } catch (error) {
    console.error('Error al iniciar sesión:', error.response ? JSON.stringify(error.response.data) : error.message);
    process.exit(1);
  }

  // 5. Test Normal User Restrictions (RBAC)
  console.log('\n--- 4. Probando Restricciones de Usuario Normal (RBAC) ---');
  
  // Try creating a barber as normal user (Should fail with 403)
  try {
    await axios.post(`${API_URL}/barbers`, {
      name: 'Barbero No Autorizado',
      email: 'noauth@barbershop.com',
      phone: '+1111111111',
      isActive: true
    }, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    console.log('❌ ERROR: ¡Un usuario normal pudo crear un barbero!');
  } catch (error) {
    console.log(`✅ ÉXITO: Usuario normal recibió HTTP ${error.response?.status} (${error.response?.data?.message}) al intentar crear un barbero.`);
  }

  // Try creating a schedule as normal user (Should fail with 403)
  try {
    await axios.post(`${API_URL}/barber-schedules`, {
      barberId: new mongoose.Types.ObjectId().toString(),
      date: '2026-06-01',
      isDayOff: false,
      workingHours: [{ start: '09:00', end: '17:00' }]
    }, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    console.log('❌ ERROR: ¡Un usuario normal pudo crear un horario!');
  } catch (error) {
    console.log(`✅ ÉXITO: Usuario normal recibió HTTP ${error.response?.status} (${error.response?.data?.message}) al intentar crear un horario.`);
  }

  // 6. Create 4 Barbers as Admin
  console.log('\n--- 5. Creando 4 Barberos Nuevos (Admin) ---');
  const barbersData = [
    { name: 'Sebastian Castro', email: 'sebastian@barbershop.com', phone: '+56911112222' },
    { name: 'Daniela Medina', email: 'daniela@barbershop.com', phone: '+56922223333' },
    { name: 'Alejandro Silva', email: 'alejandro@barbershop.com', phone: '+56933334444' },
    { name: 'Nicolas Jorquera', email: 'nicolas@barbershop.com', phone: '+56944445555' }
  ];

  const createdBarbers = [];
  for (const b of barbersData) {
    try {
      const res = await axios.post(`${API_URL}/barbers`, b, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      console.log(`✅ Barbero creado: ${res.data.name} (ID: ${res.data._id})`);
      createdBarbers.push(res.data);
    } catch (error) {
      console.error(`Error al crear barbero ${b.name}:`, error.response ? JSON.stringify(error.response.data) : error.message);
    }
  }

  // 7. Put schedules for the 4 barbers with 1-hour segments
  console.log('\n--- 6. Creando Horarios de 1 Hora para los Barberos (Admin) ---');
  const targetDate = '2026-06-01'; // Future date
  
  for (const barber of createdBarbers) {
    try {
      const scheduleData = {
        barberId: barber._id,
        date: targetDate,
        isDayOff: false,
        workingHours: [
          { start: '09:00', end: '13:00' }, // 9:00, 10:00, 11:00, 12:00
          { start: '14:00', end: '18:00' }  // 14:00, 15:00, 16:00, 17:00
        ],
        breakTimes: [
          { start: '13:00', end: '14:00' }
        ]
      };
      
      const res = await axios.post(`${API_URL}/barber-schedules`, scheduleData, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      console.log(`✅ Horario asignado para ${barber.name} el ${targetDate}:`);
      console.log(`   Trabajo: 09:00 - 13:00 y 14:00 - 18:00 | Almuerzo: 13:00 - 14:00`);
    } catch (error) {
      console.error(`Error al asignar horario para ${barber.name}:`, error.response ? JSON.stringify(error.response.data) : error.message);
    }
  }

  // 8. Consult available slots as normal user to verify
  console.log('\n--- 7. Consultando Disponibilidad de Barberos (Usuario Normal) ---');
  for (const barber of createdBarbers) {
    try {
      const res = await axios.get(`${API_URL}/appointments/availability`, {
        params: { barberId: barber._id, date: targetDate },
        headers: { Authorization: `Bearer ${userToken}` }
      });
      console.log(`✅ Disponibilidad de ${barber.name} el ${res.data.date}:`);
      console.log(`   Slots disponibles (1h): [${res.data.availableSlots.join(', ')}]`);
    } catch (error) {
      console.error(`Error al consultar disponibilidad para ${barber.name}:`, error.response ? JSON.stringify(error.response.data) : error.message);
    }
  }

  console.log('\n=== PRUEBAS COMPLETADAS CON ÉXITO ===');
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Error fatal durante la ejecución:', err);
  mongoose.disconnect();
});
