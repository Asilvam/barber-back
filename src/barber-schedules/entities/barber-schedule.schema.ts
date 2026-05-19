import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Barber } from '../../barbers/entities/barber.schema'; // Importamos el modelo Barber

export type BarberScheduleDocument = BarberSchedule & Document;

@Schema({ timestamps: true })
export class BarberSchedule {
  @Prop({ type: Types.ObjectId, ref: 'Barber', required: true, index: true })
  barberId: Types.ObjectId | Barber;

  @Prop({ required: true, type: String, match: /^\d{4}-\d{2}-\d{2}$/, index: true })
  date: string; // Formato YYYY-MM-DD

  @Prop({ default: false })
  isDayOff: boolean; // Si es true, el barbero no trabaja este día

  @Prop({
    type: [
      {
        start: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, required: true }, // HH:MM
        end: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, required: true }, // HH:MM
        _id: false,
      },
    ],
    default: [],
  })
  workingHours: { start: string; end: string }[]; // Bloques de trabajo del día

  @Prop({
    type: [
      {
        start: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, required: true }, // HH:MM
        end: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, required: true }, // HH:MM
        _id: false,
      },
    ],
    default: [],
  })
  breakTimes: { start: string; end: string }[]; // Bloques de descanso del día
}

export const BarberScheduleSchema = SchemaFactory.createForClass(BarberSchedule);

// Aseguramos que solo haya una entrada de horario por barbero por día
BarberScheduleSchema.index({ barberId: 1, date: 1 }, { unique: true });
