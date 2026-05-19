import { PartialType } from '@nestjs/swagger';
import { CreateBarberScheduleDto } from './create-barber-schedule.dto';

export class UpdateBarberScheduleDto extends PartialType(CreateBarberScheduleDto) {}
