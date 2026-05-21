import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, Req, Logger } from '@nestjs/common'; // Importamos Logger
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { Request } from 'express';

// Extendemos el tipo Request para incluir el usuario de JWT con la propiedad correcta
interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    email: string;
    role: UserRole;
  };
}

@ApiTags('Appointments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('appointments')
export class AppointmentsController {
  private readonly logger = new Logger(AppointmentsController.name); // Instanciar Logger

  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  @ApiOperation({ summary: 'Crear una nueva cita' })
  create(@Body() createAppointmentDto: CreateAppointmentDto, @Req() req: AuthenticatedRequest) {
    const clientId = req.user.userId;
    this.logger.log(`Received request to create appointment for client ${clientId}. Data: ${JSON.stringify(createAppointmentDto)}`);
    return this.appointmentsService.create(clientId, createAppointmentDto);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Listar todas las citas (Admin: Agenda completa)' })
  findAll() {
    this.logger.log('Received request to list all appointments (Admin).');
    return this.appointmentsService.findAll();
  }

  @Get('availability')
  @ApiOperation({ summary: 'Consultar horarios disponibles de un barbero' })
  getAvailability(@Query('barberId') barberId: string, @Query('date') date: string) {
    this.logger.log(`Received request for availability for barber ${barberId} on ${date}.`);
    return this.appointmentsService.getAvailableSlots(barberId, date);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de una cita' })
  findOne(@Param('id') id: string) {
    this.logger.log(`Received request to find appointment with ID: ${id}.`);
    return this.appointmentsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar o cancelar una cita (Admin)' })
  update(@Param('id') id: string, @Body() updateAppointmentDto: UpdateAppointmentDto) {
    this.logger.log(`Received request to update appointment ${id}. Data: ${JSON.stringify(updateAppointmentDto)}`);
    return this.appointmentsService.update(id, updateAppointmentDto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar una cita (Admin)' })
  remove(@Param('id') id: string) {
    this.logger.log(`Received request to remove appointment with ID: ${id}.`);
    return this.appointmentsService.remove(id);
  }
}
