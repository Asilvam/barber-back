import { AddScheduleBlockDto } from './dto/add-schedule-block.dto';
import { DefaultValuePipe, ParseBoolPipe, Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { BarberSchedulesService } from './barber-schedules.service';
import { CreateBarberScheduleDto } from './dto/create-barber-schedule.dto';
import { AvailabilityRangeQueryDto } from './dto/availability-range-query.dto';
import { RemoveScheduleBlockDto } from './dto/remove-schedule-block.dto';
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

  @Get('availability')
  @ApiOperation({ summary: 'Obtener disponibilidad de todos los barberos para un rango de fechas' })
  async getAvailability(@Query() query: AvailabilityRangeQueryDto) {
    return this.barberSchedulesService.getAvailability(query.start, query.end);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de un horario de barbero por ID' })
  findOne(@Param('id') id: string) {
    return this.barberSchedulesService.findOne(id);
  }

  @Patch(':id/add-block')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Agregar un bloque futuro sin cruces a una jornada existente (Admin)' })
  addBlock(@Param('id') id: string, @Body() block: AddScheduleBlockDto) {
    return this.barberSchedulesService.addBlock(id, block);
  }

  @Patch(':id/remove-block')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Quitar un bloque futuro y libre del día (Admin)' })
  removeBlock(@Param('id') id: string, @Body() block: RemoveScheduleBlockDto) {
    return this.barberSchedulesService.removeBlock(id, block);
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
  remove(@Param('id') id: string, @Query('cancelReservations', new DefaultValuePipe(false), ParseBoolPipe) cancelReservations = false) {
    return this.barberSchedulesService.remove(id, cancelReservations);
  }
}
