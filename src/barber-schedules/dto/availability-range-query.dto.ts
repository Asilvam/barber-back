import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, Matches } from 'class-validator';

export class AvailabilityRangeQueryDto {
  @ApiProperty({ example: '2026-10-19' })
  @IsDateString({ strict: true }, { message: 'La fecha inicial debe existir en el calendario' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha inicial debe tener el formato YYYY-MM-DD' })
  start: string;

  @ApiProperty({ example: '2026-10-26' })
  @IsDateString({ strict: true }, { message: 'La fecha final debe existir en el calendario' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha final debe tener el formato YYYY-MM-DD' })
  end: string;
}
