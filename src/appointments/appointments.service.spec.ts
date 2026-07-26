import { ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AppointmentsService } from './appointments.service';
import { UserRole } from '../users/schemas/user.schema';

function queryResolved<T>(value: T) {
  return {
    populate: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  };
}

describe('AppointmentsService security', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('filters active appointments by pending/confirmed status and non-expired date/time', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-16T19:30:00Z'));

    const service = new AppointmentsService({} as any, {} as any, {} as any, {} as any);
    const filter = (service as any).getNonExpiredActiveAppointmentFilter('507f1f77bcf86cd799439011');

    expect(filter).toMatchObject({
      status: { $in: ['pending', 'confirmed'] },
      $or: [
        { date: { $gt: '2026-07-16' } },
        { date: '2026-07-16', timeSlot: { $gte: '15:30' } },
      ],
    });
    expect(filter.clientId).toBeInstanceOf(Types.ObjectId);
  });

  it('filters barber booked slots by non-cancelled status and non-expired date/time', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-16T19:30:00Z'));

    const service = new AppointmentsService({} as any, {} as any, {} as any, {} as any);
    const futureFilter = (service as any).getNonExpiredBarberAppointmentFilter(
      '507f1f77bcf86cd799439012',
      '2026-07-23',
    );
    const todayFilter = (service as any).getNonExpiredBarberAppointmentFilter(
      '507f1f77bcf86cd799439012',
      '2026-07-16',
    );
    const expiredFilter = (service as any).getNonExpiredBarberAppointmentFilter(
      '507f1f77bcf86cd799439012',
      '2026-07-16',
      '10:00',
    );

    expect(futureFilter).toMatchObject({
      status: { $in: ['pending', 'confirmed', 'completed'] },
      date: '2026-07-23',
    });
    expect(futureFilter.barberId.$in[0]).toBeInstanceOf(Types.ObjectId);
    expect(futureFilter.barberId.$in[1]).toBe('507f1f77bcf86cd799439012');
    expect(todayFilter).toMatchObject({
      status: { $in: ['pending', 'confirmed', 'completed'] },
      date: '2026-07-16',
      timeSlot: { $gte: '15:30' },
    });
    expect(expiredFilter).toBeNull();
  });

  it('keeps using the Chilean day when Heroku UTC has already advanced to tomorrow', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-17T02:30:00Z'));

    const service = new AppointmentsService({} as any, {} as any, {} as any, {} as any);
    const filter = (service as any).getNonExpiredActiveAppointmentFilter('507f1f77bcf86cd799439011');

    expect(filter).toMatchObject({
      $or: [
        { date: { $gt: '2026-07-16' } },
        { date: '2026-07-16', timeSlot: { $gte: '22:30' } },
      ],
    });
  });

  it('maps duplicate key on create to ConflictException (409)', async () => {
    const duplicateError = { code: 11000 };
    const save = jest.fn().mockRejectedValue(duplicateError);

    const appointmentModel: any = jest.fn().mockImplementation(() => ({ save }));
    appointmentModel.findOne = jest
      .fn()
      .mockReturnValueOnce(queryResolved(null))
      .mockReturnValueOnce(queryResolved(null));

    const barberModel: any = {
      findById: jest.fn().mockReturnValue(queryResolved({ _id: '507f1f77bcf86cd799439012' })),
    };
    const userModel: any = {
      findById: jest.fn().mockReturnValue(queryResolved({ _id: '507f1f77bcf86cd799439011' })),
    };
    const barberScheduleModel: any = {
      findOne: jest.fn().mockReturnValue(
        queryResolved({
          isDayOff: false,
          workingHours: [{ start: '09:00', end: '18:00' }],
          breakTimes: [],
        }),
      ),
    };

    const service = new AppointmentsService(appointmentModel, barberModel, userModel, barberScheduleModel);

    await expect(
      service.create('507f1f77bcf86cd799439011', {
        barberId: '507f1f77bcf86cd799439012',
        date: '2026-08-10',
        timeSlot: '10:00',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('allows an admin to create multiple active appointments in available slots', async () => {
    const clientId = '507f1f77bcf86cd799439011';
    const barberId = '507f1f77bcf86cd799439012';
    const savedAppointment = {
      _id: new Types.ObjectId('507f1f77bcf86cd799439013'),
      barberId: new Types.ObjectId(barberId),
      clientId: new Types.ObjectId(clientId),
      date: '2026-08-10',
      timeSlot: '10:00',
      status: 'pending',
    };
    const appointmentModel: any = jest.fn().mockImplementation(() => ({
      save: jest.fn().mockResolvedValue(savedAppointment),
    }));
    appointmentModel.findOne = jest.fn((filter: Record<string, unknown>) =>
      queryResolved('clientId' in filter ? { _id: 'existing-active-appointment' } : null),
    );

    const barberModel: any = {
      findById: jest.fn().mockReturnValue(
        queryResolved({ _id: barberId, name: 'Barber Test' }),
      ),
    };
    const userModel: any = {
      findById: jest.fn().mockReturnValue(
        queryResolved({
          _id: clientId,
          name: 'Admin Test',
          email: 'admin@example.com',
          role: UserRole.ADMIN,
        }),
      ),
    };
    const barberScheduleModel: any = {
      findOne: jest.fn().mockReturnValue(
        queryResolved({
          isDayOff: false,
          workingHours: [{ start: '09:00', end: '18:00' }],
          breakTimes: [],
        }),
      ),
    };
    const service = new AppointmentsService(
      appointmentModel,
      barberModel,
      userModel,
      barberScheduleModel,
    );

    await expect(
      service.create(clientId, {
        barberId,
        date: '2026-08-10',
        timeSlot: '10:00',
      }),
    ).resolves.toBe(savedAppointment);
    expect(appointmentModel.findOne).toHaveBeenCalledTimes(1);
    expect(appointmentModel.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        barberId: expect.any(Object),
        date: '2026-08-10',
        timeSlot: '10:00',
      }),
    );
  });

  it('still rejects an occupied slot when an admin creates an appointment', async () => {
    const clientId = '507f1f77bcf86cd799439011';
    const barberId = '507f1f77bcf86cd799439012';
    const appointmentModel: any = jest.fn();
    appointmentModel.findOne = jest.fn().mockReturnValue(
      queryResolved({ _id: 'appointment-already-using-the-slot' }),
    );

    const barberModel: any = {
      findById: jest.fn().mockReturnValue(
        queryResolved({ _id: barberId, name: 'Barber Test' }),
      ),
    };
    const userModel: any = {
      findById: jest.fn().mockReturnValue(
        queryResolved({
          _id: clientId,
          name: 'Admin Test',
          email: 'admin@example.com',
          role: UserRole.ADMIN,
        }),
      ),
    };
    const barberScheduleModel: any = {
      findOne: jest.fn().mockReturnValue(
        queryResolved({
          isDayOff: false,
          workingHours: [{ start: '09:00', end: '18:00' }],
          breakTimes: [],
        }),
      ),
    };
    const service = new AppointmentsService(
      appointmentModel,
      barberModel,
      userModel,
      barberScheduleModel,
    );

    await expect(
      service.create(clientId, {
        barberId,
        date: '2026-08-10',
        timeSlot: '10:00',
      }),
    ).rejects.toThrow('This time slot is already occupied');
    expect(appointmentModel).not.toHaveBeenCalled();
  });

  it('maps duplicate key on update to ConflictException (409)', async () => {
    const duplicateError = { code: 11000 };
    const chain = {
      populate: jest.fn().mockReturnThis(),
      exec: jest.fn().mockRejectedValue(duplicateError),
    };

    const appointmentModel: any = {
      findById: jest.fn().mockReturnValue(
        queryResolved({
          _id: new Types.ObjectId('507f1f77bcf86cd799439013'),
          barberId: new Types.ObjectId('507f1f77bcf86cd799439012'),
          date: '2026-08-10',
          timeSlot: '10:00',
        }),
      ),
      findByIdAndUpdate: jest.fn().mockReturnValue(chain),
    };

    const service = new AppointmentsService(appointmentModel as any, {} as any, {} as any, {} as any);

    await expect(service.update('507f1f77bcf86cd799439013', {})).rejects.toThrow(ConflictException);
  });

  it('removes slotKey when an appointment is cancelled', async () => {
    const appointmentId = '507f1f77bcf86cd799439013';
    const currentAppointment = {
      _id: new Types.ObjectId(appointmentId),
      barberId: new Types.ObjectId('507f1f77bcf86cd799439012'),
      clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
      date: '2026-08-10',
      timeSlot: '10:00',
      status: 'pending',
      slotKey: '507f1f77bcf86cd799439012:2026-08-10:10:00',
    };
    const updatedAppointment = {
      ...currentAppointment,
      barberId: {
        _id: new Types.ObjectId('507f1f77bcf86cd799439012'),
        name: 'Barber Test',
      },
      clientId: {
        _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
        name: 'Client Test',
        email: 'client@example.com',
      },
      status: 'cancelled',
      slotKey: undefined,
    };
    const appointmentModel: any = {
      findById: jest.fn().mockReturnValue(queryResolved(currentAppointment)),
      findByIdAndUpdate: jest.fn().mockReturnValue(queryResolved(updatedAppointment)),
    };
    const emailService: any = {
      sendAppointmentCancelledEmail: jest.fn().mockRejectedValue(new Error('service unavailable')),
    };
    const service = new AppointmentsService(appointmentModel, {} as any, {} as any, {} as any, emailService);

    await expect(service.update(appointmentId, { status: 'cancelled' })).resolves.toBe(updatedAppointment);
    expect(appointmentModel.findByIdAndUpdate).toHaveBeenCalledWith(
      appointmentId,
      {
        $set: { status: 'cancelled' },
        $unset: { slotKey: 1 },
      },
      { returnDocument: 'after', runValidators: true },
    );
    expect(emailService.sendAppointmentCancelledEmail).toHaveBeenCalledWith({
      to: 'client@example.com',
      clientName: 'Client Test',
      barberName: 'Barber Test',
      date: '2026-08-10',
      timeSlot: '10:00',
    });
  });

  it('updates an expired appointment without sending a cancellation email', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-19T16:00:00Z'));
    const appointmentId = '507f1f77bcf86cd799439013';
    const currentAppointment = {
      _id: new Types.ObjectId(appointmentId),
      barberId: new Types.ObjectId('507f1f77bcf86cd799439012'),
      clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
      date: '2026-07-18',
      timeSlot: '10:00',
      status: 'confirmed',
      slotKey: '507f1f77bcf86cd799439012:2026-07-18:10:00',
    };
    const updatedAppointment = {
      ...currentAppointment,
      barberId: {
        _id: new Types.ObjectId('507f1f77bcf86cd799439012'),
        name: 'Barber Test',
      },
      clientId: {
        _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
        name: 'Client Test',
        email: 'client@example.com',
      },
      status: 'cancelled',
      slotKey: undefined,
    };
    const appointmentModel: any = {
      findById: jest.fn().mockReturnValue(queryResolved(currentAppointment)),
      findByIdAndUpdate: jest.fn().mockReturnValue(queryResolved(updatedAppointment)),
    };
    const emailService: any = {
      sendAppointmentCancelledEmail: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AppointmentsService(appointmentModel, {} as any, {} as any, {} as any, emailService);

    await expect(service.update(appointmentId, { status: 'cancelled' })).resolves.toBe(updatedAppointment);
    expect(appointmentModel.findByIdAndUpdate).toHaveBeenCalled();
    expect(emailService.sendAppointmentCancelledEmail).not.toHaveBeenCalled();
  });

  it('restores slotKey when a cancelled appointment is reactivated', async () => {
    const appointmentId = '507f1f77bcf86cd799439013';
    const barberId = '507f1f77bcf86cd799439012';
    const currentAppointment = {
      _id: new Types.ObjectId(appointmentId),
      barberId: new Types.ObjectId(barberId),
      clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
      date: '2026-08-10',
      timeSlot: '10:00',
      status: 'cancelled',
    };
    const updatedAppointment = {
      ...currentAppointment,
      status: 'pending',
      slotKey: `${barberId}:2026-08-10:10:00`,
    };
    const appointmentModel: any = {
      findById: jest.fn().mockReturnValue(queryResolved(currentAppointment)),
      findOne: jest.fn().mockReturnValue(queryResolved(null)),
      findByIdAndUpdate: jest.fn().mockReturnValue(queryResolved(updatedAppointment)),
    };
    const barberModel: any = {
      findById: jest.fn().mockReturnValue(queryResolved({ _id: barberId, name: 'Barber Test' })),
    };
    const barberScheduleModel: any = {
      findOne: jest.fn().mockReturnValue(
        queryResolved({
          isDayOff: false,
          workingHours: [{ start: '09:00', end: '18:00' }],
          breakTimes: [],
        }),
      ),
    };
    const service = new AppointmentsService(appointmentModel, barberModel, {} as any, barberScheduleModel);

    await expect(service.update(appointmentId, { status: 'pending' })).resolves.toBe(updatedAppointment);
    expect(appointmentModel.findByIdAndUpdate).toHaveBeenCalledWith(
      appointmentId,
      {
        $set: {
          status: 'pending',
          slotKey: `${barberId}:2026-08-10:10:00`,
        },
      },
      { returnDocument: 'after', runValidators: true },
    );
  });

  it('keeps slotKey when an appointment is completed', async () => {
    const appointmentId = '507f1f77bcf86cd799439013';
    const barberId = '507f1f77bcf86cd799439012';
    const currentAppointment = {
      _id: new Types.ObjectId(appointmentId),
      barberId: new Types.ObjectId(barberId),
      clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
      date: '2026-08-10',
      timeSlot: '10:00',
      status: 'confirmed',
      slotKey: `${barberId}:2026-08-10:10:00`,
    };
    const updatedAppointment = { ...currentAppointment, status: 'completed' };
    const appointmentModel: any = {
      findById: jest.fn().mockReturnValue(queryResolved(currentAppointment)),
      findByIdAndUpdate: jest.fn().mockReturnValue(queryResolved(updatedAppointment)),
    };
    const service = new AppointmentsService(appointmentModel, {} as any, {} as any, {} as any);

    await expect(service.update(appointmentId, { status: 'completed' })).resolves.toBe(updatedAppointment);
    expect(appointmentModel.findByIdAndUpdate).toHaveBeenCalledWith(
      appointmentId,
      {
        $set: {
          status: 'completed',
          slotKey: `${barberId}:2026-08-10:10:00`,
        },
      },
      { returnDocument: 'after', runValidators: true },
    );
  });

  it('keeps a saved appointment when its confirmation email fails', async () => {
    const savedAppointment = {
      _id: new Types.ObjectId('507f1f77bcf86cd799439013'),
      barberId: new Types.ObjectId('507f1f77bcf86cd799439012'),
      clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
      date: '2026-08-10',
      timeSlot: '10:00',
      status: 'pending',
    };
    const appointmentModel: any = jest.fn().mockImplementation(() => ({
      save: jest.fn().mockResolvedValue(savedAppointment),
    }));
    appointmentModel.findOne = jest.fn().mockReturnValueOnce(queryResolved(null)).mockReturnValueOnce(queryResolved(null));

    const barberModel: any = {
      findById: jest.fn().mockReturnValue(
        queryResolved({
          _id: '507f1f77bcf86cd799439012',
          name: 'Barber Test',
        }),
      ),
    };
    const userModel: any = {
      findById: jest.fn().mockReturnValue(
        queryResolved({
          _id: '507f1f77bcf86cd799439011',
          name: 'Client Test',
          email: 'client@example.com',
        }),
      ),
    };
    const barberScheduleModel: any = {
      findOne: jest.fn().mockReturnValue(
        queryResolved({
          isDayOff: false,
          workingHours: [{ start: '09:00', end: '18:00' }],
          breakTimes: [],
        }),
      ),
    };
    const emailService: any = {
      sendAppointmentCreatedEmail: jest.fn().mockRejectedValue(new Error('service unavailable')),
    };
    const service = new AppointmentsService(appointmentModel, barberModel, userModel, barberScheduleModel, emailService);

    await expect(
      service.create('507f1f77bcf86cd799439011', {
        barberId: '507f1f77bcf86cd799439012',
        date: '2026-08-10',
        timeSlot: '10:00',
      }),
    ).resolves.toBe(savedAppointment);
    expect(appointmentModel).toHaveBeenCalledWith({
      barberId: '507f1f77bcf86cd799439012',
      clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
      date: '2026-08-10',
      timeSlot: '10:00',
      slotKey: '507f1f77bcf86cd799439012:2026-08-10:10:00',
    });
    expect(emailService.sendAppointmentCreatedEmail).toHaveBeenCalledWith({
      to: 'client@example.com',
      clientName: 'Client Test',
      barberName: 'Barber Test',
      date: '2026-08-10',
      timeSlot: '10:00',
    });
  });
});
