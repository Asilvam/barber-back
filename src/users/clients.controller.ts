import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from './schemas/user.schema';
import { BookingAccessDto } from './dto/booking-access.dto';
import { UsersService } from './users.service';

@ApiTags('Clients')
@ApiBearerAuth()
@Controller('clients')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ClientsController {
  constructor(private readonly users: UsersService) {}

  @Get()
  findClients() {
    return this.users.findClients();
  }

  @Patch(':id/booking-access')
  setBookingAccess(@Param('id') id: string, @Body() dto: BookingAccessDto, @Req() req: { user: { userId: string } }) {
    return this.users.setBookingAccess(id, dto.blocked, dto.reason, req.user.userId);
  }
}
