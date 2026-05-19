import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { BarberSchedulesService } from './barber-schedules.service';
import { CreateBarberScheduleDto } from './dto/create-barber-schedule.dto';
import { UpdateBarberScheduleDto } from './dto/update-barber-schedule.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@ApiTags('Barber Schedules')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard) // Protege todos los endpoints del controlador con JWT
@Controller('barber-schedules')
export class BarberSchedulesController {
  constructor(private readonly barberSchedulesService: BarberSchedulesService) {}

  @Post()
  @UseGuards(RolesGuard) // Aplica RolesGuard
  @Roles(UserRole.ADMIN) // Solo ADMIN puede crear horarios
  @ApiOperation({ summary: 'Crear un nuevo horario de barbero (Admin)' })
  create(@Body() createBarberScheduleDto: CreateBarberScheduleDto) {
    return this.barberSchedulesService.create(createBarberScheduleDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos los horarios de barberos' })
  findAll() {
    return this.barberSchedulesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de un horario de barbero por ID' })
  findOne(@Param('id') id: string) {
    return this.barberSchedulesService.findOne(id);
  }

  @Get('barber/:barberId/date/:date')
  @ApiOperation({ summary: 'Obtener horario de un barbero para una fecha específica' })
  findByBarberAndDate(@Param('barberId') barberId: string, @Param('date') date: string) {
    return this.barberSchedulesService.findByBarberAndDate(barberId, date);
  }

  @Patch(':id')
  @UseGuards(RolesGuard) // Aplica RolesGuard
  @Roles(UserRole.ADMIN) // Solo ADMIN puede actualizar horarios
  @ApiOperation({ summary: 'Actualizar un horario de barbero (Admin)' })
  update(@Param('id') id: string, @Body() updateBarberScheduleDto: UpdateBarberScheduleDto) {
    return this.barberSchedulesService.update(id, updateBarberScheduleDto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard) // Aplica RolesGuard
  @Roles(UserRole.ADMIN) // Solo ADMIN puede eliminar horarios
  @ApiOperation({ summary: 'Eliminar un horario de barbero (Admin)' })
  remove(@Param('id') id: string) {
    return this.barberSchedulesService.remove(id);
  }
}
