import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AppointmentLinksService } from './appointment-links.service';

export interface ReservationNotification {
  id: string;
  clientName: string;
  barberName: string;
  date: string;
  timeSlot: string;
}

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  constructor(
    private readonly config: ConfigService,
    private readonly links: AppointmentLinksService,
  ) {}

  async notifyAppointment(appointment: ReservationNotification): Promise<void> {
    const phone = this.config.get<string>('WHATSAPP_NOTIFY_PHONE');
    const apiKey = this.config.get<string>('CALLMEBOT_API_KEY');
    const baseUrl = this.config.get<string>('WHATSAPP_ACTION_BASE_URL');
    if (!phone || !apiKey || !baseUrl || !this.config.get<string>('WHATSAPP_ACTION_SECRET')) return;
    try {
      const link = (action: 'accept' | 'reject') => `${baseUrl.replace(/\/+$/, '')}/appointments/actions/review?token=${this.links.create(appointment.id, action, appointment.date, appointment.timeSlot)}`;
      const text = [
        '*Nueva reserva pendiente · Shalo Barber*',
        `Cliente: ${appointment.clientName}`,
        `Barbero: ${appointment.barberName}`,
        `Fecha: ${appointment.date.split('-').reverse().join('/')}`,
        `Hora: ${appointment.timeSlot} (Chile)`,
        '',
        '✅ Aceptar:',
        link('accept'),
        '',
        '❌ Rechazar:',
        link('reject'),
        '',
        'Cada enlace pide confirmación. Vence en 24 horas o al comenzar la cita. No compartas estos enlaces.',
      ].join('\n');
      await axios.get('https://api.callmebot.com/whatsapp.php', { params: { phone, apikey: apiKey, text }, timeout: 5000, maxRedirects: 0, maxContentLength: 65536 });
      this.logger.log(`WhatsApp solicitado para reserva ${appointment.id}.`);
    } catch {
      // Do not log URLs: they contain API credentials and action tokens.
      this.logger.warn(`La reserva ${appointment.id} se guardó, pero no se pudo solicitar el aviso de WhatsApp.`);
    }
  }
}
