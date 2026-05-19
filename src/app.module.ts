import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { BarbersModule } from './barbers/barbers.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { BarberSchedulesModule } from './barber-schedules/barber-schedules.module'; // Importamos el nuevo módulo

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI') ?? '',
      }),
    }),
    UsersModule,
    AuthModule,
    BarbersModule,
    AppointmentsModule,
    BarberSchedulesModule, // Añadimos el nuevo módulo aquí
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}