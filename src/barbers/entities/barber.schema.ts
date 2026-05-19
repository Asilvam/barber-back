import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true }) // Crea automáticamente los campos createdAt y updatedAt
export class Barber {
  // Nombre completo del barbero
  @Prop({ required: true, trim: true })
  name: string;

  // Correo electrónico único para accesos o reportes
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  // Número de celular para coordinaciones internas o emergencias
  @Prop({ required: true, trim: true })
  phone: string;

  // Estado del barbero en la plataforma (por si toma vacaciones o se retira)
  @Prop({ default: true })
  isActive: boolean;
}

export const BarberSchema = SchemaFactory.createForClass(Barber);
export type BarberDocument = Barber & Document; // Defined BarberDocument here
