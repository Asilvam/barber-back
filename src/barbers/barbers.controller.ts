import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { BarbersService } from './barbers.service';
import { CreateBarberDto } from './dto/create-barber.dto';
import { UpdateBarberDto } from './dto/update-barber.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@ApiTags('Barbers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard) // Apply JwtAuthGuard at the class level to protect all endpoints
@Controller('barbers')
export class BarbersController {
  constructor(private readonly barbersService: BarbersService) {}

  @Post()
  @UseGuards(RolesGuard) // JwtAuthGuard is applied by the class-level decorator
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear un nuevo barbero (Admin)' })
  create(@Body() createBarberDto: CreateBarberDto) {
    return this.barbersService.create(createBarberDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos los barberos' }) // Now protected by class-level JwtAuthGuard
  findAll() {
    return this.barbersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de un barbero' }) // Now protected by class-level JwtAuthGuard
  findOne(@Param('id') id: string) {
    return this.barbersService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard) // JwtAuthGuard is applied by the class-level decorator
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar información del barbero' })
  update(@Param('id') id: string, @Body() updateBarberDto: UpdateBarberDto) {
    return this.barbersService.update(id, updateBarberDto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard) // JwtAuthGuard is applied by the class-level decorator
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar un barbero (Admin)' })
  remove(@Param('id') id: string) {
    return this.barbersService.remove(id);
  }
}
