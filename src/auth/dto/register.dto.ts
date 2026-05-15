import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @IsString()
  @ApiProperty({ example: 'Juan Perez' })
  name: string;

  @IsEmail()
  @ApiProperty({ example: 'juan@example.com' })
  email: string;

  @IsString()
  @MinLength(6)
  @ApiProperty({ example: 'secret123' })
  password: string;
}
