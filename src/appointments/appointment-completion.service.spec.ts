import { Types } from 'mongoose';
import { AppointmentCompletionService } from './appointment-completion.service';
import { getSantiagoAppointmentTimestamp } from '../common/time/santiago-time';

type AppointmentModel = ConstructorParameters<typeof AppointmentCompletionService>[0];
function setup(candidates: { _id: Types.ObjectId; date: string; timeSlot: string }[] = [], modifiedCount = 0) {
  const query = { select: jest.fn().mockReturnThis(), lean: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue(candidates) };
  const model = { find: jest.fn().mockReturnValue(query), bulkWrite: jest.fn().mockResolvedValue({ modifiedCount }) };
  return { model, service: new AppointmentCompletionService(model as unknown as AppointmentModel) };
}

describe('Automatic completion of confirmed reservations', () => {
  afterEach(() => jest.useRealTimers());
  it('completes exactly at 24 hours, but not a minute earlier', async () => {
    const id = new Types.ObjectId();
    const { service, model } = setup([{ _id: id, date: '2026-10-25', timeSlot: '12:00' }], 1);
    const deadline = getSantiagoAppointmentTimestamp('2026-10-25', '12:00') + 86400000;
    expect(await service.completeOverdueConfirmed(deadline - 60000)).toBe(0);
    expect(model.bulkWrite).not.toHaveBeenCalled();
    expect(await service.completeOverdueConfirmed(deadline)).toBe(1);
    expect(model.find).toHaveBeenLastCalledWith({ status: 'confirmed', date: { $lte: '2026-10-25' } });
    expect(model.bulkWrite).toHaveBeenCalledWith([{ updateOne: { filter: { _id: id, status: 'confirmed', date: '2026-10-25', timeSlot: '12:00' }, update: { $set: { status: 'completed' }, $unset: { activeClientKey: 1 } } } }], {
      ordered: false,
    });
  });
  it('uses 24 elapsed hours across daylight-saving changes in Santiago', async () => {
    const { service, model } = setup([{ _id: new Types.ObjectId(), date: '2026-09-05', timeSlot: '12:00' }], 1);
    const startsAt = getSantiagoAppointmentTimestamp('2026-09-05', '12:00');
    expect(await service.completeOverdueConfirmed(startsAt + 23 * 3600000)).toBe(0);
    expect(model.bulkWrite).not.toHaveBeenCalled();
    expect(await service.completeOverdueConfirmed(startsAt + 24 * 3600000)).toBe(1);
  });
  it('does nothing when no confirmed reservations qualify', async () => {
    const { service, model } = setup();
    expect(await service.completeOverdueConfirmed()).toBe(0);
    expect(model.bulkWrite).not.toHaveBeenCalled();
  });
  it('runs at startup and every minute and stops when the module closes', async () => {
    jest.useFakeTimers();
    const { service } = setup();
    const complete = jest.spyOn(service, 'completeOverdueConfirmed').mockResolvedValue(0);
    await service.onModuleInit();
    expect(complete).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(60000);
    expect(complete).toHaveBeenCalledTimes(2);
    service.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(60000);
    expect(complete).toHaveBeenCalledTimes(2);
  });
  it('recovers on the next run if the database is temporarily unavailable', async () => {
    jest.useFakeTimers();
    const { service } = setup();
    const complete = jest.spyOn(service, 'completeOverdueConfirmed').mockRejectedValueOnce(new Error('offline')).mockResolvedValue(0);
    await expect(service.onModuleInit()).resolves.toBeUndefined();
    await jest.advanceTimersByTimeAsync(60000);
    expect(complete).toHaveBeenCalledTimes(2);
    service.onModuleDestroy();
  });
});
