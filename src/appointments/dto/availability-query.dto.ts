import { PickType } from '@nestjs/swagger';
import { CreateAppointmentDto } from './create-appointment.dto';

export class AvailabilityQueryDto extends PickType(CreateAppointmentDto, ['barberId', 'date'] as const) {}
