import { GoneException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Types } from 'mongoose';
import { getSantiagoAppointmentTimestamp } from '../common/time/santiago-time';

export type AppointmentAction = 'accept' | 'reject';
export interface AppointmentActionClaims {
  purpose: 'appointment-action';
  id: string;
  action: AppointmentAction;
  date: string;
  timeSlot: string;
  exp: number;
}

@Injectable()
export class AppointmentLinksService {
  constructor(private readonly config: ConfigService) {}

  private secret(): string {
    const secret = this.config.get<string>('WHATSAPP_ACTION_SECRET');
    if (!secret || secret.length < 32) throw new UnauthorizedException('Los enlaces de reserva no están habilitados.');
    return secret;
  }

  create(id: string, action: AppointmentAction, date: string, timeSlot: string): string {
    const exp = Math.min(Date.now() + 24 * 60 * 60 * 1000, getSantiagoAppointmentTimestamp(date, timeSlot));
    const claims: AppointmentActionClaims = { purpose: 'appointment-action', id, action, date, timeSlot, exp };
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signature = createHmac('sha256', this.secret()).update(payload).digest('base64url');
    return `${payload}.${signature}`;
  }

  verify(token: string): AppointmentActionClaims {
    if (typeof token !== 'string' || token.length > 2048) throw new UnauthorizedException('Enlace no válido.');
    const [payload, encodedSignature, extra] = token.split('.');
    if (!payload || !encodedSignature || extra) throw new UnauthorizedException('Enlace no válido.');
    const expected = createHmac('sha256', this.secret()).update(payload).digest();
    const signature = Buffer.from(encodedSignature, 'base64url');
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) throw new UnauthorizedException('Enlace no válido.');
    let claims: AppointmentActionClaims;
    try {
      claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as AppointmentActionClaims;
    } catch {
      throw new UnauthorizedException('Enlace no válido.');
    }
    if (
      !claims ||
      claims.purpose !== 'appointment-action' ||
      !Types.ObjectId.isValid(claims.id) ||
      !['accept', 'reject'].includes(claims.action) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(claims.date) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(claims.timeSlot) ||
      !Number.isFinite(claims.exp)
    )
      throw new UnauthorizedException('Enlace no válido.');
    if (claims.exp <= Date.now()) throw new GoneException('Este enlace venció. Gestiona la reserva desde el panel.');
    return claims;
  }
}
