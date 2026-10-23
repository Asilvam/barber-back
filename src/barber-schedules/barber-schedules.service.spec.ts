import { ConflictException } from '@nestjs/common';
import { BarberSchedulesService } from './barber-schedules.service';

type Dependencies = ConstructorParameters<typeof BarberSchedulesService>;
const query = (value: unknown) => ({ select: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(value) });

describe('Removing one schedule block', () => {
  const id = '507f1f77bcf86cd799439013';
  const block = { start: '10:00', end: '11:00' };
  const schedule = { _id: id, barberId: '507f1f77bcf86cd799439012', date: '2026-10-24', isDayOff: false, workingHours: [block, { start: '11:00', end: '12:00' }], breakTimes: [] };
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-22T12:00:00Z')));
  afterEach(() => jest.restoreAllMocks());
  function setup(current: unknown = schedule, reservations: unknown[] = [], updated: unknown = schedule) {
    const schedules = { findById: jest.fn().mockReturnValue(query(current)), findOneAndUpdate: jest.fn().mockReturnValue(query(updated)) };
    const appointments = { find: jest.fn().mockReturnValue(query(reservations)) };
    const service = new BarberSchedulesService(schedules as unknown as Dependencies[0], {} as Dependencies[1], appointments as unknown as Dependencies[2]);
    return { service, schedules, appointments };
  }
  it('pulls only the selected interval and leaves other fields unchanged', async () => {
    const { service, schedules, appointments } = setup();
    await service.removeBlock(id, block);
    expect(schedules.findOneAndUpdate).toHaveBeenCalledWith(expect.objectContaining({ workingHours: schedule.workingHours }), { $pull: { workingHours: block } }, { returnDocument: 'after', runValidators: true });
    expect(appointments.find).toHaveBeenCalledWith({ barberId: schedule.barberId, date: schedule.date, status: { $in: ['pending', 'confirmed', 'completed'] } });
  });
  it.each(['09:30', '10:00', '10:30'])('rejects an overlapping reservation at %s', async (timeSlot) => {
    const { service, schedules } = setup(schedule, [{ timeSlot }]);
    await expect(service.removeBlock(id, block)).rejects.toThrow(ConflictException);
    expect(schedules.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it('allows adjacent reservations without treating them as overlaps', async () => {
    const { service } = setup(schedule, [{ timeSlot: '09:00' }, { timeSlot: '11:00' }]);
    await expect(service.removeBlock(id, block)).resolves.toBe(schedule);
  });
  it('rejects a block from the past or exactly at its start', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-24T13:00:00Z'));
    const { service, schedules } = setup();
    await expect(service.removeBlock(id, block)).rejects.toThrow('futuros');
    expect(schedules.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it('rejects a day off or an absent block', async () => {
    for (const current of [
      { ...schedule, isDayOff: true },
      { ...schedule, workingHours: [] },
    ]) {
      await expect(setup(current).service.removeBlock(id, block)).rejects.toThrow(ConflictException);
    }
  });
  it('rejects invalid IDs, reversed intervals and missing schedules', async () => {
    await expect(setup().service.removeBlock('invalid', block)).rejects.toThrow('válido');
    await expect(setup().service.removeBlock(id, { start: '11:00', end: '10:00' })).rejects.toThrow('válido');
    await expect(setup(null).service.removeBlock(id, block)).rejects.toThrow('no existe');
  });
  it('does not overwrite a concurrent change to working hours', async () => {
    await expect(setup(schedule, [], null).service.removeBlock(id, block)).rejects.toThrow('agenda cambió');
  });
});
