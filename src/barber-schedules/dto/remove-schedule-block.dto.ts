import { IsString, Matches } from 'class-validator';

export class RemoveScheduleBlockDto {
  @IsString()
  @Matches(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
  start: string;

  @IsString()
  @Matches(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
  end: string;
}
