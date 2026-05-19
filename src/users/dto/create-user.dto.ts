import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEmail, IsNotEmpty, IsOptional, MinLength } from 'class-validator';
import { UserRole } from '../schemas/user.schema';

export class CreateUserDto {
  @ApiProperty({ description: 'The name of the user', example: 'Jane Doe' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'The email of the user', example: 'jane.doe@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'The password of the user (hashed)', example: 'anotherStrongPassword123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6) // Assuming a minimum password length
  passwordHash: string;

  @ApiProperty({ description: 'The role of the user', enum: UserRole, default: UserRole.USER, required: false })
  @IsOptional()
  role?: UserRole;
}