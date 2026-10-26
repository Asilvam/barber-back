import { ConfigService } from '@nestjs/config';
import { AppointmentLinksService } from './appointment-links.service';

describe('Reservation action tokens', () => {
  const id = '507f1f77bcf86cd799439013';
  const service = new AppointmentLinksService(new ConfigService({ WHATSAPP_ACTION_SECRET: 'test-action-secret-independent-123456789' }));
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-10-25T12:00:00Z')));
  afterEach(() => jest.useRealTimers());
  it.each(['accept', 'reject'] as const)('scopes a signed token to %s, reservation and schedule', (action) => {
    const token = service.create(id, action, '2026-10-27', '10:00');
    expect(service.verify(token)).toMatchObject({ id, action, date: '2026-10-27', timeSlot: '10:00', purpose: 'appointment-action' });
  });
  it('rejects tampering, bad signatures and malformed tokens', () => {
    const token = service.create(id, 'accept', '2026-10-27', '10:00');
    const [payload, signature] = token.split('.');
    const forged = Buffer.from(Buffer.from(payload, 'base64url').toString().replace('accept', 'reject')).toString('base64url');
    for (const invalid of [`${forged}.${signature}`, 'bad', 'x.y.z', 'x.y', 'x'.repeat(2049)]) expect(() => service.verify(invalid)).toThrow('válido');
  });
  it('expires after 24 hours or at the appointment start, whichever comes first', () => {
    const dayToken = service.create(id, 'accept', '2026-10-27', '10:00');
    const nearToken = service.create(id, 'reject', '2026-10-25', '10:00');
    jest.setSystemTime(new Date('2026-10-25T13:00:00Z'));
    expect(() => service.verify(nearToken)).toThrow('venció');
    expect(service.verify(dayToken).id).toBe(id);
    jest.setSystemTime(new Date('2026-10-26T12:00:00Z'));
    expect(() => service.verify(dayToken)).toThrow('venció');
  });
  it('requires its own signing secret', () => {
    const disabled = new AppointmentLinksService(new ConfigService({ JWT_SECRET: 'unrelated' }));
    expect(() => disabled.create(id, 'accept', '2026-10-27', '10:00')).toThrow('habilitados');
  });
});
