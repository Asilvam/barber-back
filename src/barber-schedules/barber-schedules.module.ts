import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BarberSchedulesService } from './barber-schedules.service';
import { BarberSchedulesController } from './barber-schedules.controller';
import { BarberSchedule, BarberScheduleSchema } from './entities/barber-schedule.schema';
import { Barber, BarberSchema } from '../barbers/entities/barber.schema'; // Necesario para la inyección en el servicio

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BarberSchedule.name, schema: BarberScheduleSchema },
      { name: Barber.name, schema: BarberSchema }, // Registramos Barber aquí también porque BarberSchedulesService lo inyecta
    ]),
  ],
  controllers: [BarberSchedulesController],
  providers: [BarberSchedulesService],
  exports: [BarberSchedulesService], // Exportamos el servicio si otros módulos necesitan usarlo
})
export class BarberSchedulesModule {}
