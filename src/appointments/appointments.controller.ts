import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard'; // Updated Import RolesGuard
import { Roles } from '../auth/decorators/roles.decorator'; // Updated Import Roles decorator
import { UserRole } from '../users/schemas/user.schema'; // Import UserRole

@ApiTags('Appointments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard) // JwtAuthGuard applies to all routes in this controller
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  // Removed @UseGuards(RolesGuard) and @Roles(UserRole.ADMIN) to allow any authenticated user to create an appointment
  @ApiOperation({ summary: 'Crear una nueva cita' }) // Updated summary
  create(@Body() createAppointmentDto: CreateAppointmentDto) {
    return this.appointmentsService.create(createAppointmentDto);
  }

  @Get()
  @UseGuards(RolesGuard) // Apply RolesGuard
  @Roles(UserRole.ADMIN) // Specify ADMIN role
  @ApiOperation({ summary: 'Listar todas las citas (Admin: Agenda completa)' })
  findAll() {
    return this.appointmentsService.findAll();
  }

  @Get('availability')
  @ApiOperation({ summary: 'Consultar horarios disponibles de un barbero' })
  getAvailability(@Query('barberId') barberId: string, @Query('date') date: string) {
    return this.appointmentsService.getAvailableSlots(barberId, date);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de una cita' })
  findOne(@Param('id') id: string) {
    return this.appointmentsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard) // Apply RolesGuard
  @Roles(UserRole.ADMIN) // Specify ADMIN role
  @ApiOperation({ summary: 'Actualizar o cancelar una cita (Admin)' })
  update(@Param('id') id: string, @Body() updateAppointmentDto: UpdateAppointmentDto) {
    return this.appointmentsService.update(id, updateAppointmentDto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard) // Apply RolesGuard
  @Roles(UserRole.ADMIN) // Specify ADMIN role
  @ApiOperation({ summary: 'Eliminar una cita (Admin)' })
  remove(@Param('id') id: string) {
    return this.appointmentsService.remove(id);
  }
}