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

  // Identificador de ocupación administrado por AppointmentsService.
  // Se elimina cuando la cita es cancelada para liberar el bloque.
  @Prop({ type: String })
  slotKey?: string;

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

// La base sólo garantiza la unicidad del identificador que administra el backend.
// Las citas canceladas no tienen slotKey y, por lo tanto, no ocupan el bloque.
AppointmentSchema.index(
  { slotKey: 1 },
  {
    name: 'unique_appointment_slot_key',
    unique: true,
    sparse: true,
  },
);
