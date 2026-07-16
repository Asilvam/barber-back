import { ForbiddenException } from '@nestjs/common';
import { AppointmentsController } from './appointments.controller';
import { UserRole } from '../users/schemas/user.schema';

describe('AppointmentsController security', () => {
  const appointmentsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    getAvailableSlots: jest.fn(),
  };

  const controller = new AppointmentsController(appointmentsService as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('denies access to appointment owned by another user', async () => {
    appointmentsService.findOne.mockResolvedValue({ id: 'a1', clientId: { _id: 'owner-id' } });

    await expect(
      controller.findOne('a1', {
        user: { userId: 'other-user-id', role: UserRole.USER, email: 'u@test.com' },
      } as any),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows owner to access own appointment', async () => {
    const appointment = { id: 'a1', clientId: { _id: 'owner-id' } };
    appointmentsService.findOne.mockResolvedValue(appointment);

    await expect(
      controller.findOne('a1', {
        user: { userId: 'owner-id', role: UserRole.USER, email: 'u@test.com' },
      } as any),
    ).resolves.toEqual(appointment);
  });

  it('allows admin to access any appointment', async () => {
    const appointment = { id: 'a1', clientId: { _id: 'owner-id' } };
    appointmentsService.findOne.mockResolvedValue(appointment);

    await expect(
      controller.findOne('a1', {
        user: { userId: 'admin-id', role: UserRole.ADMIN, email: 'admin@test.com' },
      } as any),
    ).resolves.toEqual(appointment);
  });
});
