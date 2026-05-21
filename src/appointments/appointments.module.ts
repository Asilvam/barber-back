import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose'; // Import MongooseModule
import { AppointmentsService } from './appointments.service';
import { AppointmentsController } from './appointments.controller';
import { Appointment, AppointmentSchema } from './entities/appointment.schema'; // Import Appointment schema
import { Barber, BarberSchema } from '../barbers/entities/barber.schema'; // Import Barber schema for injection in service
import { BarberSchedule, BarberScheduleSchema } from '../barber-schedules/entities/barber-schedule.schema'; // Import BarberSchedule schema
import { User, UserSchema } from '../users/schemas/user.schema'; // Import User schema

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Appointment.name, schema: AppointmentSchema },
      { name: Barber.name, schema: BarberSchema }, // Also register Barber schema as it's injected in AppointmentsService
      { name: BarberSchedule.name, schema: BarberScheduleSchema }, // Register BarberSchedule schema
      { name: User.name, schema: UserSchema }, // Register User schema
    ]),
  ],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService], // Export if other modules need to use AppointmentsService
})
export class AppointmentsModule {}
