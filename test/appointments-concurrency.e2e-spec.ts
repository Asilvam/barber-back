import { AppointmentCompletionService } from '../src/appointments/appointment-completion.service';
import { ConfigService } from '@nestjs/config';
import { AppointmentLinksService } from '../src/whatsapp/appointment-links.service';
import { AppointmentActionsController } from '../src/appointments/appointment-actions.controller';
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { ConflictException, Logger } from '@nestjs/common';
import { Connection, ConnectionStates, createConnection, Model, Types } from 'mongoose';
import { BarberSchedulesService } from '../src/barber-schedules/barber-schedules.service';
import { AppointmentsService } from '../src/appointments/appointments.service';
import { Appointment, AppointmentDocument, AppointmentSchema } from '../src/appointments/entities/appointment.schema';
import { Barber, BarberSchema } from '../src/barbers/entities/barber.schema';
import { BarberSchedule, BarberScheduleSchema } from '../src/barber-schedules/entities/barber-schedule.schema';
import { User, UserRole, UserSchema } from '../src/users/schemas/user.schema';
import { getSantiagoAppointmentTimestamp, getSantiagoDateTime } from '../src/common/time/santiago-time';

// Uses only uniquely named temporary collections, never application collections.
describe('Appointment concurrency against MongoDB', () => {
  const prefix = `qa_booking_${randomUUID().replaceAll('-', '')}_`;
  let connection: Connection;
  let appointments: Model<Appointment>;
  let users: Model<User>;
  let barbers: Model<Barber>;
  let schedules: Model<BarberSchedule>;
  let service: AppointmentsService;
  let client: string;
  let otherClient: string;
  let admin: string;
  let barber: string;
  let date: string;

  beforeAll(async () => {
    const uri = process.env.BARBER_TEST_MONGODB_URI ?? process.env.MONGODB_URI;
    if (!uri) throw new Error('A MongoDB test connection is required');
    Logger.overrideLogger(false);
    connection = await createConnection(uri, { serverSelectionTimeoutMS: 10000 }).asPromise();
    appointments = connection.model(Appointment.name, AppointmentSchema.clone(), `${prefix}appointments`);
    users = connection.model(User.name, UserSchema.clone(), `${prefix}users`);
    barbers = connection.model(Barber.name, BarberSchema.clone(), `${prefix}barbers`);
    schedules = connection.model(BarberSchedule.name, BarberScheduleSchema.clone(), `${prefix}schedules`);
    await Promise.all([appointments.init(), users.init(), barbers.init(), schedules.init()]);
  }, 30000);

  beforeEach(async () => {
    const day = new Date(`${getSantiagoDateTime().today}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + 2);
    date = day.toISOString().slice(0, 10);
    const people = await users.create([
      { name: 'QA client', email: 'client@example.test', googleId: 'qa-client', role: UserRole.USER },
      { name: 'QA other', email: 'other@example.test', googleId: 'qa-other', role: UserRole.USER },
      { name: 'QA admin', email: 'admin@example.test', googleId: 'qa-admin', role: UserRole.ADMIN },
    ]);
    [client, otherClient, admin] = people.map((person) => person._id.toString());
    const employee = await barbers.create({ name: 'QA barber', email: 'barber@example.test', phone: '000000000', isActive: true });
    barber = employee._id.toString();
    await schedules.create({ barberId: barber, date, workingHours: [{ start: '09:00', end: '18:00' }], breakTimes: [] });
    const configured = await schedules.findOne({ barberId: barber, date }).lean().exec();
    expect(configured).not.toBeNull();
    service = new AppointmentsService(appointments, barbers, users, schedules);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (connection?.readyState === ConnectionStates.connected) await Promise.all([appointments.deleteMany({}), users.deleteMany({}), barbers.deleteMany({}), schedules.deleteMany({})]);
  });

  afterAll(async () => {
    if (!connection) return;
    try {
      for (const collection of Object.values(connection.collections)) {
        if (!collection.name.startsWith(prefix)) throw new Error('Refusing to remove a non-test collection');
        await collection.drop();
      }
    } finally {
      await connection.close();
    }
  });

  function book(clientId: string, timeSlot: string) {
    return service.create(clientId, { barberId: barber, date, timeSlot }) as Promise<AppointmentDocument>;
  }

  it.each(['cancelled', 'completed'] as const)('archives a %s record while retaining client history in MongoDB', async (status) => {
    const first = await book(client, '09:00');
    if (status === 'completed') {
      await service.update(first._id.toString(), { status: 'confirmed' }, 'admin');
      jest.spyOn(Date, 'now').mockReturnValue(getSantiagoAppointmentTimestamp(date, '09:00'));
    }
    await service.update(first._id.toString(), { status }, 'admin');
    const archived = await service.remove(first._id.toString(), admin);
    expect(archived.archivedBy?.toString()).toBe(admin);
    expect(archived.archivedAt).toBeInstanceOf(Date);
    expect(archived.status).toBe(status);
    expect(await appointments.countDocuments()).toBe(1);
    expect(await service.findAll()).toHaveLength(0);
    const history = await service.findAll(true);
    expect(history).toHaveLength(1);
    expect(history[0]._id.toString()).toBe(first._id.toString());
    await expect(service.remove(first._id.toString(), admin)).rejects.toThrow(ConflictException);
  });

  it('removes just one free block and prevents new reservations in it', async () => {
    const configured = await schedules
      .findOneAndUpdate(
        { barberId: barber, date },
        {
          $set: {
            workingHours: [
              { start: '09:00', end: '10:00' },
              { start: '10:00', end: '11:00' },
            ],
          },
        },
        { returnDocument: 'after' },
      )
      .exec();
    const scheduleService = new BarberSchedulesService(schedules, barbers, appointments);
    const updated = await scheduleService.removeBlock(configured!._id.toString(), { start: '09:00', end: '10:00' });
    expect(updated.workingHours.map(({ start, end }) => ({ start, end }))).toEqual([{ start: '10:00', end: '11:00' }]);
    expect(await schedules.countDocuments()).toBe(1);
    await expect(book(client, '09:00')).rejects.toThrow('not an available');
    await expect(book(client, '10:00')).resolves.toBeDefined();
  });

  it('requires cancellation before removing an occupied block and preserves its history', async () => {
    await schedules.updateOne(
      { barberId: barber, date },
      {
        $set: {
          workingHours: [
            { start: '09:00', end: '10:00' },
            { start: '10:00', end: '11:00' },
          ],
        },
      },
    );
    const configured = await schedules.findOne({ barberId: barber, date }).exec();
    const first = await book(client, '09:00');
    const scheduleService = new BarberSchedulesService(schedules, barbers, appointments);
    await expect(scheduleService.removeBlock(configured!._id.toString(), { start: '09:00', end: '10:00' })).rejects.toThrow('cancelarla');
    await service.update(first._id.toString(), { status: 'cancelled' }, 'admin');
    await scheduleService.removeBlock(configured!._id.toString(), { start: '09:00', end: '10:00' });
    expect((await appointments.findById(first._id).exec())?.status).toBe('cancelled');
    expect(await appointments.countDocuments()).toBe(1);
  });

  it.each(['block', 'day'])('cancels and emails before removing an occupied future %s', async (mode) => {
    await schedules.updateOne(
      { barberId: barber, date },
      {
        $set: {
          workingHours: [
            { start: '09:00', end: '10:00' },
            { start: '10:00', end: '11:00' },
          ],
        },
      },
    );
    const configured = await schedules.findOne({ barberId: barber, date }).exec();
    const first = await book(client, '09:00');
    await service.update(first._id.toString(), { status: 'confirmed' }, 'admin');
    const email = { sendAppointmentCancelledEmail: jest.fn().mockResolvedValue(undefined) };
    const cancellationService = new AppointmentsService(appointments, barbers, users, schedules, email as unknown as ConstructorParameters<typeof AppointmentsService>[4]);
    const scheduleService = new BarberSchedulesService(schedules, barbers, appointments, cancellationService);
    if (mode === 'block') {
      await scheduleService.removeBlock(configured!._id.toString(), { start: '09:00', end: '10:00', cancelReservations: true });
      expect((await schedules.findById(configured!._id).exec())?.workingHours).toHaveLength(1);
    } else {
      await scheduleService.remove(configured!._id.toString(), true);
      expect(await schedules.countDocuments()).toBe(0);
    }
    const retained = await appointments.findById(first._id).select('+slotKey').exec();
    expect(retained?.status).toBe('cancelled');
    expect(retained?.cancelledBy).toBe('admin');
    expect(retained?.slotKey).toBeUndefined();
    expect(email.sendAppointmentCancelledEmail).toHaveBeenCalledTimes(1);
    expect(email.sendAppointmentCancelledEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'client@example.test', cancelledBy: 'admin' }));
  });

  it('notifies WhatsApp once only after a successful booking', async () => {
    const whatsapp = { notifyAppointment: jest.fn().mockResolvedValue(undefined) };
    service = new AppointmentsService(appointments, barbers, users, schedules, undefined, whatsapp as unknown as ConstructorParameters<typeof AppointmentsService>[5]);
    const first = await book(client, '09:00');
    expect(whatsapp.notifyAppointment).toHaveBeenCalledWith(expect.objectContaining({ id: first._id.toString(), date, timeSlot: '09:00' }));
    await expect(book(client, '10:00')).rejects.toThrow('reserva activa');
    expect(whatsapp.notifyAppointment).toHaveBeenCalledTimes(1);
  });

  it('allows exactly one of competing accept/reject links and sends one matching email', async () => {
    const first = await book(client, '09:00');
    const email = { sendAppointmentConfirmedEmail: jest.fn().mockResolvedValue(undefined), sendAppointmentCancelledEmail: jest.fn().mockResolvedValue(undefined) };
    const actionService = new AppointmentsService(appointments, barbers, users, schedules, email as unknown as ConstructorParameters<typeof AppointmentsService>[4]);
    const links = new AppointmentLinksService(new ConfigService({ WHATSAPP_ACTION_SECRET: 'independent-action-test-secret-123456789' }));
    const controller = new AppointmentActionsController(links, actionService);
    const accept = links.create(first._id.toString(), 'accept', date, '09:00');
    const reject = links.create(first._id.toString(), 'reject', date, '09:00');
    const results = await Promise.allSettled([controller.execute({ token: accept }), controller.execute({ token: reject })]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const saved = await appointments.findById(first._id).exec();
    expect(['confirmed', 'cancelled']).toContain(saved?.status);
    expect(email.sendAppointmentConfirmedEmail.mock.calls.length + email.sendAppointmentCancelledEmail.mock.calls.length).toBe(1);
    await expect(controller.execute({ token: accept })).rejects.toThrow(ConflictException);
    await expect(controller.execute({ token: reject })).rejects.toThrow(ConflictException);
    expect(email.sendAppointmentConfirmedEmail.mock.calls.length + email.sendAppointmentCancelledEmail.mock.calls.length).toBe(1);
  });

  it('automatically completes only confirmed reservations at least 24 hours old, once', async () => {
    const now = getSantiagoAppointmentTimestamp('2026-10-26', '12:00');
    const data = [
      { status: 'confirmed', timeSlot: '11:59', activeClientKey: client },
      { status: 'confirmed', timeSlot: '12:00' },
      { status: 'confirmed', timeSlot: '12:01' },
      { status: 'pending', timeSlot: '09:00' },
      { status: 'cancelled', timeSlot: '10:00' },
      { status: 'completed', timeSlot: '11:00' },
    ];
    const records = await appointments.create(data.map((item) => ({ ...item, clientId: client, barberId: barber, date: '2026-10-25', ...(item.status !== 'cancelled' ? { slotKey: `${barber}:2026-10-25:${item.timeSlot}` } : {}) })));
    const completion = new AppointmentCompletionService(appointments);
    expect(await completion.completeOverdueConfirmed(now)).toBe(2);
    expect(await completion.completeOverdueConfirmed(now)).toBe(0);
    for (let index = 0; index < records.length; index++) {
      const saved = await appointments.findById(records[index]._id).select('+activeClientKey').exec();
      expect(saved?.status).toBe(index < 2 ? 'completed' : data[index].status);
      if (index < 2) {
        expect(saved?.activeClientKey).toBeUndefined();
        expect(saved?.slotKey).toBe(records[index].slotKey);
      }
    }
    expect(await appointments.countDocuments()).toBe(6);
  });

  it('retains no_show in client history and never auto-completes or reactivates it', async () => {
    const first = await book(client, '09:00');
    await service.update(first._id.toString(), { status: 'confirmed' }, 'admin');
    const start = getSantiagoAppointmentTimestamp(date, '09:00');
    jest.spyOn(Date, 'now').mockReturnValue(start);
    await service.update(first._id.toString(), { status: 'no_show' }, 'admin');
    const missed = await appointments.findById(first._id).select('+activeClientKey').exec();
    expect(missed?.status).toBe('no_show');
    expect(missed?.slotKey).toBe(first.slotKey);
    expect(missed?.activeClientKey).toBeUndefined();
    await new AppointmentCompletionService(appointments).completeOverdueConfirmed(start + 48 * 3600000);
    expect((await appointments.findById(first._id).exec())?.status).toBe('no_show');
    await expect(service.update(first._id.toString(), { status: 'completed' }, 'admin')).rejects.toThrow('definitiva');
    await service.remove(first._id.toString(), admin);
    const history = await service.findAll(true);
    expect(history).toHaveLength(1);
    expect(history[0].status).toBe('no_show');
    expect(history[0].archivedAt).toBeDefined();
  });

  it('adds a block to the existing day, preserves reservations and prevents concurrent overlap', async () => {
    const configured = await schedules.findOneAndUpdate({ barberId: barber, date }, { $set: { workingHours: [{ start: '09:00', end: '10:00' }], breakTimes: [{ start: '13:00', end: '14:00' }] } }, { returnDocument: 'after' }).exec();
    const first = await book(client, '09:00');
    const scheduleService = new BarberSchedulesService(schedules, barbers, appointments);
    const results = await Promise.allSettled([scheduleService.addBlock(configured!._id.toString(), { start: '10:00', end: '12:00' }), scheduleService.addBlock(configured!._id.toString(), { start: '11:00', end: '13:00' })]);
    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((item) => item.status === 'rejected')).toHaveLength(1);
    const saved = await schedules.findById(configured!._id).exec();
    expect(saved?.workingHours).toHaveLength(2);
    expect(saved?.breakTimes).toHaveLength(1);
    expect((await appointments.findById(first._id).exec())?.status).toBe('pending');
    expect(await schedules.countDocuments()).toBe(1);
    const added = saved!.workingHours.find((range) => range.start !== '09:00')!;
    await expect(book(otherClient, added.start)).resolves.toBeDefined();
    await expect(scheduleService.addBlock(configured!._id.toString(), { start: '13:00', end: '14:00' })).rejects.toThrow('descanso');
  });

  // Force both requests past the preflight read before either can insert.
  function synchronizeValidation() {
    const original = service['validateBarberAvailabilityForSlot'];
    const validate = original.bind(service) as typeof original;
    let arrivals = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    jest.spyOn(service as unknown as { validateBarberAvailabilityForSlot: typeof validate }, 'validateBarberAvailabilityForSlot').mockImplementation(async (...args: Parameters<typeof validate>) => {
      const result = await validate(...args);
      arrivals += 1;
      if (arrivals === 2) release();
      await gate;
      return result;
    });
  }

  function expectOneConflict(results: PromiseSettledResult<unknown>[]) {
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const failures = results.filter((result) => result.status === 'rejected');
    expect(failures).toHaveLength(1);
    const reason: unknown = failures[0].reason;
    expect(reason).toBeInstanceOf(ConflictException);
    return reason as ConflictException;
  }

  it('allows only one of two simultaneous bookings for the same client in different slots', async () => {
    synchronizeValidation();
    const conflict = expectOneConflict(await Promise.allSettled([book(client, '09:00'), book(client, '10:00')]));
    expect(conflict.getStatus()).toBe(409);
    expect(conflict.message).toContain('Ya tienes una reserva activa');
    expect(await appointments.countDocuments({ clientId: new Types.ObjectId(client) })).toBe(1);
  });

  it('preserves slot uniqueness when two different clients book simultaneously', async () => {
    synchronizeValidation();
    const conflict = expectOneConflict(await Promise.allSettled([book(client, '09:00'), book(otherClient, '09:00')]));
    expect(conflict.message).toBe('This time slot is already occupied');
    expect(await appointments.countDocuments()).toBe(1);
  });

  it('allows simultaneous admin reservations in different slots', async () => {
    synchronizeValidation();
    const results = await Promise.allSettled([book(admin, '09:00'), book(admin, '10:00')]);
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    expect(await appointments.countDocuments({ activeClientKey: { $exists: true } })).toBe(0);
  });

  it('releases the client and slot keys when the client cancels', async () => {
    const first = await book(client, '09:00');
    await service.update(first._id.toString(), { status: 'cancelled' }, 'user');
    await book(client, '10:00');
    await book(otherClient, '09:00');
    expect(await appointments.countDocuments({ status: 'pending' })).toBe(2);
    const cancelled = await appointments.findById(first._id).select('+activeClientKey').exec();
    expect(cancelled?.activeClientKey).toBeUndefined();
    expect(cancelled?.slotKey).toBeUndefined();
  });

  it('releases the client key when completed but preserves the occupied slot', async () => {
    const first = await book(client, '09:00');
    await service.update(first._id.toString(), { status: 'confirmed' }, 'admin');
    jest.spyOn(Date, 'now').mockReturnValue(getSantiagoAppointmentTimestamp(date, '09:00'));
    await service.update(first._id.toString(), { status: 'completed' }, 'admin');
    await book(client, '10:00');
    await expect(book(otherClient, '09:00')).rejects.toThrow('This time slot is already occupied');
  });

  it('allows only one concurrent final transition from confirmed', async () => {
    const first = await book(client, '09:00');
    await service.update(first._id.toString(), { status: 'confirmed' }, 'admin');
    jest.spyOn(Date, 'now').mockReturnValue(getSantiagoAppointmentTimestamp(date, '09:00'));
    const results = await Promise.allSettled([service.update(first._id.toString(), { status: 'completed' }, 'admin'), service.update(first._id.toString(), { status: 'cancelled' }, 'admin')]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const final = await appointments.findById(first._id).exec();
    expect(['completed', 'cancelled']).toContain(final?.status);
    await expect(service.update(first._id.toString(), { status: 'confirmed' }, 'admin')).rejects.toThrow('definitiva');
  });

  it('releases the old client key exactly at the start time without deleting history', async () => {
    const first = await book(client, '09:00');
    jest.spyOn(service as unknown as { getAppointmentCutoff: () => ReturnType<typeof getSantiagoDateTime> }, 'getAppointmentCutoff').mockReturnValue({ today: date, currentTime: '09:00' });
    await book(client, '10:00');
    expect(await appointments.countDocuments({ clientId: new Types.ObjectId(client) })).toBe(2);
    const previous = await appointments.findById(first._id).select('+activeClientKey').exec();
    expect(previous?.activeClientKey).toBeUndefined();
    expect(previous?.status).toBe('pending');
  });

  it('rejects reactivating a completed reservation even when another is active', async () => {
    const first = await book(client, '09:00');
    await service.update(first._id.toString(), { status: 'confirmed' }, 'admin');
    jest.spyOn(Date, 'now').mockReturnValue(getSantiagoAppointmentTimestamp(date, '09:00'));
    await service.update(first._id.toString(), { status: 'completed' }, 'admin');
    await book(client, '10:00');
    await expect(service.update(first._id.toString(), { status: 'confirmed' }, 'admin')).rejects.toThrow('Una reserva completada es definitiva');
  });

  it('keeps the client key when an admin reschedules the active reservation', async () => {
    const first = await book(client, '09:00');
    await service.update(first._id.toString(), { timeSlot: '11:00' }, 'admin');
    const updated = await appointments.findById(first._id).select('+activeClientKey').exec();
    expect(updated?.activeClientKey).toBe(client);
    expect(updated?.timeSlot).toBe('11:00');
    await expect(book(client, '12:00')).rejects.toThrow('Ya tienes una reserva activa');
  });
  it.each(['client', 'admin'])('rejects new reservations with an inactive barber for %s', async (actor) => {
    await barbers.updateOne({ _id: barber }, { $set: { isActive: false } });
    await expect(book(actor === 'admin' ? admin : client, '09:00')).rejects.toThrow('El barbero está inactivo');
    expect(await appointments.countDocuments()).toBe(0);
  });

  it('rejects moving a reservation to an inactive barber without modifying it', async () => {
    const first = await book(client, '09:00');
    const inactive = await barbers.create({ name: 'QA inactive', email: 'inactive@example.test', phone: '000000000', isActive: false });
    await expect(service.update(first._id.toString(), { barberId: inactive._id.toString() }, 'admin')).rejects.toThrow('El barbero está inactivo');
    const unchanged = await appointments.findById(first._id).exec();
    expect(unchanged?.barberId).toEqual(first.barberId);
    expect(unchanged?.timeSlot).toBe('09:00');
    expect(unchanged?.status).toBe('pending');
  });

  it('preserves existing reservations but rejects changing their time after deactivation', async () => {
    const first = await book(client, '09:00');
    await barbers.updateOne({ _id: barber }, { $set: { isActive: false } });
    await expect(service.update(first._id.toString(), { timeSlot: '10:00' }, 'admin')).rejects.toThrow('El barbero está inactivo');
    // Existing reservations can still be managed without changing their schedule.
    await service.update(first._id.toString(), { status: 'confirmed' }, 'admin');
    const preserved = await appointments.findById(first._id).exec();
    expect(preserved?.status).toBe('confirmed');
    expect(preserved?.timeSlot).toBe('09:00');
    expect(await appointments.countDocuments()).toBe(1);
  });
});
