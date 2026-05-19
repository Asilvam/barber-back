import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEmail, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class CreateBarberDto {
  @ApiProperty({
    description: 'Nombre completo del barbero',
    example: 'Alejandro Silva',
  })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  name: string;

  @ApiProperty({
    description: 'Correo electrónico único del barbero',
    example: 'alejandro.barber@example.com',
  })
  @IsEmail({}, { message: 'El formato del correo electrónico no es válido' })
  @IsNotEmpty({ message: 'El correo electrónico es obligatorio' })
  email: string;

  @ApiProperty({
    description: 'Número de celular para coordinaciones o emergencias',
    example: '+56912345678',
  })
  @IsString({ message: 'El teléfono debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El teléfono celular es obligatorio' })
  phone: string;

  @ApiProperty({
    description: 'Estado activo del barbero en la barbería',
    example: true,
    required: false,
    default: true,
  })
  @IsBoolean({ message: 'El estado debe ser un valor booleano (true/false)' })
  @IsOptional()
  isActive?: boolean;
}
