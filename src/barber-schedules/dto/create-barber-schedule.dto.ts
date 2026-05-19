import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

class TimeSlotDto {
  @ApiProperty({ description: 'Hora de inicio del bloque (HH:MM)', example: '09:00' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, { message: 'El formato de la hora debe ser HH:MM' })
  start: string;

  @ApiProperty({ description: 'Hora de fin del bloque (HH:MM)', example: '13:00' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, { message: 'El formato de la hora debe ser HH:MM' })
  end: string;
}

export class CreateBarberScheduleDto {
  @ApiProperty({ description: 'ID del barbero al que pertenece este horario', example: '60d0fe4f5e367c001f1a2b3c' })
  @IsMongoId()
  @IsNotEmpty()
  barberId: string;

  @ApiProperty({ description: 'Fecha para la que aplica este horario (YYYY-MM-DD)', example: '2023-10-27' })
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe tener el formato YYYY-MM-DD' })
  @IsNotEmpty()
  date: string;

  @ApiProperty({ description: 'Indica si el barbero está de día libre este día', example: false, required: false })
  @IsBoolean()
  @IsOptional()
  isDayOff?: boolean;

  @ApiProperty({ type: [TimeSlotDto], description: 'Bloques de horas de trabajo del barbero', required: false })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimeSlotDto)
  @IsOptional()
  workingHours?: TimeSlotDto[];

  @ApiProperty({ type: [TimeSlotDto], description: 'Bloques de horas de descanso del barbero', required: false })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimeSlotDto)
  @IsOptional()
  breakTimes?: TimeSlotDto[];
}
