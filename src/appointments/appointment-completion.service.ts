import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Appointment } from './entities/appointment.schema';
import { getSantiagoAppointmentTimestamp, getSantiagoDateTime } from '../common/time/santiago-time';

const COMPLETION_DELAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AppointmentCompletionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AppointmentCompletionService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(@InjectModel(Appointment.name) private readonly appointments: Model<Appointment>) {}

  async onModuleInit() {
    await this.run();
    this.timer = setInterval(() => void this.run(), 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    try {
      const count = await this.completeOverdueConfirmed();
      if (count) this.logger.log(`${count} reserva(s) confirmada(s) completadas tras 24 horas.`);
    } catch {
      this.logger.error('No se pudo ejecutar el cierre automático de reservas. Se reintentará en la próxima revisión.');
    } finally {
      this.running = false;
    }
  }

  async completeOverdueConfirmed(now = Date.now()): Promise<number> {
    const cutoff = now - COMPLETION_DELAY_MS;
    const candidates = await this.appointments
      .find({ status: 'confirmed', date: { $lte: getSantiagoDateTime(new Date(cutoff)).today } })
      .select('_id date timeSlot')
      .lean()
      .exec();
    const operations: Parameters<Model<Appointment>['bulkWrite']>[0] = [];
    for (const appointment of candidates) {
      let startsAt: number;
      try {
        startsAt = getSantiagoAppointmentTimestamp(appointment.date, appointment.timeSlot);
      } catch {
        this.logger.warn(`Reserva ${appointment._id.toString()} omitida: fecha u hora inválida.`);
        continue;
      }
      if (!Number.isFinite(startsAt) || startsAt > cutoff) continue;
      operations.push({
        updateOne: {
          // Recheck state and schedule atomically in case another process changed them.
          filter: { _id: appointment._id, status: 'confirmed', date: appointment.date, timeSlot: appointment.timeSlot },
          update: { $set: { status: 'completed' }, $unset: { activeClientKey: 1 } },
        },
      });
    }
    if (!operations.length) return 0;
    const result = await this.appointments.bulkWrite(operations, { ordered: false });
    return result.modifiedCount;
  }
}
