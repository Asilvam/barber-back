import { ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AppointmentsService } from './appointments.service';

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
    jest.useFakeTimers().setSystemTime(new Date('2026-07-16T15:30:00'));

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

  it('filters barber booked slots by pending/confirmed status and non-expired date/time', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-16T15:30:00'));

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
      status: { $in: ['pending', 'confirmed'] },
      date: '2026-07-23',
    });
    expect(futureFilter.barberId.$in[0]).toBeInstanceOf(Types.ObjectId);
    expect(futureFilter.barberId.$in[1]).toBe('507f1f77bcf86cd799439012');
    expect(todayFilter).toMatchObject({
      status: { $in: ['pending', 'confirmed'] },
      date: '2026-07-16',
      timeSlot: { $gte: '15:30' },
    });
    expect(expiredFilter).toBeNull();
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
});
