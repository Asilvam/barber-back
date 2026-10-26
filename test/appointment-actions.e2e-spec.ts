import { ConflictException, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppointmentActionsController } from '../src/appointments/appointment-actions.controller';
import { AppointmentsService } from '../src/appointments/appointments.service';
import { AppointmentLinksService } from '../src/whatsapp/appointment-links.service';

describe('Public reservation actions over HTTP', () => {
  let app: INestApplication<App>;
  const id = '507f1f77bcf86cd799439013';
  const links = new AppointmentLinksService(new ConfigService({ WHATSAPP_ACTION_SECRET: 'test-action-secret-independent-123456789' }));
  let status: string;
  let date: string;
  const service = { findOne: jest.fn(), update: jest.fn() };
  const token = (action: 'accept' | 'reject' = 'accept') => links.create(id, action, '2028-01-01', '10:00');
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AppointmentActionsController],
      providers: [
        { provide: AppointmentLinksService, useValue: links },
        { provide: AppointmentsService, useValue: service },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    status = 'pending';
    date = '2028-01-01';
    service.findOne.mockImplementation(() => Promise.resolve({ status, date, timeSlot: '10:00', clientId: { name: '<script>bad()</script>' }, barberId: { name: 'QA' } }));
    service.update.mockImplementation((_id: string, dto: { status: string }) => {
      if (status !== 'pending') throw new ConflictException();
      status = dto.status;
      return Promise.resolve({ status });
    });
  });
  afterAll(async () => app.close());
  it('GET and HEAD never change status, escape HTML and prevent referrer/cache leaks', async () => {
    const link = token();
    const response = await request(app.getHttpServer()).get('/appointments/actions/review').query({ token: link }).expect(200);
    expect(response.text).toContain('&lt;script&gt;bad()&lt;/script&gt;');
    expect(response.text).toContain('Confirmar reserva');
    expect(response.text).toContain('role="status"');
    expect(response.text).not.toContain('Swal');
    expect(response.text).not.toContain('sweetalert2');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    await request(app.getHttpServer()).head('/appointments/actions/review').query({ token: link }).expect(200);
    expect(service.update).not.toHaveBeenCalled();
    expect(status).toBe('pending');
  });
  it.each(['accept', 'reject'] as const)('POST executes %s once and invalidates both links afterwards', async (action) => {
    await request(app.getHttpServer())
      .post('/appointments/actions/review')
      .send({ token: token(action) })
      .expect(201);
    expect(status).toBe(action === 'accept' ? 'confirmed' : 'cancelled');
    await request(app.getHttpServer())
      .post('/appointments/actions/review')
      .send({ token: token(action) })
      .expect(409);
    await request(app.getHttpServer())
      .post('/appointments/actions/review')
      .send({ token: token(action === 'accept' ? 'reject' : 'accept') })
      .expect(409);
    expect(service.update).toHaveBeenCalledTimes(1);
    expect(service.update).toHaveBeenCalledWith(id, expect.any(Object), 'admin', { date: '2028-01-01', timeSlot: '10:00' });
  });
  it('rejects invalid, missing and rescheduled links without updating a reservation', async () => {
    await request(app.getHttpServer()).post('/appointments/actions/review').send({ token: 'bad' }).expect(401);
    await request(app.getHttpServer()).post('/appointments/actions/review').send({}).expect(400);
    await request(app.getHttpServer()).post('/appointments/actions/review').send({ token: token(), action: 'reject' }).expect(400);
    date = '2028-01-02';
    await request(app.getHttpServer()).post('/appointments/actions/review').send({ token: token() }).expect(409);
    expect(service.update).not.toHaveBeenCalled();
  });
  it('does not expose the removed SweetAlert2 asset route', async () => {
    await request(app.getHttpServer()).get('/appointments/actions/sweetalert2.js').expect(404);
  });
});
