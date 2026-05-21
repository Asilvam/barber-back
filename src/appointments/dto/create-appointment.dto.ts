import { IsNotEmpty, IsString, IsMongoId, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAppointmentDto {
  @ApiProperty({ example: '2023-12-31', description: 'Fecha de la cita en formato YYYY-MM-DD' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha debe tener el formato YYYY-MM-DD',
  })
  date: string;

  @ApiProperty({ example: '15:30', description: 'Hora de la cita en formato HH:MM' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'La hora debe tener el formato HH:MM',
  })
  timeSlot: string;

  @ApiProperty({ example: '60d0fe4f5e367c001f1a2b3c', description: 'ID de MongoDB del barbero' })
  @IsMongoId({ message: 'El ID del barbero debe ser un identificador de MongoDB válido' })
  @IsNotEmpty({ message: 'El ID del barbero es obligatorio' })
  barberId: string;

  // @ApiProperty({ required: false, example: 'Corte degradado con barba', description: 'Notas opcionales para la cita' })
  // @IsString()
  // @IsOptional()
  // notes?: string; // Eliminado
}
