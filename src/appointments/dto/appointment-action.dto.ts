import { IsString, MaxLength, MinLength } from 'class-validator';

export class AppointmentActionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  token: string;
}
