import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { EmailService } from './email.service';

describe('EmailService', () => {
  const values: Record<string, string | number> = {
    EMAIL_SERVICE_URL: 'http://localhost:3001/',
    EMAIL_SERVICE_API_KEY: 'shared-key',
    EMAIL_SERVICE_TIMEOUT_MS: 2500,
    EMAIL_FROM_NAME: 'Barber Test',
  };
  const config = {
    getOrThrow: jest.fn((key: string) => values[key]),
    get: jest.fn((key: string, fallback?: string | number) => values[key] ?? fallback),
  } as unknown as ConfigService;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calls the email microservice with the shared internal key', async () => {
    const post = jest.spyOn(axios, 'post').mockResolvedValue({});
    const service = new EmailService(config);

    await service.sendEmail({
      to: 'client@example.com',
      subject: 'Test',
      html: '<p>Test</p>',
      fromName: 'Barber Test',
    });

    expect(post).toHaveBeenCalledWith(
      'http://localhost:3001/email/send',
      {
        to: 'client@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
        fromName: 'Barber Test',
      },
      {
        headers: { 'x-internal-api-key': 'shared-key' },
        timeout: 2500,
      },
    );
  });

  it('surfaces failures returned by the email microservice', async () => {
    jest.spyOn(axios, 'post').mockRejectedValue({
      isAxiosError: true,
      message: 'Request failed with status code 503',
      response: { status: 503 },
    });
    const service = new EmailService(config);

    await expect(
      service.sendEmail({
        to: 'client@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      }),
    ).rejects.toThrow('Email service request failed: 503 Request failed with status code 503');
  });

  it('sends confirmed details and escapes client and barber names', async () => {
    const service = new EmailService(config);
    const send = jest.spyOn(service, 'sendEmail').mockResolvedValue(undefined);
    await service.sendAppointmentConfirmedEmail({ to: 'client@example.com', clientName: '<Client>', barberName: 'Barber & Co', date: '2026-08-10', timeSlot: '10:00' });
    const message = send.mock.calls[0][0];
    expect(message.subject).toBe('Tu reserva está confirmada');
    expect(message.html).toContain('&lt;Client&gt;');
    expect(message.html).toContain('Barber &amp; Co');
    expect(message.html).toContain('10-08-2026');
    expect(message.html).toContain('10:00');
    expect(message.html).toContain('CONFIRMADA');
  });

  it('builds an escaped pending-approval appointment email', async () => {
    const service = new EmailService(config);
    const sendEmail = jest.spyOn(service, 'sendEmail').mockResolvedValue();

    await service.sendAppointmentCreatedEmail({
      to: 'client@example.com',
      clientName: '<Client>',
      barberName: 'Tom & Jerry',
      date: '2026-08-10',
      timeSlot: '10:00',
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const message = sendEmail.mock.calls[0][0];
    expect(message.to).toBe('client@example.com');
    expect(message.subject).toBe('Reserva pendiente de aprobación');
    expect(message.fromName).toBe('Barber Test');
    expect(message.html).toContain('&lt;Client&gt;');
    expect(message.html).toContain('Tom &amp; Jerry');
    expect(message.html).toContain('10-08-2026');
    expect(message.html).toContain('Tu reserva está pendiente de aprobación');
    expect(message.html).toContain('PENDIENTE DE APROBACIÓN');
    expect(message.html).toContain('background-color: #1b191d');
    expect(message.html).toContain('background-color: #c91470');
    expect(message.html).toContain('background-color: #f9deeb');
    expect(message.html).toContain('color: #941251');
    expect(message.html).toContain('background-color: #f5f3f4');
    expect(message.html).toContain('FECHA');
    expect(message.html).toContain('HORA');
    expect(message.html).toContain('BARBERO');
    expect(message.html).not.toContain('#2f6b5f');
    expect(message.html).not.toContain('#e7f2ee');
    expect(message.html).not.toContain('#245448');
  });

  it('confirms cancellation by the client in the email', async () => {
    const service = new EmailService(config);
    const sendEmail = jest.spyOn(service, 'sendEmail').mockResolvedValue();
    await service.sendAppointmentCancelledEmail({ to: 'client@example.com', clientName: 'Client', barberName: 'Barber', date: '2026-08-10', timeSlot: '10:00', cancelledBy: 'user' });
    expect(sendEmail.mock.calls[0][0].subject).toBe('Cancelaste tu reserva');
    expect(sendEmail.mock.calls[0][0].html).toContain('Tu reserva fue cancelada correctamente.');
  });

  it('builds an appointment cancellation email', async () => {
    const service = new EmailService(config);
    const sendEmail = jest.spyOn(service, 'sendEmail').mockResolvedValue();

    await service.sendAppointmentCancelledEmail({
      to: 'client@example.com',
      clientName: 'Client Test',
      barberName: 'Barber Test',
      date: '2026-08-10',
      timeSlot: '10:00',
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const message = sendEmail.mock.calls[0][0];
    expect(message.subject).toBe('La barbería canceló tu reserva');
    expect(message.html).toContain('Tu cita fue cancelada');
    expect(message.html).toContain('RESERVA CANCELADA');
    expect(message.html).toContain('La barbería canceló');
    expect(message.html).toContain('El horario fue liberado');
    expect(message.html).toContain('background-color: #1b191d');
    expect(message.html).toContain('background-color: #c91470');
    expect(message.html).toContain('background-color: #f9deeb');
    expect(message.html).toContain('color: #941251');
    expect(message.html).not.toContain('#2f6b5f');
    expect(message.html).not.toContain('#feeceb');
    expect(message.html).not.toContain('#9f2d28');
  });
});
