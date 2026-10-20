import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { ClientsController } from '../src/users/clients.controller';
import { UsersService } from '../src/users/users.service';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { UserRole } from '../src/users/schemas/user.schema';

describe('Client access administrative authorization', () => {
  let app: INestApplication<App>;
  const users = { findClients: jest.fn().mockResolvedValue([]), setBookingAccess: jest.fn().mockResolvedValue({ isBookingBlocked: true }), findOne: jest.fn().mockResolvedValue({ name: 'Client' }) };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [ClientsController], providers: [{ provide: UsersService, useValue: users }] })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.use((req: { headers: Record<string, string>; user?: { userId: string; role: string } }, _res: unknown, next: () => void) => {
      req.user = { userId: '507f1f77bcf86cd799439012', role: req.headers['x-test-role'] ?? UserRole.USER };
      next();
    });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  beforeEach(() => jest.clearAllMocks());
  afterAll(async () => {
    await app.close();
  });
  it.each([UserRole.USER, UserRole.BARBER])('denies client listing and access changes to %s', async (role) => {
    await request(app.getHttpServer()).get('/clients').set('x-test-role', role).expect(403);
    await request(app.getHttpServer()).patch('/clients/507f1f77bcf86cd799439011/booking-access').set('x-test-role', role).send({ blocked: true, reason: 'Reason' }).expect(403);
    expect(users.findClients).not.toHaveBeenCalled();
    expect(users.setBookingAccess).not.toHaveBeenCalled();
  });
  it('allows only the administrative client list', async () => {
    await request(app.getHttpServer()).get('/clients').set('x-test-role', UserRole.ADMIN).expect(200, []);
    expect(users.findClients).toHaveBeenCalledTimes(1);
    expect(users.findOne).not.toHaveBeenCalled();
  });
  it('uses the authenticated administrator and trims the reason', async () => {
    await request(app.getHttpServer()).patch('/clients/507f1f77bcf86cd799439011/booking-access').set('x-test-role', UserRole.ADMIN).send({ blocked: true, reason: '  No asistencia  ' }).expect(200);
    expect(users.setBookingAccess).toHaveBeenCalledWith('507f1f77bcf86cd799439011', true, 'No asistencia', '507f1f77bcf86cd799439012');
  });
  it.each([{ blocked: true }, { blocked: true, reason: '   ' }, { blocked: 'true', reason: 'Reason' }, { blocked: true, reason: 'x'.repeat(501) }, { blocked: true, reason: 'Reason', actorId: 'forged' }])(
    'rejects invalid or forged access request %j',
    async (body) => {
      await request(app.getHttpServer()).patch('/clients/507f1f77bcf86cd799439011/booking-access').set('x-test-role', UserRole.ADMIN).send(body).expect(400);
      expect(users.setBookingAccess).not.toHaveBeenCalled();
    },
  );
});
