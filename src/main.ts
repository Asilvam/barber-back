import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const logger = new Logger('Bootstrap');
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? '*',
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Barber Shop Management API')
    .setDescription(
      'The official API documentation for managing barber shop operations, including user authentication, barber profiles, and appointment scheduling.',
    )
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
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`Application listening on ${port}`);
}
void bootstrap();