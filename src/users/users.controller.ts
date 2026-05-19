import { Controller, Get, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from './schemas/user.schema';
import { RolesGuard } from '../auth/guards/roles.guard'; // Updated Import RolesGuard
import { Roles } from '../auth/decorators/roles.decorator'; // Corrected Import Roles decorator path

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard) // JwtAuthGuard applies to all routes in this controller
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(RolesGuard) // Apply RolesGuard
  @Roles(UserRole.ADMIN) // Specify ADMIN role
  @ApiOperation({ summary: 'Listar todos los usuarios (Admin)' })
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de un usuario' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar perfil de usuario' })
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Patch(':id/role')
  @UseGuards(RolesGuard) // Apply RolesGuard
  @Roles(UserRole.ADMIN) // Specify ADMIN role
  @ApiOperation({ summary: 'Cambiar el rol de un usuario (Admin)' })
  updateRole(@Param('id') id: string, @Body('role') role: UserRole) {
    // Now that UpdateUserDto can handle role, and RolesGuard is in place
    return this.usersService.update(id, { role });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar un usuario' })
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}