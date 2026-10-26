import { ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AppointmentsService } from './appointments.service';
import { UserRole } from '../users/schemas/user.schema';

type ServiceDependencies = ConstructorParameters<typeof AppointmentsService>;
type ModelMock = Partial<Record<'find' | 'findOneAndUpdate' | 'findOne' | 'findById' | 'updateMany', jest.Mock>>;

// These tests provide only the Mongoose methods exercised by each scenario.
function createService(appointments: ModelMock = {}, barbers: ModelMock = {}, users: ModelMock = {}, schedules: ModelMock = {}, email?: Partial<NonNullable<ServiceDependencies[4]>>) {
  appointments.updateMany ??= jest.fn().mockReturnValue(queryResolved({ modifiedCount: 0 }));
  return new AppointmentsService(
    appointments as unknown as ServiceDependencies[0],
    barbers as unknown as ServiceDependencies[1],
    users as unknown as ServiceDependencies[2],
    schedules as unknown as ServiceDependencies[3],
    email as ServiceDependencies[4],
  );
}

function constructorMock(implementation?: () => object) {
  return Object.assign(jest.fn().mockImplementation(implementation ?? (() => ({}))), {
    findOne: jest.fn(),
  });
}

function queryResolved<T>(value: T) {
  return {
    populate: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  };
}

describe('AppointmentsService security', () => {
  it.each(['cancelled', 'completed', 'no_show'])('archives %s without deleting the record or emailing', async (status) => {
    const id = '507f1f77bcf86cd799439013';
    const admin = '507f1f77bcf86cd799439014';
    const current = { _id: id, status };
    const archived = { ...current, archivedAt: new Date(), archivedBy: new Types.ObjectId(admin) };
    const model = { findById: jest.fn().mockReturnValue(queryResolved(current)), findOneAndUpdate: jest.fn().mockReturnValue(queryResolved(archived)) };
    const mail = { sendAppointmentCancelledEmail: jest.fn() };
    await expect(createService(model, {}, {}, {}, mail).remove(id, admin)).resolves.toBe(archived);
    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: id, status, archivedAt: { $exists: false } },
      { $set: { archivedAt: expect.any(Date) as unknown, archivedBy: new Types.ObjectId(admin) } },
      { returnDocument: 'after', runValidators: true },
    );
    expect(mail.sendAppointmentCancelledEmail).not.toHaveBeenCalled();
  });

  it.each(['pending', 'confirmed'])('rejects archiving an active %s reservation', async (status) => {
    const model = { findById: jest.fn().mockReturnValue(queryResolved({ status })), findOneAndUpdate: jest.fn() };
    await expect(createService(model).remove('507f1f77bcf86cd799439013', '507f1f77bcf86cd799439014')).rejects.toThrow(ConflictException);
    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects a repeated or concurrent archive', async () => {
    const model = { findById: jest.fn().mockReturnValue(queryResolved({ status: 'cancelled' })), findOneAndUpdate: jest.fn().mockReturnValue(queryResolved(null)) };
    await expect(createService(model).remove('507f1f77bcf86cd799439013', '507f1f77bcf86cd799439014')).rejects.toThrow(ConflictException);
  });

  it('excludes archived records by default and includes them for history', async () => {
    const model = { find: jest.fn().mockReturnValue(queryResolved([])) };
    const service = createService(model);
    await service.findAll();
    expect(model.find).toHaveBeenLastCalledWith({ archivedAt: { $exists: false } });
    await service.findAll(true);
    expect(model.find).toHaveBeenLastCalledWith({});
  });

  it('rejects new reservations for a blocked client even with an existing session', async () => {
    const model = { findOne: jest.fn() };
    const service = createService(model, {}, { findById: jest.fn().mockReturnValue(queryResolved({ role: UserRole.USER, isBookingBlocked: true })) });
    await expect(service.create('507f1f77bcf86cd799439011', { barberId: '507f1f77bcf86cd799439012', date: '2028-01-01', timeSlot: '10:00' })).rejects.toMatchObject({ response: { code: 'CLIENT_BOOKING_BLOCKED' } });
    expect(model.findOne).not.toHaveBeenCalled();
  });

  it.each([false, true])('notifies on confirmation and retains the saved state when email fails=%s', async (fails) => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-09T16:00:00Z'));
    const id = '507f1f77bcf86cd799439013';
    const current = { _id: new Types.ObjectId(id), clientId: new Types.ObjectId('507f1f77bcf86cd799439011'), barberId: new Types.ObjectId('507f1f77bcf86cd799439012'), date: '2026-08-10', timeSlot: '10:00', status: 'pending' };
    const updated = { ...current, status: 'confirmed', clientId: { name: 'Client', email: 'client@example.com' }, barberId: { name: 'Barber' } };
    const model = { findById: jest.fn().mockReturnValue(queryResolved(current)), findOne: jest.fn().mockReturnValue(queryResolved(null)), findOneAndUpdate: jest.fn().mockReturnValue(queryResolved(updated)) };
    const mail = { sendAppointmentConfirmedEmail: fails ? jest.fn().mockRejectedValue(new Error('offline')) : jest.fn().mockResolvedValue(undefined) };
    const service = createService(model, {}, { findById: jest.fn().mockReturnValue(queryResolved({ role: UserRole.USER })) }, {}, mail);
    await expect(service.update(id, { status: 'confirmed' }, 'admin')).resolves.toBe(updated);
    expect(model.findOneAndUpdate).toHaveBeenCalledWith({ _id: id, status: 'pending' }, expect.any(Object), expect.any(Object));
    expect(mail.sendAppointmentConfirmedEmail).toHaveBeenCalledTimes(1);
    expect(mail.sendAppointmentConfirmedEmail).toHaveBeenCalledWith({ to: 'client@example.com', clientName: 'Client', barberName: 'Barber', date: '2026-08-10', timeSlot: '10:00' });
  });

  it('does not send another email when saving an already confirmed appointment', async () => {
    const id = '507f1f77bcf86cd799439013';
    const current = { _id: new Types.ObjectId(id), clientId: new Types.ObjectId('507f1f77bcf86cd799439011'), barberId: new Types.ObjectId('507f1f77bcf86cd799439012'), date: '2020-08-10', timeSlot: '10:00', status: 'confirmed' };
    const mail = { sendAppointmentConfirmedEmail: jest.fn() };
    const service = createService({ findById: jest.fn().mockReturnValue(queryResolved(current)), findOneAndUpdate: jest.fn().mockReturnValue(queryResolved(current)) }, {}, {}, {}, mail);
    await service.update(id, { status: 'confirmed' }, 'admin');
    expect(mail.sendAppointmentConfirmedEmail).not.toHaveBeenCalled();
  });

  it('does not send confirmation when another request already changed pending status', async () => {
    const id = '507f1f77bcf86cd799439013';
    const current = { _id: new Types.ObjectId(id), clientId: new Types.ObjectId('507f1f77bcf86cd799439011'), barberId: new Types.ObjectId('507f1f77bcf86cd799439012'), date: '2020-08-10', timeSlot: '10:00', status: 'pending' };
    const mail = { sendAppointmentConfirmedEmail: jest.fn() };
    const service = createService({ findById: jest.fn().mockReturnValue(queryResolved(current)), findOneAndUpdate: jest.fn().mockReturnValue(queryResolved(null)) }, {}, {}, {}, mail);
    await expect(service.update(id, { status: 'confirmed' }, 'admin')).rejects.toThrow('cambió de estado');
    expect(mail.sendAppointmentConfirmedEmail).not.toHaveBeenCalled();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('filters active appointments by pending/confirmed status and non-expired date/time', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-16T19:30:00Z'));

    const service = createService({}, {}, {}, {});
    const filter = service['getNonExpiredActiveAppointmentFilter']('507f1f77bcf86cd799439011');

    expect(filter).toMatchObject({
      status: { $in: ['pending', 'confirmed'] },
      $or: [{ date: { $gt: '2026-07-16' } }, { date: '2026-07-16', timeSlot: { $gt: '15:30' } }],
    });
    expect(filter.clientId).toBeInstanceOf(Types.ObjectId);
  });

  it('filters barber booked slots by non-cancelled status and non-expired date/time', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-16T19:30:00Z'));

    const service = createService({}, {}, {}, {});
    const futureFilter = service['getNonExpiredBarberAppointmentFilter']('507f1f77bcf86cd799439012', '2026-07-23');
    const todayFilter = service['getNonExpiredBarberAppointmentFilter']('507f1f77bcf86cd799439012', '2026-07-16');
    const expiredFilter = service['getNonExpiredBarberAppointmentFilter']('507f1f77bcf86cd799439012', '2026-07-16', '10:00');

    expect(futureFilter).toMatchObject({
      status: { $in: ['pending', 'confirmed', 'completed', 'no_show'] },
      date: '2026-07-23',
    });
    expect(futureFilter!.barberId.$in[0]).toBeInstanceOf(Types.ObjectId);
    expect(futureFilter!.barberId.$in[1]).toBe('507f1f77bcf86cd799439012');
    expect(todayFilter).toMatchObject({
      status: { $in: ['pending', 'confirmed', 'completed', 'no_show'] },
      date: '2026-07-16',
      timeSlot: { $gte: '15:30' },
    });
    expect(expiredFilter).toBeNull();
  });

  it('keeps using the Chilean day when Heroku UTC has already advanced to tomorrow', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-17T02:30:00Z'));

    const service = createService({}, {}, {}, {});
    const filter = service['getNonExpiredActiveAppointmentFilter']('507f1f77bcf86cd799439011');

    expect(filter).toMatchObject({
      $or: [{ date: { $gt: '2026-07-16' } }, { date: '2026-07-16', timeSlot: { $gt: '22:30' } }],
    });
  });

  it('maps duplicate key on create to ConflictException (409)', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-09T16:00:00Z'));

    const duplicateError = { code: 11000 };
    const save = jest.fn().mockRejectedValue(duplicateError);

    const appointmentModel = constructorMock(() => ({ save }));
    appointmentModel.findOne = jest.fn().mockReturnValueOnce(queryResolved(null)).mockReturnValueOnce(queryResolved(null));

    const barberModel = {
      findById: jest.fn().mockReturnValue(queryResolved({ _id: '507f1f77bcf86cd799439012', isActive: true })),
    };
    const userModel = {
      findById: jest.fn().mockReturnValue(queryResolved({ _id: '507f1f77bcf86cd799439011' })),
    };
    const barberScheduleModel = {
      findOne: jest.fn().mockReturnValue(
        queryResolved({
          isDayOff: false,
          workingHours: [{ start: '09:00', end: '18:00' }],
          breakTimes: [],
        }),
      ),
    };

    const service = createService(appointmentModel, barberModel, userModel, barberScheduleModel);

    const creation = service.create('507f1f77bcf86cd799439011', {
      barberId: '507f1f77bcf86cd799439012',
      date: '2026-08-10',
      timeSlot: '10:00',
    });

    await expect(creation).rejects.toThrow(ConflictException);
    await expect(creation).rejects.toMatchObject({
      status: 409,
      message: 'This time slot is already occupied',
    });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('allows an admin to create multiple active appointments in available slots', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-09T16:00:00Z'));

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
    const appointmentModel = constructorMock(() => ({
      save: jest.fn().mockResolvedValue(savedAppointment),
    }));
    appointmentModel.findOne = jest.fn((filter: Record<string, unknown>) => queryResolved('clientId' in filter ? { _id: 'existing-active-appointment' } : null));

    const barberModel = {
      findById: jest.fn().mockReturnValue(queryResolved({ _id: barberId, name: 'Barber Test', isActive: true })),
    };
    const userModel = {
      findById: jest.fn().mockReturnValue(
        queryResolved({
          _id: clientId,
          name: 'Admin Test',
          email: 'admin@example.com',
          role: UserRole.ADMIN,
        }),
      ),
    };
    const barberScheduleModel = {
      findOne: jest.fn().mockReturnValue(
        queryResolved({
          isDayOff: false,
          workingHours: [{ start: '09:00', end: '18:00' }],
          breakTimes: [],
        }),
      ),
    };
    const service = createService(appointmentModel, barberModel, userModel, barberScheduleModel);

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
        barberId: expect.any(Object) as unknown,
        date: '2026-08-10',
        timeSlot: '10:00',
      }),
    );
  });

  it('still rejects an occupied slot when an admin creates an appointment', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-09T16:00:00Z'));

    const clientId = '507f1f77bcf86cd799439011';
    const barberId = '507f1f77bcf86cd799439012';
    const appointmentModel = constructorMock();
    appointmentModel.findOne = jest.fn().mockReturnValue(queryResolved({ _id: 'appointment-already-using-the-slot' }));

    const barberModel = {
      findById: jest.fn().mockReturnValue(queryResolved({ _id: barberId, name: 'Barber Test', isActive: true })),
    };
    const userModel = {
      findById: jest.fn().mockReturnValue(
        queryResolved({
          _id: clientId,
          name: 'Admin Test',
          email: 'admin@example.com',
          role: UserRole.ADMIN,
        }),
      ),
    };
    const barberScheduleModel = {
      findOne: jest.fn().mockReturnValue(
        queryResolved({
          isDayOff: false,
          workingHours: [{ start: '09:00', end: '18:00' }],
          breakTimes: [],
        }),
      ),
    };
    const service = createService(appointmentModel, barberModel, userModel, barberScheduleModel);

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

    const appointmentModel = {
      findById: jest.fn().mockReturnValue(
        queryResolved({
          _id: new Types.ObjectId('507f1f77bcf86cd799439013'),
          barberId: new Types.ObjectId('507f1f77bcf86cd799439012'),
          date: '2026-08-10',
          timeSlot: '10:00',
        }),
      ),
      findOneAndUpdate: jest.fn().mockReturnValue(chain),
    };

    const service = createService(appointmentModel, {}, {}, {});

    await expect(service.update('507f1f77bcf86cd799439013', {})).rejects.toThrow(ConflictException);
  });

  it('removes slotKey when an appointment is cancelled', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-09T16:00:00Z'));

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
        isActive: true,
      },
      clientId: {
        _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
        name: 'Client Test',
        email: 'client@example.com',
      },
      status: 'cancelled',
      cancelledBy: 'user',
      slotKey: undefined,
    };
    const appointmentModel = {
      findById: jest.fn().mockReturnValue(queryResolved(currentAppointment)),
      findOneAndUpdate: jest.fn().mockReturnValue(queryResolved(updatedAppointment)),
    };
    const emailService = {
      sendAppointmentCancelledEmail: jest.fn().mockRejectedValue(new Error('service unavailable')),
    };
    const service = createService(appointmentModel, {}, {}, {}, emailService);

    await expect(service.update(appointmentId, { status: 'cancelled' }, 'user')).resolves.toBe(updatedAppointment);
    expect(appointmentModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: appointmentId, status: currentAppointment.status },
      {
        $set: {
          status: 'cancelled',
          cancelledBy: 'user',
          cancelledAt: expect.any(Date) as unknown,
        },
        $unset: { slotKey: 1, activeClientKey: 1 },
      },
      { returnDocument: 'after', runValidators: true },
    );
    expect(emailService.sendAppointmentCancelledEmail).toHaveBeenCalledWith({
      to: 'client@example.com',
      clientName: 'Client Test',
      barberName: 'Barber Test',
      date: '2026-08-10',
      timeSlot: '10:00',
      cancelledBy: 'user',
    });
  });

  it('allows an admin to cancel an expired appointment and sends a cancellation email', async () => {
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
        isActive: true,
      },
      clientId: {
        _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
        name: 'Client Test',
        email: 'client@example.com',
      },
      status: 'cancelled',
      cancelledBy: 'admin',
      slotKey: undefined,
    };
    const appointmentModel = {
      findById: jest.fn().mockReturnValue(queryResolved(currentAppointment)),
      findOneAndUpdate: jest.fn().mockReturnValue(queryResolved(updatedAppointment)),
    };
    const emailService = {
      sendAppointmentCancelledEmail: jest.fn().mockResolvedValue(undefined),
    };
    const service = createService(appointmentModel, {}, {}, {}, emailService);

    await expect(service.update(appointmentId, { status: 'cancelled' }, 'admin')).resolves.toBe(updatedAppointment);
    expect(appointmentModel.findOneAndUpdate).toHaveBeenCalled();
    expect(emailService.sendAppointmentCancelledEmail).toHaveBeenCalledWith(expect.objectContaining({ cancelledBy: 'admin' }));
  });

  it('rejects every update after an appointment is cancelled', async () => {
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
    const appointmentModel = {
      findById: jest.fn().mockReturnValue(queryResolved(currentAppointment)),
      findOneAndUpdate: jest.fn(),
    };
    const service = createService(appointmentModel, {}, {}, {});

    await expect(service.update(appointmentId, { status: 'pending' })).rejects.toThrow('Una reserva cancelada es definitiva y no puede modificarse.');
    expect(appointmentModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ['pending', 'no_show', 'admin', '2026-08-10T14:00:00Z', 'no está permitido'],
    ['confirmed', 'no_show', 'admin', '2026-08-10T13:59:59Z', 'hora de inicio'],
    ['confirmed', 'no_show', 'user', '2026-08-10T14:00:00Z', 'Solo administración'],
    ['no_show', 'confirmed', 'admin', '2026-08-10T14:00:00Z', 'definitiva'],
    ['no_show', 'cancelled', 'admin', '2026-08-10T14:00:00Z', 'definitiva'],
    ['no_show', 'completed', 'admin', '2026-08-10T14:00:00Z', 'definitiva'],
    ['pending', 'completed', 'admin', '2026-08-10T14:00:00Z', 'no está permitido'],
    ['confirmed', 'completed', 'admin', '2026-08-10T13:59:59Z', 'hora de inicio'],
    ['confirmed', 'completed', 'user', '2026-08-10T14:00:00Z', 'Solo administración'],
    ['confirmed', 'pending', 'admin', '2026-08-10T14:00:00Z', 'no está permitido'],
    ['completed', 'confirmed', 'admin', '2026-08-10T14:00:00Z', 'completada es definitiva'],
    ['completed', 'cancelled', 'admin', '2026-08-10T14:00:00Z', 'completada es definitiva'],
    ['completed', 'completed', 'admin', '2026-08-10T14:00:00Z', 'completada es definitiva'],
  ] as const)('rejects %s → %s by %s at %s', async (from, to, actor, now, message) => {
    jest.useFakeTimers().setSystemTime(new Date(now));
    const id = '507f1f77bcf86cd799439013';
    const current = { _id: new Types.ObjectId(id), clientId: new Types.ObjectId('507f1f77bcf86cd799439011'), barberId: new Types.ObjectId('507f1f77bcf86cd799439012'), date: '2026-08-10', timeSlot: '10:00', status: from };
    const model = { findById: jest.fn().mockReturnValue(queryResolved(current)), findOneAndUpdate: jest.fn() };
    const service = createService(model);
    await expect(service.update(id, { status: to }, actor)).rejects.toThrow(message);
    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it.each(['2026-08-10T14:00:00Z', '2026-08-11T14:00:00Z'])('allows completing exactly at start or later (%s)', async (now) => {
    jest.useFakeTimers().setSystemTime(new Date(now));
    const id = '507f1f77bcf86cd799439013';
    const current = { _id: new Types.ObjectId(id), clientId: new Types.ObjectId('507f1f77bcf86cd799439011'), barberId: new Types.ObjectId('507f1f77bcf86cd799439012'), date: '2026-08-10', timeSlot: '10:00', status: 'confirmed' };
    const updated = { ...current, status: 'completed' };
    const model = { findById: jest.fn().mockReturnValue(queryResolved(current)), findOneAndUpdate: jest.fn().mockReturnValue(queryResolved(updated)) };
    await expect(createService(model).update(id, { status: 'completed' }, 'admin')).resolves.toBe(updated);
    expect(model.findOneAndUpdate).toHaveBeenCalledWith({ _id: id, status: 'confirmed' }, expect.any(Object), expect.any(Object));
  });

  it('rejects completing a reservation changed concurrently without overwriting its final state', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-11T14:00:00Z'));
    const id = '507f1f77bcf86cd799439013';
    const current = { _id: new Types.ObjectId(id), clientId: new Types.ObjectId('507f1f77bcf86cd799439011'), barberId: new Types.ObjectId('507f1f77bcf86cd799439012'), date: '2026-08-10', timeSlot: '10:00', status: 'confirmed' };
    const model = { findById: jest.fn().mockReturnValue(queryResolved(current)), findOneAndUpdate: jest.fn().mockReturnValue(queryResolved(null)) };
    await expect(createService(model).update(id, { status: 'completed' }, 'admin')).rejects.toThrow('cambió de estado');
  });

  it('rejects combining No asistió with a reschedule', async () => {
    const id = '507f1f77bcf86cd799439013';
    const model = { findById: jest.fn().mockReturnValue(queryResolved({ status: 'confirmed', date: '2026-08-10', timeSlot: '10:00', barberId: new Types.ObjectId('507f1f77bcf86cd799439012') })), findOneAndUpdate: jest.fn() };
    await expect(createService(model).update(id, { status: 'no_show', date: '2028-01-01' }, 'admin')).rejects.toThrow('No puedes cambiar');
    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('marks no_show at the start, keeps the occupied slot, releases the client key and sends no notifications', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-10T14:00:00Z'));
    const id = '507f1f77bcf86cd799439013';
    const barberId = '507f1f77bcf86cd799439012';
    const current = { _id: new Types.ObjectId(id), clientId: new Types.ObjectId('507f1f77bcf86cd799439011'), barberId: new Types.ObjectId(barberId), date: '2026-08-10', timeSlot: '10:00', status: 'confirmed' };
    const updated = { ...current, status: 'no_show' };
    const model = { findById: jest.fn().mockReturnValue(queryResolved(current)), findOneAndUpdate: jest.fn().mockReturnValue(queryResolved(updated)) };
    const email = { sendAppointmentConfirmedEmail: jest.fn(), sendAppointmentCancelledEmail: jest.fn() };
    await expect(createService(model, {}, {}, {}, email).update(id, { status: 'no_show' }, 'admin')).resolves.toBe(updated);
    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: id, status: 'confirmed' },
      { $set: { status: 'no_show', slotKey: `${barberId}:2026-08-10:10:00` }, $unset: { activeClientKey: 1 } },
      { returnDocument: 'after', runValidators: true },
    );
    expect(email.sendAppointmentConfirmedEmail).not.toHaveBeenCalled();
    expect(email.sendAppointmentCancelledEmail).not.toHaveBeenCalled();
  });

  it('keeps slotKey when an appointment is completed', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-10T14:00:00Z'));
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
    const appointmentModel = {
      findById: jest.fn().mockReturnValue(queryResolved(currentAppointment)),
      findOneAndUpdate: jest.fn().mockReturnValue(queryResolved(updatedAppointment)),
    };
    const service = createService(appointmentModel, {}, {}, {});

    await expect(service.update(appointmentId, { status: 'completed' }, 'admin')).resolves.toBe(updatedAppointment);
    expect(appointmentModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: appointmentId, status: currentAppointment.status },
      {
        $set: {
          status: 'completed',
          slotKey: `${barberId}:2026-08-10:10:00`,
        },
        $unset: { activeClientKey: 1 },
      },
      { returnDocument: 'after', runValidators: true },
    );
  });

  it('keeps a saved appointment when its confirmation email fails', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-09T16:00:00Z'));

    const savedAppointment = {
      _id: new Types.ObjectId('507f1f77bcf86cd799439013'),
      barberId: new Types.ObjectId('507f1f77bcf86cd799439012'),
      clientId: new Types.ObjectId('507f1f77bcf86cd799439011'),
      date: '2026-08-10',
      timeSlot: '10:00',
      status: 'pending',
    };
    const appointmentModel = constructorMock(() => ({
      save: jest.fn().mockResolvedValue(savedAppointment),
    }));
    appointmentModel.findOne = jest.fn().mockReturnValueOnce(queryResolved(null)).mockReturnValueOnce(queryResolved(null));

    const barberModel = {
      findById: jest.fn().mockReturnValue(
        queryResolved({
          _id: '507f1f77bcf86cd799439012',
          name: 'Barber Test',
          isActive: true,
        }),
      ),
    };
    const userModel = {
      findById: jest.fn().mockReturnValue(
        queryResolved({
          _id: '507f1f77bcf86cd799439011',
          name: 'Client Test',
          email: 'client@example.com',
        }),
      ),
    };
    const barberScheduleModel = {
      findOne: jest.fn().mockReturnValue(
        queryResolved({
          isDayOff: false,
          workingHours: [{ start: '09:00', end: '18:00' }],
          breakTimes: [],
        }),
      ),
    };
    const emailService = {
      sendAppointmentCreatedEmail: jest.fn().mockRejectedValue(new Error('service unavailable')),
    };
    const service = createService(appointmentModel, barberModel, userModel, barberScheduleModel, emailService);

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
      activeClientKey: '507f1f77bcf86cd799439011',
    });
    expect(emailService.sendAppointmentCreatedEmail).toHaveBeenCalledWith({
      to: 'client@example.com',
      clientName: 'Client Test',
      barberName: 'Barber Test',
      date: '2026-08-10',
      timeSlot: '10:00',
    });
  });
  it('offers only complete 60-minute blocks without crossing breaks', () => {
    const service = createService();
    expect(
      service['getScheduleSlots']({
        workingHours: [{ start: '09:00', end: '12:30' }],
        breakTimes: [{ start: '10:30', end: '11:00' }],
      }),
    ).toEqual(['09:00', '11:00']);
  });

  it.each(['09:30', '10:00', '12:00'])('rejects booking %s when it is off-grid, crosses a break or extends past closing', async (timeSlot) => {
    const service = createService(
      {},
      { findById: jest.fn().mockReturnValue(queryResolved({ name: 'Barber Test', isActive: true })) },
      {},
      {
        findOne: jest.fn().mockReturnValue(
          queryResolved({
            isDayOff: false,
            workingHours: [{ start: '09:00', end: '12:30' }],
            breakTimes: [{ start: '10:30', end: '11:00' }],
          }),
        ),
      },
    );
    await expect(service['validateBarberAvailabilityForSlot']('507f1f77bcf86cd799439012', '2026-08-10', timeSlot)).rejects.toThrow('Time slot is not an available 60-minute block');
  });

  it('accepts a complete block beginning exactly when a break ends', async () => {
    const barber = { name: 'Barber Test', isActive: true };
    const service = createService(
      {},
      { findById: jest.fn().mockReturnValue(queryResolved(barber)) },
      {},
      {
        findOne: jest.fn().mockReturnValue(
          queryResolved({
            isDayOff: false,
            workingHours: [{ start: '09:00', end: '12:00' }],
            breakTimes: [{ start: '10:00', end: '11:00' }],
          }),
        ),
      },
    );
    await expect(service['validateBarberAvailabilityForSlot']('507f1f77bcf86cd799439012', '2026-08-10', '11:00')).resolves.toBe(barber);
  });

  it('allows day seven across a month boundary and rejects day eight', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-30T15:00:00Z'));
    const service = createService();
    expect(() => service['validateClientBookingWindow']('2026-11-06')).not.toThrow();
    expect(() => service['validateClientBookingWindow']('2026-11-07')).toThrow('Solo puedes reservar hasta 7 días');
  });

  it('enforces the client booking window when creating through the API', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-30T15:00:00Z'));
    const service = createService(
      {},
      {},
      {
        findById: jest.fn().mockReturnValue(queryResolved({ role: UserRole.USER })),
      },
    );
    await expect(
      service.create('507f1f77bcf86cd799439011', {
        barberId: '507f1f77bcf86cd799439012',
        date: '2026-11-07',
        timeSlot: '10:00',
      }),
    ).rejects.toThrow('Solo puedes reservar hasta 7 días');
  });

  it.each([
    ['2026-08-09T21:59:59Z', true],
    ['2026-08-09T22:00:00Z', true],
    ['2026-08-09T22:00:01Z', false],
    ['2026-08-10T10:00:00Z', false],
  ])('enforces 12 hours of notice at %s', async (now, allowed) => {
    jest.useFakeTimers().setSystemTime(new Date(now));
    const current = {
      barberId: new Types.ObjectId('507f1f77bcf86cd799439012'),
      date: '2026-08-10',
      timeSlot: '06:00',
      status: 'pending',
    };
    const updated = { ...current, status: 'cancelled' };
    const model = {
      findById: jest.fn().mockReturnValue(queryResolved(current)),
      findOneAndUpdate: jest.fn().mockReturnValue(queryResolved(updated)),
    };
    const service = createService(model);
    const result = service.update('507f1f77bcf86cd799439013', { status: 'cancelled' }, 'user');
    if (allowed) {
      await expect(result).resolves.toBe(updated);
      expect(model.findOneAndUpdate).toHaveBeenCalledTimes(1);
    } else {
      await expect(result).rejects.toThrow('al menos 12 horas');
      expect(model.findOneAndUpdate).not.toHaveBeenCalled();
    }
  });
  it('rejects an inactive barber before querying its schedule', async () => {
    const schedules = { findOne: jest.fn() };
    const service = createService(
      {},
      {
        findById: jest.fn().mockReturnValue(queryResolved({ isActive: false })),
      },
      {},
      schedules,
    );
    await expect(service['validateBarberAvailabilityForSlot']('507f1f77bcf86cd799439012', '2026-08-10', '10:00')).rejects.toThrow('El barbero está inactivo');
    expect(schedules.findOne).not.toHaveBeenCalled();
  });
});
