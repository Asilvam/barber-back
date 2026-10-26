import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppointmentLinksService } from './appointment-links.service';
import { WhatsappService } from './whatsapp.service';

@Module({ imports: [ConfigModule], providers: [AppointmentLinksService, WhatsappService], exports: [AppointmentLinksService, WhatsappService] })
export class WhatsappModule {}
