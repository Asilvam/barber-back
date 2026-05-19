import { PartialType } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsEnum } from 'class-validator';
import { UserRole } from '../schemas/user.schema';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiProperty({ description: 'The role of the user', enum: UserRole, required: false })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}