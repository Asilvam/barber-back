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
      subject: 'Reserva pendiente de aprobación',
      fromName,
      html: this.buildAppointmentEmail(appointment, {
        preheader: 'Recibimos tu solicitud de reserva; está pendiente de aprobación.',
        eyebrow: 'NUEVA RESERVA',
        title: 'Tu reserva está pendiente de aprobación',
        introduction: 'Recibimos tu solicitud. La reserva está pendiente de aprobación por administración.',
        statusLabel: 'PENDIENTE DE APROBACIÓN',
        statusBackground: '#f9deeb',
        statusColor: '#941251',
        noticeTitle: 'Pendiente de aprobación',
        notice: 'Te avisaremos por este medio si administración realiza algún cambio en tu cita.',
      }),
    });
  }

  async sendAppointmentConfirmedEmail(appointment: AppointmentEmail): Promise<void> {
    await this.sendEmail({
      to: appointment.to,
      subject: 'Tu reserva está confirmada',
      fromName: this.configService.get<string>('EMAIL_FROM_NAME', 'Barber'),
      html: this.buildAppointmentEmail(appointment, {
        preheader: 'Administración confirmó tu reserva.',
        eyebrow: 'RESERVA CONFIRMADA',
        title: 'Tu cita está confirmada',
        introduction: 'Administración aprobó tu reserva. Te esperamos en la fecha y hora indicadas.',
        statusLabel: 'CONFIRMADA',
        statusBackground: '#e6f3ec',
        statusColor: '#23634c',
        noticeTitle: 'Te esperamos',
        notice: 'Si necesitas cancelar, recuerda hacerlo con al menos 12 horas de anticipación.',
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
        statusBackground: '#f9deeb',
        statusColor: '#941251',
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
        <body style="margin: 0; padding: 0; background-color: #f5f3f4; color: #1b191d;">
          <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">${this.escapeHtml(copy.preheader)}</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; background-color: #f5f3f4;">
            <tr>
              <td align="center" style="padding: 32px 16px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 620px; background-color: #ffffff; border: 1px solid #e3dce1; border-radius: 18px; overflow: hidden;">
                  <tr>
                    <td style="height: 6px; padding: 0; background-color: #c91470; font-size: 0; line-height: 0;">&nbsp;</td>
                  </tr>
                  <tr>
                    <td style="background-color: #1b191d; padding: 24px 32px;">
                      <p style="margin: 0 0 5px; font-family: Arial, Helvetica, sans-serif; color: #ffffff; font-size: 21px; font-weight: 800; letter-spacing: 0.3px;">${fromName}</p>
                      <p style="margin: 0; font-family: Arial, Helvetica, sans-serif; color: #f9deeb; font-size: 11px; font-weight: 700; letter-spacing: 2px;">RESERVAS · SHALO BARBER</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 40px 32px 32px;">
                      <p style="margin: 0 0 12px; font-family: Arial, Helvetica, sans-serif; color: #c91470; font-size: 12px; font-weight: 800; letter-spacing: 1.8px;">${this.escapeHtml(copy.eyebrow)}</p>
                      <h1 style="margin: 0 0 24px; font-family: Arial, Helvetica, sans-serif; color: #1b191d; font-size: 32px; line-height: 1.15; font-weight: 800;">${this.escapeHtml(copy.title)}</h1>
                      <p style="margin: 0 0 12px; font-family: Arial, Helvetica, sans-serif; color: #1b191d; font-size: 17px; line-height: 1.65;">Hola ${clientName},</p>
                      <p style="margin: 0 0 28px; font-family: Arial, Helvetica, sans-serif; color: #5e5961; font-size: 16px; line-height: 1.65;">${this.escapeHtml(copy.introduction)}</p>
                      <span style="display: inline-block; margin-bottom: 18px; padding: 7px 12px; border-radius: 999px; background-color: ${copy.statusBackground}; color: ${copy.statusColor}; font-family: Arial, Helvetica, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 1px;">${this.escapeHtml(copy.statusLabel)}</span>
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; background-color: #f5f3f4; border: 1px solid #e3dce1; border-radius: 12px;">
                        <tr>
                          <td style="padding: 18px 20px; border-bottom: 1px solid #e3dce1; font-family: Arial, Helvetica, sans-serif; color: #5e5961; font-size: 12px; font-weight: 700; letter-spacing: 0.8px; width: 32%;">FECHA</td>
                          <td style="padding: 18px 20px; border-bottom: 1px solid #e3dce1; font-family: Arial, Helvetica, sans-serif; color: #1b191d; font-size: 16px; font-weight: 700;">${date}</td>
                        </tr>
                        <tr>
                          <td style="padding: 18px 20px; border-bottom: 1px solid #e3dce1; font-family: Arial, Helvetica, sans-serif; color: #5e5961; font-size: 12px; font-weight: 700; letter-spacing: 0.8px;">HORA</td>
                          <td style="padding: 18px 20px; border-bottom: 1px solid #e3dce1; font-family: Arial, Helvetica, sans-serif; color: #1b191d; font-size: 16px; font-weight: 700;">${timeSlot}</td>
                        </tr>
                        <tr>
                          <td style="padding: 18px 20px; font-family: Arial, Helvetica, sans-serif; color: #5e5961; font-size: 12px; font-weight: 700; letter-spacing: 0.8px;">BARBERO</td>
                          <td style="padding: 18px 20px; font-family: Arial, Helvetica, sans-serif; color: #1b191d; font-size: 16px; font-weight: 700;">${barberName}</td>
                        </tr>
                      </table>
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width: 100%; margin-top: 24px; border-left: 4px solid #c91470; background-color: #f9deeb;">
                        <tr>
                          <td style="padding: 18px 20px;">
                            <p style="margin: 0 0 5px; font-family: Arial, Helvetica, sans-serif; color: #941251; font-size: 14px; font-weight: 700;">${this.escapeHtml(copy.noticeTitle)}</p>
                            <p style="margin: 0; font-family: Arial, Helvetica, sans-serif; color: #5e5961; font-size: 14px; line-height: 1.55;">${this.escapeHtml(copy.notice)}</p>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 22px 32px; background-color: #1b191d;">
                      <p style="margin: 0; font-family: Arial, Helvetica, sans-serif; color: #f5f3f4; font-size: 12px; line-height: 1.6;">Mensaje automático de ${fromName}. No respondas a este correo.</p>
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
