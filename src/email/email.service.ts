import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { SendEmailDto } from './dto/send-email.dto';

interface AppointmentEmail {
  to: string;
  clientName: string;
  barberName: string;
  date: string;
  timeSlot: string;
}

interface AppointmentEmailCopy {
  preheader: string;
  eyebrow: string;
  title: string;
  introduction: string;
  statusLabel: string;
  statusBackground: string;
  statusColor: string;
  noticeTitle: string;
  notice: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendEmail(message: SendEmailDto): Promise<void> {
    const baseUrl = this.configService.getOrThrow<string>('EMAIL_SERVICE_URL').replace(/\/+$/, '');
    const apiKey = this.configService.getOrThrow<string>('EMAIL_SERVICE_API_KEY');
    const timeout = this.configService.get<number>('EMAIL_SERVICE_TIMEOUT_MS', 5000);
    const endpoint = baseUrl.endsWith('/email') ? `${baseUrl}/send` : `${baseUrl}/email/send`;

    try {
      await axios.post(endpoint, message, {
        headers: {
          'x-internal-api-key': apiKey,
        },
        timeout,
      });
      this.logger.log(`Email request accepted for ${message.to}`);
    } catch (error) {
      const detail = axios.isAxiosError(error) ? `${error.response?.status ?? 'network'} ${error.message}` : error instanceof Error ? error.message : String(error);

      this.logger.error(`Email request failed for ${message.to}: ${detail}`);
      throw new Error(`Email service request failed: ${detail}`);
    }
  }

  async sendAppointmentCreatedEmail(appointment: AppointmentEmail): Promise<void> {
    const fromName = this.configService.get<string>('EMAIL_FROM_NAME', 'Barber');

    await this.sendEmail({
      to: appointment.to,
      subject: 'Confirmación de reserva',
      fromName,
      html: this.buildAppointmentEmail(appointment, {
        preheader: 'Tu reserva fue creada correctamente.',
        eyebrow: 'NUEVA RESERVA',
        title: 'Tu cita quedó agendada',
        introduction: 'Recibimos correctamente tu reserva. Guarda estos datos para el día de tu cita.',
        statusLabel: 'RESERVA CREADA',
        statusBackground: '#e7f2ee',
        statusColor: '#245448',
        noticeTitle: 'Todo listo',
        notice: 'Te avisaremos por este medio si administración realiza algún cambio en tu cita.',
      }),
    });
  }

  async sendAppointmentCancelledEmail(appointment: AppointmentEmail): Promise<void> {
    const fromName = this.configService.get<string>('EMAIL_FROM_NAME', 'Barber');

    await this.sendEmail({
      to: appointment.to,
      subject: 'Tu reserva fue cancelada',
      fromName,
      html: this.buildAppointmentEmail(appointment, {
        preheader: 'Administración canceló tu reserva.',
        eyebrow: 'ACTUALIZACIÓN DE RESERVA',
        title: 'Tu cita fue cancelada',
        introduction: 'Administración canceló la siguiente reserva asociada a tu cuenta.',
        statusLabel: 'RESERVA CANCELADA',
        statusBackground: '#feeceb',
        statusColor: '#9f2d28',
        noticeTitle: 'El horario fue liberado',
        notice: 'Puedes ingresar nuevamente a Barber y elegir otro bloque disponible cuando lo necesites.',
      }),
    });
  }

  private buildAppointmentEmail(appointment: AppointmentEmail, copy: AppointmentEmailCopy): string {
    const clientName = this.escapeHtml(appointment.clientName);
    const barberName = this.escapeHtml(appointment.barberName);
    const date = this.formatDate(appointment.date);
    const timeSlot = this.escapeHtml(appointment.timeSlot);
    const fromName = this.escapeHtml(this.configService.get<string>('EMAIL_FROM_NAME', 'Barber'));

    return `
      <!doctype html>
      <html lang="es">
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
          <title>${this.escapeHtml(copy.title)}</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f3f5f4; color: #18201d;">
          <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">${this.escapeHtml(copy.preheader)}</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; background-color: #f3f5f4;">
            <tr>
              <td align="center" style="padding: 32px 16px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 620px; background-color: #ffffff; border: 1px solid #dfe5e2; border-radius: 18px; overflow: hidden;">
                  <tr>
                    <td style="background-color: #2f6b5f; padding: 24px 32px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td style="font-family: Arial, Helvetica, sans-serif; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: 0.4px;">${fromName}</td>
                          <td align="right" style="font-family: Arial, Helvetica, sans-serif; color: #dcebe6; font-size: 12px; font-weight: 700; letter-spacing: 1.4px;">RESERVAS</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 40px 32px 32px;">
                      <p style="margin: 0 0 12px; font-family: Arial, Helvetica, sans-serif; color: #2f6b5f; font-size: 12px; font-weight: 700; letter-spacing: 1.5px;">${this.escapeHtml(copy.eyebrow)}</p>
                      <h1 style="margin: 0 0 24px; font-family: Georgia, 'Times New Roman', serif; color: #18201d; font-size: 34px; line-height: 1.15; font-weight: 700;">${this.escapeHtml(copy.title)}</h1>
                      <p style="margin: 0 0 12px; font-family: Arial, Helvetica, sans-serif; color: #27312d; font-size: 17px; line-height: 1.65;">Hola ${clientName},</p>
                      <p style="margin: 0 0 28px; font-family: Arial, Helvetica, sans-serif; color: #4a5550; font-size: 16px; line-height: 1.65;">${this.escapeHtml(copy.introduction)}</p>
                      <span style="display: inline-block; margin-bottom: 18px; padding: 7px 12px; border-radius: 999px; background-color: ${copy.statusBackground}; color: ${copy.statusColor}; font-family: Arial, Helvetica, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 1px;">${this.escapeHtml(copy.statusLabel)}</span>
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; background-color: #f7f9f8; border: 1px solid #e5eae7; border-radius: 12px;">
                        <tr>
                          <td style="padding: 22px 24px; border-bottom: 1px solid #e5eae7; font-family: Arial, Helvetica, sans-serif; color: #66716c; font-size: 13px; width: 32%;">FECHA</td>
                          <td style="padding: 22px 24px; border-bottom: 1px solid #e5eae7; font-family: Arial, Helvetica, sans-serif; color: #18201d; font-size: 16px; font-weight: 700;">${date}</td>
                        </tr>
                        <tr>
                          <td style="padding: 22px 24px; border-bottom: 1px solid #e5eae7; font-family: Arial, Helvetica, sans-serif; color: #66716c; font-size: 13px;">HORA</td>
                          <td style="padding: 22px 24px; border-bottom: 1px solid #e5eae7; font-family: Arial, Helvetica, sans-serif; color: #18201d; font-size: 16px; font-weight: 700;">${timeSlot}</td>
                        </tr>
                        <tr>
                          <td style="padding: 22px 24px; font-family: Arial, Helvetica, sans-serif; color: #66716c; font-size: 13px;">BARBERO</td>
                          <td style="padding: 22px 24px; font-family: Arial, Helvetica, sans-serif; color: #18201d; font-size: 16px; font-weight: 700;">${barberName}</td>
                        </tr>
                      </table>
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; margin-top: 24px; border-left: 4px solid #2f6b5f; background-color: #f1f6f4;">
                        <tr>
                          <td style="padding: 18px 20px;">
                            <p style="margin: 0 0 5px; font-family: Arial, Helvetica, sans-serif; color: #244e45; font-size: 14px; font-weight: 700;">${this.escapeHtml(copy.noticeTitle)}</p>
                            <p style="margin: 0; font-family: Arial, Helvetica, sans-serif; color: #52605a; font-size: 14px; line-height: 1.55;">${this.escapeHtml(copy.notice)}</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 22px 32px; background-color: #18201d;">
                      <p style="margin: 0; font-family: Arial, Helvetica, sans-serif; color: #d7dedb; font-size: 12px; line-height: 1.6;">Mensaje automático de ${fromName}. No respondas a este correo.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
  }

  private formatDate(date: string): string {
    const [year, month, day] = date.split('-');
    return this.escapeHtml(`${day}-${month}-${year}`);
  }

  private escapeHtml(value: string): string {
    return value.replace(
      /[&<>"']/g,
      (character) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#039;',
        })[character] ?? character,
    );
  }
}
