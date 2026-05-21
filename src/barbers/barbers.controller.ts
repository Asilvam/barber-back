import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Logger } from '@nestjs/common'; // Importamos Logger
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
  private readonly logger = new Logger(BarbersController.name); // Instanciar Logger

  constructor(private readonly barbersService: BarbersService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear un nuevo barbero (Admin)' })
  create(@Body() createBarberDto: CreateBarberDto) {
    this.logger.log(`Received request to create barber. Data: ${JSON.stringify(createBarberDto)}`);
    return this.barbersService.create(createBarberDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos los barberos' })
  findAll() {
    this.logger.log('Received request to list all barbers.');
    return this.barbersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de un barbero' })
  findOne(@Param('id') id: string) {
    this.logger.log(`Received request to find barber with ID: ${id}.`);
    return this.barbersService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar información del barbero' })
  update(@Param('id') id: string, @Body() updateBarberDto: UpdateBarberDto) {
    this.logger.log(`Received request to update barber ${id}. Data: ${JSON.stringify(updateBarberDto)}`);
    return this.barbersService.update(id, updateBarberDto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Eliminar un barbero (Admin)' })
  remove(@Param('id') id: string) {
    this.logger.log(`Received request to remove barber with ID: ${id}.`);
    return this.barbersService.remove(id);
  }
}
