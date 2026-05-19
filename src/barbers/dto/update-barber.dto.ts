import { PartialType } from '@nestjs/swagger';
import { CreateBarberDto } from './create-barber.dto';

export class UpdateBarberDto extends PartialType(CreateBarberDto) {}
