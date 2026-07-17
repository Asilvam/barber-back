import {
  BUSINESS_TIME_ZONE,
  getSantiagoDateTime,
  minutesToTime,
  timeToMinutes,
} from './santiago-time';

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
});
