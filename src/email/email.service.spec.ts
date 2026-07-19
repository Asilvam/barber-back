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

  it('builds an escaped appointment confirmation email', async () => {
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
    expect(message.subject).toBe('Confirmación de reserva');
    expect(message.fromName).toBe('Barber Test');
    expect(message.html).toContain('&lt;Client&gt;');
    expect(message.html).toContain('Tom &amp; Jerry');
    expect(message.html).toContain('10-08-2026');
    expect(message.html).toContain('Tu cita quedó agendada');
    expect(message.html).toContain('RESERVA CREADA');
    expect(message.html).toContain('background-color: #2f6b5f');
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
    expect(message.subject).toBe('Tu reserva fue cancelada');
    expect(message.html).toContain('Tu cita fue cancelada');
    expect(message.html).toContain('RESERVA CANCELADA');
    expect(message.html).toContain('Administración canceló');
    expect(message.html).toContain('El horario fue liberado');
  });
});
