import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Barber } from '../../barbers/entities/barber.schema';
import { User } from '../../users/schemas/user.schema';

@Schema({ timestamps: true }) // Genera automáticamente los campos createdAt y updatedAt
export class Appointment {
  // Relación con el Cliente (Usuario que hace la reserva)
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  clientId: Types.ObjectId | User;

  // Fecha guardada como String 'YYYY-MM-DD' para evitar problemas de zonas horarias en el front
  @Prop({ required: true, type: String })
  date: string;

  // El bloque horario seleccionado (ej: "12:00", "14:00", "19:00")
  @Prop({ required: true, type: String })
  timeSlot: string;

  // Relación con el Barbero seleccionado
  @Prop({ type: Types.ObjectId, ref: 'Barber', required: true })
  barberId: Types.ObjectId | Barber;

  // Estado del flujo de la cita
  @Prop({
    required: true,
    enum: ['pending', 'confirmed', 'cancelled', 'completed'],
    default: 'pending',
  })
  status: string;

  // Comentarios o peticiones especiales del cliente
  // @Prop({ trim: true })
  // notes?: string; // Eliminado
}

export type AppointmentDocument = Appointment & Document;
export const AppointmentSchema = SchemaFactory.createForClass(Appointment);

// Restricción única a nivel de Base de Datos:
// Evita que un mismo barbero tenga dos citas agendadas el mismo día a la misma hora.
AppointmentSchema.index({ barberId: 1, date: 1, timeSlot: 1 }, { unique: true });
