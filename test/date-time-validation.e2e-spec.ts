import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppointmentsController } from '../src/appointments/appointments.controller';
import { AppointmentsService } from '../src/appointments/appointments.service';
import { BarberSchedulesController } from '../src/barber-schedules/barber-schedules.controller';
import { BarberSchedulesService } from '../src/barber-schedules/barber-schedules.service';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { UserRole } from '../src/users/schemas/user.schema';

describe('API calendar dates and canonical times', () => {
  let app: INestApplication<App>;
  const barberId = '507f1f77bcf86cd799439012';
  const appointmentId = '507f1f77bcf86cd799439013';
  const appointments = { create: jest.fn(), update: jest.fn(), getAvailableSlots: jest.fn() };
  const schedules = { create: jest.fn(), update: jest.fn(), getAvailability: jest.fn(), findOne: jest.fn() };
  const validAppointment = { barberId, date: '2028-02-29', timeSlot: '09:00' };
  const validSchedule = { barberId, date: '2028-02-29', workingHours: [{ start: '09:00', end: '18:00' }], breakTimes: [{ start: '13:00', end: '14:00' }] };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AppointmentsController, BarberSchedulesController],
      providers: [
        { provide: AppointmentsService, useValue: appointments },
        { provide: BarberSchedulesService, useValue: schedules },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.use((req: { user?: { userId: string; email: string; role: UserRole } }, _res: unknown, next: () => void) => {
      req.user = { userId: '507f1f77bcf86cd799439011', email: 'qa@example.test', role: UserRole.ADMIN };
      next();
    });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    for (const method of [...Object.values(appointments), ...Object.values(schedules)]) method.mockResolvedValue({ ok: true });
  });
  afterAll(async () => {
    await app.close();
  });

  it.each(['2026-02-29', '2026-02-31', '2026-04-31', '2026-13-01', '2026-00-10', '2026-01-00', '2026-1-01', '2026-01-01T09:00:00Z', ''])('rejects invalid appointment date %s before the service', async (date) => {
    await request(app.getHttpServer())
      .post('/appointments')
      .send({ ...validAppointment, date })
      .expect(400);
    expect(appointments.create).not.toHaveBeenCalled();
  });

  it.each(['9:00', '09:0', '24:00', '12:60', '09:00:00', ' 09:00', ''])('rejects noncanonical appointment time %s on create and update', async (timeSlot) => {
    await request(app.getHttpServer())
      .post('/appointments')
      .send({ ...validAppointment, timeSlot })
      .expect(400);
    await request(app.getHttpServer()).patch(`/appointments/${appointmentId}`).send({ timeSlot }).expect(400);
    expect(appointments.create).not.toHaveBeenCalled();
    expect(appointments.update).not.toHaveBeenCalled();
  });

  it('accepts leap-day reservations and a canonical midnight', async () => {
    await request(app.getHttpServer())
      .post('/appointments')
      .send({ ...validAppointment, timeSlot: '00:00' })
      .expect(201);
    expect(appointments.create).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid date on a partial reservation update', async () => {
    await request(app.getHttpServer()).patch(`/appointments/${appointmentId}`).send({ date: '2026-02-29' }).expect(400);
    expect(appointments.update).not.toHaveBeenCalled();
  });

  it.each(['workingHours', 'breakTimes'])('validates padded start and end times in nested %s', async (field) => {
    for (const endpoint of ['start', 'end']) {
      const intervals = [{ start: '09:00', end: '10:00', [endpoint]: '9:00' }];
      const payload = { ...validSchedule, [field]: intervals };
      await request(app.getHttpServer()).post('/barber-schedules').send(payload).expect(400);
      await request(app.getHttpServer())
        .patch(`/barber-schedules/${appointmentId}`)
        .send({ [field]: intervals })
        .expect(400);
    }
    expect(schedules.create).not.toHaveBeenCalled();
    expect(schedules.update).not.toHaveBeenCalled();
  });

  it('rejects impossible schedule dates on create and partial update', async () => {
    await request(app.getHttpServer())
      .post('/barber-schedules')
      .send({ ...validSchedule, date: '2026-04-31' })
      .expect(400);
    await request(app.getHttpServer()).patch(`/barber-schedules/${appointmentId}`).send({ date: '2026-04-31' }).expect(400);
    expect(schedules.create).not.toHaveBeenCalled();
    expect(schedules.update).not.toHaveBeenCalled();
  });

  it('accepts leap-day schedules with canonical working hours and breaks', async () => {
    await request(app.getHttpServer()).post('/barber-schedules').send(validSchedule).expect(201);
    expect(schedules.create).toHaveBeenCalledTimes(1);
  });

  it('validates availability dates and rejects missing or repeated query values', async () => {
    for (const query of [{ barberId, date: '2026-02-31' }, { barberId }, { barberId, date: ['2028-02-29', '2028-03-01'] }]) {
      await request(app.getHttpServer()).get('/appointments/availability').query(query).expect(400);
    }
    expect(appointments.getAvailableSlots).not.toHaveBeenCalled();
    await request(app.getHttpServer()).get('/appointments/availability').query({ barberId, date: '2028-02-29' }).expect(200);
    expect(appointments.getAvailableSlots).toHaveBeenCalledWith(barberId, '2028-02-29');
  });

  it('validates range query dates on the static availability route', async () => {
    for (const query of [{ start: '2026-02-31', end: '2026-03-01' }, { start: '2028-02-29', end: '2028-02-30' }, { start: '2028-02-29' }]) {
      await request(app.getHttpServer()).get('/barber-schedules/availability').query(query).expect(400);
    }
    expect(schedules.getAvailability).not.toHaveBeenCalled();
    expect(schedules.findOne).not.toHaveBeenCalled();
    await request(app.getHttpServer()).get('/barber-schedules/availability').query({ start: '2028-02-29', end: '2028-03-01' }).expect(200);
    expect(schedules.getAvailability).toHaveBeenCalledWith('2028-02-29', '2028-03-01');
  });
});
