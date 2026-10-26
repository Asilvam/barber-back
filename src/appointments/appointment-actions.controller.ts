import { Body, ConflictException, Controller, Get, Header, HttpException, Post, Query, Res } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Response } from 'express';
import { AppointmentLinksService, AppointmentActionClaims } from '../whatsapp/appointment-links.service';
import { AppointmentsService } from './appointments.service';
import { AppointmentActionDto } from './dto/appointment-action.dto';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

// Public bearer links are purpose-specific; they never grant an admin session.
@Controller('appointments/actions')
export class AppointmentActionsController {
  constructor(
    private readonly links: AppointmentLinksService,
    private readonly appointments: AppointmentsService,
  ) {}

  private async pending(claims: AppointmentActionClaims) {
    const appointment = await this.appointments.findOne(claims.id);
    if (appointment.status !== 'pending' || appointment.date !== claims.date || appointment.timeSlot !== claims.timeSlot) throw new ConflictException('La reserva ya fue gestionada o cambió de horario. Revisa el panel.');
    return appointment;
  }

  @Get('review')
  async preview(@Query() query: AppointmentActionDto, @Res() response: Response) {
    const nonce = randomBytes(18).toString('base64');
    response.set({
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'Content-Security-Policy': `default-src 'none'; script-src 'self' 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
    });
    try {
      const claims = this.links.verify(query.token);
      const appointment = await this.pending(claims);
      const client = typeof appointment.clientId === 'object' && appointment.clientId !== null && 'name' in appointment.clientId ? String(appointment.clientId.name) : 'Cliente';
      const barber = typeof appointment.barberId === 'object' && appointment.barberId !== null && 'name' in appointment.barberId ? String(appointment.barberId.name) : 'Barbero';
      const accepting = claims.action === 'accept';
      const title = accepting ? 'Confirmar reserva' : 'Rechazar reserva';
      const detail = accepting ? 'La reserva se confirmará y se enviará un correo al cliente.' : 'La reserva se cancelará, el horario quedará libre y se enviará un correo al cliente.';
      response.type('html').send(
        this.page(
          title,
          `<p><strong>${escapeHtml(client)}</strong></p><p>${escapeHtml(barber)}</p><p>${escapeHtml(claims.date.split('-').reverse().join('/'))} · ${escapeHtml(claims.timeSlot)} (Chile)</p><p>${detail}</p><form id="action"><input type="hidden" name="token" value="${escapeHtml(query.token)}"><button type="submit">${title}</button></form><p id="result" role="status"></p><noscript>Activa JavaScript para confirmar esta acción.</noscript><script nonce="${nonce}">
const form = document.getElementById('action');
const result = document.getElementById('result');
let submitting = false;
form.addEventListener('submit', async (event) => {
 event.preventDefault();
 if (submitting) return;
 submitting = true;
 const button = form.querySelector('button');
 button.disabled = true;
 form.setAttribute('aria-busy', 'true');
 result.textContent = 'Procesando…';
 try {
  const res = await fetch(location.pathname, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({token: form.elements.token.value})});
  const data = await res.json();
  result.textContent = typeof data.message === 'string' ? data.message : 'No se pudo procesar la reserva. Revisa el panel.';
  if (res.ok || res.status === 409 || res.status === 410 || res.status === 401) form.remove(); else button.disabled = false;
 } catch {
  button.disabled = false;
  result.textContent = 'No pudimos comprobar el resultado. Revisa la reserva en el panel antes de volver a intentarlo.';
 } finally {
  submitting = false;
  form.removeAttribute('aria-busy');
 }
});
</script>`,
        ),
      );
    } catch (error) {
      const status = error instanceof HttpException ? error.getStatus() : 500;
      const message = error instanceof HttpException ? error.message : 'No pudimos consultar la reserva. Inténtalo desde el panel.';
      response
        .status(status)
        .type('html')
        .send(this.page('Enlace no disponible', `<p>${escapeHtml(message)}</p>`));
    }
  }

  @Post('review')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  async execute(@Body() body: AppointmentActionDto) {
    const claims = this.links.verify(body.token);
    await this.pending(claims);
    await this.appointments.update(claims.id, { status: claims.action === 'accept' ? 'confirmed' : 'cancelled' }, 'admin', { date: claims.date, timeSlot: claims.timeSlot });
    return { message: claims.action === 'accept' ? 'Reserva confirmada.' : 'Reserva rechazada. El horario quedó disponible.' };
  }

  private page(title: string, content: string) {
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escapeHtml(title)} · Shalo Barber</title><style>body{font:16px system-ui,sans-serif;background:#faf6f8;color:#1b191d;margin:0;padding:24px;line-height:1.5}main{max-width:460px;margin:8vh auto;background:#fff;border:1px solid #f3d5e3;border-radius:16px;padding:24px;overflow-wrap:anywhere}h1{color:#941251;font-size:24px}button{background:#c91470;color:white;border:0;border-radius:8px;padding:14px 20px;font:inherit;font-weight:650;cursor:pointer;width:100%}button:disabled{opacity:.6}</style></head><body><main><p>SHALO BARBER</p><h1>${escapeHtml(title)}</h1>${content}</main></body></html>`;
  }
}
