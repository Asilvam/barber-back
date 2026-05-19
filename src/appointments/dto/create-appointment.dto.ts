import {
  IsNotEmpty,
  IsString,
  IsEmail,
  IsMongoId,
  IsOptional,
  Matches,
} from 'class-validator';

export class CreateAppointmentDto {
  @IsString() @IsNotEmpty() clientName: string;
  @IsEmail() @IsNotEmpty() clientEmail: string;
  @IsString() @IsNotEmpty() clientPhone: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha debe tener el formato YYYY-MM-DD',
  })
  date: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'La hora debe tener el formato HH:MM',
  })
  timeSlot: string;

  @IsString() @IsNotEmpty() service: string;
  @IsMongoId() @IsNotEmpty() barberId: string;
  @IsString() @IsOptional() notes?: string;
}
