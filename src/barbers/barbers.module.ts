import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BarbersService } from './barbers.service';
import { BarbersController } from './barbers.controller';
import { Barber, BarberSchema } from './entities/barber.schema'; // Updated import path

@Module({
  imports: [MongooseModule.forFeature([{ name: Barber.name, schema: BarberSchema }])],
  controllers: [BarbersController],
  providers: [BarbersService],
  exports: [BarbersService], // Export BarbersService if it needs to be used by other modules
})
export class BarbersModule {}
