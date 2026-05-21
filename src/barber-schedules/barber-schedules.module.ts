import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BarberSchedulesService } from './barber-schedules.service';
import { BarberSchedulesController } from './barber-schedules.controller';
import { BarberSchedule, BarberScheduleSchema } from './entities/barber-schedule.schema';
import { Barber, BarberSchema } from '../barbers/entities/barber.schema';
import { Appointment, AppointmentSchema } from '../appointments/entities/appointment.schema'; // Importamos el esquema de Appointment

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BarberSchedule.name, schema: BarberScheduleSchema },
      { name: Barber.name, schema: BarberSchema },
      { name: Appointment.name, schema: AppointmentSchema }, // Registramos Appointment aquí
    ]),
  ],
  controllers: [BarberSchedulesController],
  providers: [BarberSchedulesService],
  exports: [BarberSchedulesService],
})
export class BarberSchedulesModule {}
