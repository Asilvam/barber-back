import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { BUSINESS_TIME_ZONE } from './common/time/santiago-time';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const logger = new Logger('Bootstrap');
  const configService = app.get(ConfigService);
  const corsOrigins = configService
    .getOrThrow<string>('CORS_ORIGIN')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Barber Shop Management API')
    .setDescription('The official API documentation for managing barber shop operations, including user authentication, barber profiles, and appointment scheduling.')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('Auth', 'Authentication endpoints')
    .addTag('Users', 'User management')
    .addTag('Barbers', 'Barber profiles and availability')
    .addTag('Appointments', 'Booking and scheduling')
    .addTag('Barber Schedules', 'Management of barber working hours and availability') // Añadimos la nueva etiqueta
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);
  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
  logger.log(`Application listening on ${port}`);
  logger.log(`Business date and appointment validations use ${BUSINESS_TIME_ZONE}`);
}
void bootstrap();
