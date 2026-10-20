import { BUSINESS_TIME_ZONE, getSantiagoDateTime, getSantiagoAppointmentTimestamp, minutesToTime, timeToMinutes } from './santiago-time';

describe('Santiago business time', () => {
  it('uses the previous Chilean calendar day while the UTC day has already changed in winter', () => {
    expect(getSantiagoDateTime(new Date('2026-07-17T02:30:00Z'))).toEqual({
      today: '2026-07-16',
      currentTime: '22:30',
    });
  });

  it('applies Chilean daylight saving time in summer', () => {
    expect(getSantiagoDateTime(new Date('2026-01-15T03:30:00Z'))).toEqual({
      today: '2026-01-15',
      currentTime: '00:30',
    });
  });

  it('uses the canonical IANA zone and converts schedule times without Date objects', () => {
    expect(BUSINESS_TIME_ZONE).toBe('America/Santiago');
    expect(timeToMinutes('14:30')).toBe(870);
    expect(minutesToTime(870)).toBe('14:30');
  });
  it.each([
    ['2026-08-10', '06:00', '2026-08-10T10:00:00Z'],
    ['2026-01-15', '06:00', '2026-01-15T09:00:00Z'],
    ['2026-09-06', '12:00', '2026-09-06T15:00:00Z'],
    ['2026-04-05', '12:00', '2026-04-05T16:00:00Z'],
  ])('resolves %s %s using Santiago DST rules', (date, time, expected) => {
    expect(getSantiagoAppointmentTimestamp(date, time)).toBe(Date.parse(expected));
  });
});
