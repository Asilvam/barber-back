import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, Req, Logger, ForbiddenException, ConflictException } from '@nestjs/common'; // Importamos Logger
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

  @Get('me/active')
  @ApiOperation({ summary: 'Obtener la cita activa del cliente autenticado' })
  getMyActiveAppointment(@Req() req: AuthenticatedRequest) {
    const clientId = req.user.userId;
    this.logger.log(`Received request to get active appointment for client ${clientId}.`);
    return this.appointmentsService.findActiveByClient(clientId);
  }

  @Patch('me/:id/cancel')
  @ApiOperation({ summary: 'Cancelar la cita propia activa del cliente autenticado' })
  async cancelMyAppointment(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const clientId = req.user.userId;
    this.logger.log(`Received self-cancel request for appointment ${id} from client ${clientId}.`);

    const appointment = await this.appointmentsService.findOne(id);
    const appointmentClientId = this.extractClientId((appointment as { clientId?: unknown }).clientId);

    if (appointmentClientId !== clientId) {
      throw new ForbiddenException('No tienes permisos para cancelar esta cita');
    }

    if (!['pending', 'confirmed'].includes(appointment.status)) {
      throw new ConflictException('Solo se pueden cancelar citas pendientes o confirmadas');
    }

    return this.appointmentsService.update(id, { status: 'cancelled' });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de una cita' })
  async findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    this.logger.log(`Received request to find appointment with ID: ${id}.`);
    const appointment = await this.appointmentsService.findOne(id);

    const clientValue = (appointment as { clientId?: unknown }).clientId;
    const clientId = this.extractClientId(clientValue);
    const isAdmin = req.user.role === UserRole.ADMIN;
    const isOwner = req.user.userId === clientId;

    if (!isAdmin && !isOwner) {
      throw new ForbiddenException('No tienes permisos para acceder a este recurso');
    }

    return appointment;
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

  private extractClientId(clientValue: unknown): string {
    if (!clientValue) {
      return '';
    }

    if (typeof clientValue === 'string') {
      return clientValue;
    }

    if (typeof clientValue === 'object' && clientValue !== null) {
      const candidate = clientValue as { _id?: unknown; toString?: () => string };
      if (typeof candidate._id === 'string') {
        return candidate._id;
      }
      if (candidate._id && typeof (candidate._id as { toString?: () => string }).toString === 'function') {
        return (candidate._id as { toString: () => string }).toString();
      }
      if (typeof candidate.toString === 'function') {
        return candidate.toString();
      }
    }

    return '';
  }
}
