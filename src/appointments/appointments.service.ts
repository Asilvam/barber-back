import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common'; // Importar Logger
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { Model, Types } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserRole } from '../users/schemas/user.schema';
import { Appointment, AppointmentDocument } from './entities/appointment.schema';
import { Barber } from '../barbers/entities/barber.schema';
import { BarberSchedule } from '../barber-schedules/entities/barber-schedule.schema';
import {
  BUSINESS_TIME_ZONE,
  getSantiagoDateTime,
  minutesToTime,
  timeToMinutes,
} from '../common/time/santiago-time';
import { EmailService } from '../email/email.service';

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name); // Instanciar Logger

  constructor(
    @InjectModel(Appointment.name) private appointmentModel: Model<Appointment>,
    @InjectModel(Barber.name) private barberModel: Model<Barber>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(BarberSchedule.name) private barberScheduleModel: Model<BarberSchedule>,
    private readonly emailService?: EmailService,
  ) {}

  private isMongoDuplicateKeyError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 11000;
  }

  private buildSlotKey(barberId: string, date: string, timeSlot: string): string {
    return `${barberId}:${date}:${timeSlot}`;
  }

  private formatReferenceForLog(value: unknown) {
    if (!value) {
      return null;
    }

    if (typeof value === 'string') {
      return { id: value };
    }

    if (value instanceof Types.ObjectId) {
      return { id: value.toString() };
    }

    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const rawId = record._id;
      const id = rawId instanceof Types.ObjectId
        ? rawId.toString()
        : typeof rawId === 'string'
          ? rawId
          : typeof value.toString === 'function'
            ? value.toString()
            : undefined;

      return {
        id,
        name: typeof record.name === 'string' ? record.name : undefined,
        email: typeof record.email === 'string' ? record.email : undefined,
        phone: typeof record.phone === 'string' ? record.phone : undefined,
        role: typeof record.role === 'string' ? record.role : undefined,
      };
    }

    return { id: String(value) };
  }

  private formatAppointmentForLog(appointment: AppointmentDocument) {
    const record = appointment as AppointmentDocument & {
      _id?: unknown;
      createdAt?: unknown;
      updatedAt?: unknown;
    };

    return {
      id: this.formatReferenceForLog(record._id)?.id,
      date: appointment.date,
      timeSlot: appointment.timeSlot,
      status: appointment.status,
      barber: this.formatReferenceForLog(appointment.barberId),
      client: this.formatReferenceForLog(appointment.clientId),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private getAppointmentCutoff() {
    return getSantiagoDateTime();
  }

  private isAppointmentSlotExpired(date: string, timeSlot: string) {
    const { today, currentTime } = this.getAppointmentCutoff();
    return date < today || (date === today && timeSlot < currentTime);
  }

  private validateAppointmentSlotIsNotExpired(date: string, timeSlot: string) {
    if (this.isAppointmentSlotExpired(date, timeSlot)) {
      this.logger.warn(`Attempted to use expired time slot ${timeSlot} on ${date}.`);
      throw new ConflictException('Este horario ya venció y no se puede reservar.');
    }
  }

  private getNonExpiredDateTimeFilter(date?: string, timeSlot?: string): Record<string, unknown> | null {
    const { today, currentTime } = this.getAppointmentCutoff();

    if (!date) {
      return {
        $or: [
          { date: { $gt: today } },
          { date: today, timeSlot: { $gte: currentTime } },
        ],
      };
    }

    if (date < today) {
      return null;
    }

    if (date > today) {
      return timeSlot ? { date, timeSlot } : { date };
    }

    if (timeSlot) {
      return timeSlot >= currentTime ? { date, timeSlot } : null;
    }

    return { date, timeSlot: { $gte: currentTime } };
  }

  private getNonExpiredActiveAppointmentFilter(clientId: string) {
    const dateTimeFilter = this.getNonExpiredDateTimeFilter();

    return {
      clientId: new Types.ObjectId(clientId),
      status: { $in: ['pending', 'confirmed'] },
      ...dateTimeFilter,
    };
  }

  private getNonExpiredBarberAppointmentFilter(barberId: string, date: string, timeSlot?: string) {
    const dateTimeFilter = this.getNonExpiredDateTimeFilter(date, timeSlot);

    if (!dateTimeFilter) {
      return null;
    }

    return {
      barberId: { $in: [new Types.ObjectId(barberId), barberId] },
      status: { $in: ['pending', 'confirmed', 'completed'] },
      ...dateTimeFilter,
    };
  }

  private async validateBarberAvailabilityForSlot(barberId: string, date: string, timeSlot: string) {
    const barber = await this.barberModel.findById(barberId).exec();
    if (!barber) {
      this.logger.warn(`Barber with ID ${barberId} not found during appointment validation.`);
      throw new NotFoundException(`Barber with ID ${barberId} not found`);
    }
    this.logger.debug(`Barber ${barberId} found.`);

    const schedule = await this.barberScheduleModel.findOne({ barberId, date }).exec();
    if (!schedule || schedule.isDayOff) {
      this.logger.warn(`Barber ${barberId} is not available on ${date} (no schedule or day off).`);
      throw new ConflictException(`Barber with ID ${barberId} is not available on ${date}`);
    }
    this.logger.debug(`Schedule found for barber ${barberId} on ${date}.`);

    const slotMinutes = timeToMinutes(timeSlot);
    let isWorkingHour = false;

    for (const wh of schedule.workingHours) {
      const startMinutes = timeToMinutes(wh.start);
      const endMinutes = timeToMinutes(wh.end);
      if (slotMinutes >= startMinutes && slotMinutes < endMinutes) {
        isWorkingHour = true;
        break;
      }
    }

    if (!isWorkingHour) {
      this.logger.warn(`Time slot ${timeSlot} is outside of barber ${barberId}'s working hours on ${date}.`);
      throw new ConflictException(`Time slot ${timeSlot} is outside of barber's working hours on ${date}`);
    }
    this.logger.debug(`Time slot ${timeSlot} is within working hours.`);

    for (const bt of schedule.breakTimes) {
      const startMinutes = timeToMinutes(bt.start);
      const endMinutes = timeToMinutes(bt.end);
      if (slotMinutes >= startMinutes && slotMinutes < endMinutes) {
        this.logger.warn(`Time slot ${timeSlot} is during barber ${barberId}'s break time on ${date}.`);
        throw new ConflictException(`Time slot ${timeSlot} is during barber's break time on ${date}`);
      }
    }
    this.logger.debug(`Time slot ${timeSlot} is not during break time.`);
    return barber;
  }

  async create(clientId: string, createAppointmentDto: CreateAppointmentDto): Promise<Appointment> {
    this.logger.log(`Attempting to create appointment for client ${clientId} with data: ${JSON.stringify(createAppointmentDto)}`);
    const { barberId, date, timeSlot } = createAppointmentDto;

    // 1. Verify Client (User) exists
    const client = await this.userModel.findById(clientId).exec();
    if (!client) {
      this.logger.warn(`Client with ID ${clientId} not found during appointment creation.`);
      throw new NotFoundException(`Client with ID ${clientId} not found`);
    }
    this.logger.debug(`Client ${clientId} found.`);

    // 2. Los clientes tienen una sola reserva activa; los administradores pueden
    // crear varias a su nombre mientras el bloque solicitado siga disponible.
    if (client.role !== UserRole.ADMIN) {
      const existingActiveAppointment = await this.appointmentModel
        .findOne(this.getNonExpiredActiveAppointmentFilter(clientId))
        .populate('barberId')
        .populate('clientId', '_id name email role provider emailVerified createdAt updatedAt')
        .exec();
      if (existingActiveAppointment) {
        this.logger.warn(`Client ${clientId} already has an active appointment: ${JSON.stringify(this.formatAppointmentForLog(existingActiveAppointment))}.`);
        throw new ConflictException('Ya tienes una reserva activa. Debes completar o cancelar tu cita actual antes de programar una nueva.');
      }
      this.logger.debug(`Client ${clientId} has no non-expired active appointments.`);
    } else {
      this.logger.debug(`Admin ${clientId} can create multiple active appointments.`);
    }

    // 3. Reject expired slots before checking barber schedule rules
    this.validateAppointmentSlotIsNotExpired(date, timeSlot);

    // 4. Validate barber availability and schedule rules
    const barber = await this.validateBarberAvailabilityForSlot(barberId, date, timeSlot);

    // 5. Check if the slot is already booked
    const slotConflictFilter = this.getNonExpiredBarberAppointmentFilter(barberId, date, timeSlot);
    const existingAppointment = slotConflictFilter
      ? await this.appointmentModel.findOne(slotConflictFilter).exec()
      : null;

    if (existingAppointment) {
      this.logger.warn(`Time slot ${timeSlot} for barber ${barberId} on ${date} is already occupied.`);
      throw new ConflictException('This time slot is already occupied');
    }
    this.logger.debug(`Time slot ${timeSlot} is available.`);

    const createdAppointment = new this.appointmentModel({
      ...createAppointmentDto,
      clientId: new Types.ObjectId(clientId),
      slotKey: this.buildSlotKey(barberId, date, timeSlot),
    });
    let savedAppointment: AppointmentDocument;
    try {
      savedAppointment = await createdAppointment.save();
    } catch (error) {
      if (this.isMongoDuplicateKeyError(error)) {
        this.logger.warn(`Duplicate appointment detected at persistence layer for barber ${barberId} on ${date} ${timeSlot}.`);
        throw new ConflictException('This time slot is already occupied');
      }
      throw error;
    }
    this.logger.log(`Appointment ${savedAppointment._id.toString()} created successfully for client ${clientId} with barber ${barberId} on ${date} at ${timeSlot}.`);
    await this.notifyAppointmentCreated(client.email, client.name, barber.name, date, timeSlot);
    return savedAppointment;
  }

  private async notifyAppointmentCreated(to: string, clientName: string, barberName: string, date: string, timeSlot: string): Promise<void> {
    if (!this.emailService) {
      return;
    }

    try {
      await this.emailService.sendAppointmentCreatedEmail({
        to,
        clientName,
        barberName,
        date,
        timeSlot,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Appointment was created, but its confirmation email failed for ${to}: ${message}`);
    }
  }

  async findAll() {
    this.logger.debug('Finding all appointments.');
    return await this.appointmentModel
      .find()
      .populate('barberId')
      .populate('clientId', '_id name email role provider emailVerified createdAt updatedAt')
      .sort({ date: -1, timeSlot: -1 })
      .exec();
  }

  async findOne(id: string) {
    this.logger.debug(`Finding appointment with ID: ${id}.`);
    if (!Types.ObjectId.isValid(id)) {
      this.logger.warn(`Invalid ID format: ${id} for findOne appointment.`);
      throw new BadRequestException(`Invalid ID format: ${id}`);
    }

    const appointment = await this.appointmentModel
      .findById(id)
      .populate('barberId')
      .populate('clientId', '_id name email role provider emailVerified createdAt updatedAt')
      .exec();

    if (!appointment) {
      this.logger.warn(`Appointment with ID ${id} not found.`);
      throw new NotFoundException(`Appointment with ID ${id} not found`);
    }
    this.logger.debug(`Appointment ${id} found.`);
    return appointment;
  }

  async findActiveByClient(clientId: string) {
    this.logger.debug(`Finding active appointment for client ${clientId}.`);
    if (!Types.ObjectId.isValid(clientId)) {
      this.logger.warn(`Invalid client ID format: ${clientId} for active appointment lookup.`);
      throw new BadRequestException(`Invalid client ID format: ${clientId}`);
    }

    const appointment = await this.appointmentModel
      .findOne(this.getNonExpiredActiveAppointmentFilter(clientId))
      .populate('barberId')
      .populate('clientId', '_id name email role provider emailVerified createdAt updatedAt')
      .sort({ date: 1, timeSlot: 1 })
      .exec();

    if (appointment) {
      this.logger.debug(`Active appointment found for client ${clientId}: ${JSON.stringify(this.formatAppointmentForLog(appointment))}.`);
    } else {
      this.logger.debug(`No active appointment found for client ${clientId}.`);
    }

    return appointment;
  }

  async update(
    id: string,
    updateAppointmentDto: UpdateAppointmentDto,
    cancellationActor?: 'user' | 'admin',
  ): Promise<AppointmentDocument> {
    this.logger.log(`Attempting to update appointment ${id} with data: ${JSON.stringify(updateAppointmentDto)}`);
    if (!Types.ObjectId.isValid(id)) {
      this.logger.warn(`Invalid ID format: ${id} for update appointment.`);
      throw new BadRequestException(`Invalid ID format: ${id}`);
    }

    const currentAppointment = await this.appointmentModel.findById(id).exec();
    if (!currentAppointment) {
      this.logger.warn(`Appointment with ID ${id} not found for update.`);
      throw new NotFoundException(`Appointment with ID ${id} not found`);
    }
    this.logger.debug(`Current appointment ${id} found for update.`);

    if (currentAppointment.status === 'cancelled') {
      this.logger.warn(`Appointment ${id} is cancelled and cannot be modified.`);
      throw new ConflictException('Una reserva cancelada es definitiva y no puede modificarse.');
    }

    const barberId = updateAppointmentDto.barberId || (currentAppointment.barberId as Types.ObjectId).toString();
    const date = updateAppointmentDto.date || currentAppointment.date;
    const timeSlot = updateAppointmentDto.timeSlot || currentAppointment.timeSlot;
    const status = updateAppointmentDto.status || currentAppointment.status;
    const changesSlot = Boolean(updateAppointmentDto.date || updateAppointmentDto.timeSlot || updateAppointmentDto.barberId);

    if (status !== 'cancelled' && changesSlot) {
      this.validateAppointmentSlotIsNotExpired(date, timeSlot);
      await this.validateBarberAvailabilityForSlot(barberId, date, timeSlot);

      this.logger.debug(`Checking for conflicts for updated appointment: barberId=${barberId}, date=${date}, timeSlot=${timeSlot}`);
      const conflict = await this.appointmentModel
        .findOne({
          _id: { $ne: id },
          barberId: new Types.ObjectId(barberId),
          date,
          timeSlot,
          status: { $ne: 'cancelled' },
        })
        .exec();

      if (conflict) {
        this.logger.warn(`Conflict detected for appointment ${id} with new schedule: barberId=${barberId}, date=${date}, timeSlot=${timeSlot}.`);
        throw new ConflictException('El nuevo horario o barbero seleccionado ya tiene una reserva activa.');
      }
      this.logger.debug('No conflicts detected for updated appointment schedule.');
    }

    const persistenceUpdate: {
      $set: Record<string, unknown>;
      $unset?: { slotKey: 1 };
    } = {
      $set: { ...updateAppointmentDto },
    };

    if (status === 'cancelled') {
      if (cancellationActor) {
        persistenceUpdate.$set.cancelledBy = cancellationActor;
      }
      persistenceUpdate.$set.cancelledAt = new Date();
      persistenceUpdate.$unset = { slotKey: 1 };
    } else {
      persistenceUpdate.$set.slotKey = this.buildSlotKey(barberId, date, timeSlot);
    }

    let updatedAppointment: AppointmentDocument | null;
    try {
      updatedAppointment = await this.appointmentModel
        .findByIdAndUpdate(id, persistenceUpdate, { returnDocument: 'after', runValidators: true })
        .populate('barberId')
        .populate('clientId', '_id name email role provider emailVerified createdAt updatedAt')
        .exec();
    } catch (error) {
      if (this.isMongoDuplicateKeyError(error)) {
        this.logger.warn(`Duplicate appointment detected at update persistence layer for appointment ${id}.`);
        throw new ConflictException('El nuevo horario o barbero seleccionado ya tiene una reserva activa.');
      }
      throw error;
    }

    if (!updatedAppointment) {
      this.logger.error(`Failed to update appointment ${id} despite finding it.`);
      throw new NotFoundException(`Appointment with ID ${id} not found`); // Should theoretically not happen if currentAppointment was found
    }
    this.logger.log(`Appointment ${id} updated successfully.`);
    if (currentAppointment.status !== 'cancelled' && updatedAppointment.status === 'cancelled') {
      if (this.isAppointmentSlotExpired(updatedAppointment.date, updatedAppointment.timeSlot)) {
        this.logger.debug(`Skipping cancellation email for expired appointment ${id}.`);
      } else {
        await this.notifyAppointmentCancelled(updatedAppointment);
      }
    }
    return updatedAppointment;
  }

  private async notifyAppointmentCancelled(appointment: AppointmentDocument): Promise<void> {
    if (!this.emailService) {
      return;
    }

    const client = appointment.clientId as User;
    const barber = appointment.barberId as Barber;
    if (!client.email || !client.name || !barber.name) {
      this.logger.warn(`Appointment ${appointment._id.toString()} was cancelled, but its populated email data is incomplete.`);
      return;
    }

    try {
      await this.emailService.sendAppointmentCancelledEmail({
        to: client.email,
        clientName: client.name,
        barberName: barber.name,
        date: appointment.date,
        timeSlot: appointment.timeSlot,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Appointment was cancelled, but its notification email failed for ${client.email}: ${message}`);
    }
  }

  async remove(id: string) {
    this.logger.log(`Attempting to remove appointment with ID: ${id}.`);
    if (!Types.ObjectId.isValid(id)) {
      this.logger.warn(`Invalid ID format: ${id} for remove appointment.`);
      throw new BadRequestException(`Invalid ID format: ${id}`);
    }

    const deletedAppointment = await this.appointmentModel.findByIdAndDelete(id).exec();

    if (!deletedAppointment) {
      this.logger.warn(`Appointment with ID ${id} not found for removal.`);
      throw new NotFoundException(`Appointment with ID ${id} not found`);
    }
    this.logger.log(`Appointment ${id} removed successfully.`);
    return deletedAppointment;
  }

  async getAvailableSlots(barberId: string, date: string) {
    this.logger.debug(`Getting available slots for barber ${barberId} on ${date}.`);
    if (!Types.ObjectId.isValid(barberId)) {
      throw new BadRequestException(`El ID del barbero no es válido: ${barberId}`);
    }
    // 1. Verificar que el barbero exista
    const barber = await this.barberModel.findById(barberId).exec();
    if (!barber) {
      this.logger.warn(`Barber with ID ${barberId} not found when getting available slots.`);
      throw new NotFoundException(`Barber with ID ${barberId} not found`);
    }
    this.logger.debug(`Barber ${barberId} found for slot availability check.`);

    // 2. Obtener el horario del barbero para la fecha específica
    const schedule = await this.barberScheduleModel.findOne({ barberId, date }).exec();

    if (!schedule || schedule.isDayOff) {
      this.logger.debug(`Barber ${barberId} is not available on ${date} (no schedule or day off). Returning empty slots.`);
      return {
        date,
        barberId,
        availableSlots: [],
        occupiedSlots: [],
        expiredSlots: [],
        slots: [],
      };
    }
    this.logger.debug(`Schedule found for barber ${barberId} on ${date}. Working hours: ${JSON.stringify(schedule.workingHours)}, Break times: ${JSON.stringify(schedule.breakTimes)}`);
    const cutoff = this.getAppointmentCutoff();
    this.logger.debug(`Availability cutoff in ${BUSINESS_TIME_ZONE}: ${cutoff.today} ${cutoff.currentTime}.`);

    const slotDurationMinutes = 60;
    const allPossibleSlots: string[] = [];

    for (const wh of schedule.workingHours) {
      const workingStart = timeToMinutes(wh.start);
      const workingEnd = timeToMinutes(wh.end);

      for (
        let currentSlot = workingStart;
        currentSlot + slotDurationMinutes <= workingEnd;
        currentSlot += slotDurationMinutes
      ) {
        const slotEnd = currentSlot + slotDurationMinutes;
        const formattedSlot = minutesToTime(currentSlot);

        let isDuringBreak = false;
        for (const bt of schedule.breakTimes) {
          const breakStart = timeToMinutes(bt.start);
          const breakEnd = timeToMinutes(bt.end);

          if (currentSlot < breakEnd && slotEnd > breakStart) {
            isDuringBreak = true;
            break;
          }
        }

        if (!isDuringBreak) {
          allPossibleSlots.push(formattedSlot);
        }
      }
    }
    this.logger.debug(`Generated ${allPossibleSlots.length} possible slots before checking bookings.`);

    // 3. Buscar en MongoDB las horas que ya están reservadas para ese barbero ese día específico
    const bookedFilter = this.getNonExpiredBarberAppointmentFilter(barberId, date);
    this.logger.debug(`Booking lookup filter for barber ${barberId} on ${date}: ${JSON.stringify(bookedFilter)}.`);
    const bookedAppointments = bookedFilter
      ? await this.appointmentModel
        .find(bookedFilter)
        .select('_id timeSlot status barberId clientId')
        .exec()
      : [];

    const bookedSlots = bookedAppointments.map((app) => app.timeSlot);
    this.logger.debug(`Found ${bookedSlots.length} booked slots: ${bookedSlots.join(', ')}. Appointments: ${JSON.stringify(bookedAppointments.map((app) => this.formatAppointmentForLog(app)))}.`);

    const expiredSlots = allPossibleSlots.filter((slot) => this.isAppointmentSlotExpired(date, slot));
    const occupiedSlots = bookedSlots.filter((slot) => allPossibleSlots.includes(slot));
    const unavailableSlots = new Set([...occupiedSlots, ...expiredSlots]);

    // 4. Filtrar los bloques teóricos quitando los que ya están ocupados o vencidos
    const availableSlots = allPossibleSlots.filter((slot) => !unavailableSlots.has(slot));
    const slots = allPossibleSlots.map((slot) => {
      if (occupiedSlots.includes(slot)) {
        return { time: slot, status: 'occupied' };
      }

      if (expiredSlots.includes(slot)) {
        return { time: slot, status: 'expired' };
      }

      return { time: slot, status: 'available' };
    });

    this.logger.debug(`Expired slots: ${expiredSlots.join(', ')}.`);
    this.logger.debug(`Final available slots: ${availableSlots.join(', ')}.`);

    return {
      date,
      barberId,
      availableSlots,
      occupiedSlots,
      expiredSlots,
      slots,
    };
  }
}
