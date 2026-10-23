import { getSantiagoAppointmentTimestamp, timeToMinutes } from '../common/time/santiago-time';
import { RemoveScheduleBlockDto } from './dto/remove-schedule-block.dto';
import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BarberSchedule, BarberScheduleDocument } from './entities/barber-schedule.schema';
import { Appointment, AppointmentDocument } from '../appointments/entities/appointment.schema';
import { CreateBarberScheduleDto } from './dto/create-barber-schedule.dto';
import { UpdateBarberScheduleDto } from './dto/update-barber-schedule.dto';
import { Barber, BarberDocument } from '../barbers/entities/barber.schema'; // Para validar que el barbero existe

export interface BarberAvailability {
  barberId: string;
  barberName: string | undefined;
  slots: { date: string; timeSlot: string }[];
}

@Injectable()
export class BarberSchedulesService {
  constructor(
    @InjectModel(BarberSchedule.name) private barberScheduleModel: Model<BarberScheduleDocument>,
    @InjectModel(Barber.name) private barberModel: Model<Barber>, // Para validar barberId
    @InjectModel(Appointment.name) private appointmentModel: Model<AppointmentDocument>, // For availability queries
  ) {}

  async create(createBarberScheduleDto: CreateBarberScheduleDto): Promise<BarberSchedule> {
    const { barberId, date } = createBarberScheduleDto;

    // 1. Verificar que el barbero exista
    const barber = await this.barberModel.findById(barberId).exec();
    if (!barber) {
      throw new NotFoundException(`Barber with ID "${barberId}" not found.`);
    }

    // 2. Verificar si ya existe un horario para este barbero en esta fecha
    const existingSchedule = await this.barberScheduleModel.findOne({ barberId, date }).exec();
    if (existingSchedule) {
      throw new ConflictException(`Schedule for barber ID "${barberId}" on date "${date}" already exists.`);
    }

    const createdSchedule = new this.barberScheduleModel(createBarberScheduleDto);
    return await createdSchedule.save();
  }

  async findAll(): Promise<BarberSchedule[]> {
    return await this.barberScheduleModel.find().populate('barberId').exec();
  }

  async findOne(id: string): Promise<BarberSchedule> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid ID format: ${id}`);
    }
    const schedule = await this.barberScheduleModel.findById(id).populate('barberId').exec();
    if (!schedule) {
      throw new NotFoundException(`Barber schedule with ID "${id}" not found.`);
    }
    return schedule;
  }

  async findByBarberAndDate(barberId: string, date: string): Promise<BarberSchedule> {
    const schedule = await this.barberScheduleModel.findOne({ barberId, date }).populate('barberId').exec();
    if (!schedule) {
      // Si no se encuentra un horario específico, podemos devolver un horario por defecto o null
      // Por ahora, lanzaremos una excepción para ser explícitos.
      throw new NotFoundException(`Schedule for barber ID "${barberId}" on date "${date}" not found.`);
    }
    return schedule;
  }

  async update(id: string, updateBarberScheduleDto: UpdateBarberScheduleDto): Promise<BarberSchedule> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid ID format: ${id}`);
    }

    const updatedSchedule = await this.barberScheduleModel.findByIdAndUpdate(id, updateBarberScheduleDto, { returnDocument: 'after' }).populate('barberId').exec();

    if (!updatedSchedule) {
      throw new NotFoundException(`Barber schedule with ID "${id}" not found.`);
    }
    return updatedSchedule;
  }

  async removeBlock(id: string, block: RemoveScheduleBlockDto): Promise<BarberSchedule> {
    if (!Types.ObjectId.isValid(id) || block.start >= block.end) {
      throw new BadRequestException('El bloque de horario no es válido.');
    }
    const schedule = await this.barberScheduleModel.findById(id).exec();
    if (!schedule) throw new NotFoundException('La agenda del día no existe.');
    if (schedule.isDayOff || !schedule.workingHours.some((item) => item.start === block.start && item.end === block.end)) {
      throw new ConflictException('El bloque ya no existe. Actualiza la agenda.');
    }
    if (getSantiagoAppointmentTimestamp(schedule.date, block.start) <= Date.now()) {
      throw new ConflictException('Solo puedes quitar bloques futuros.');
    }
    const reservations = await this.appointmentModel
      .find({ barberId: schedule.barberId, date: schedule.date, status: { $in: ['pending', 'confirmed', 'completed'] } })
      .select('timeSlot')
      .exec();
    const overlaps = reservations.some((appointment) => {
      const start = timeToMinutes(appointment.timeSlot);
      return start < timeToMinutes(block.end) && start + 60 > timeToMinutes(block.start);
    });
    if (overlaps) throw new ConflictException('El bloque tiene una reserva. Debes cancelarla antes de quitarlo.');
    const updated = await this.barberScheduleModel
      .findOneAndUpdate({ _id: id, date: schedule.date, isDayOff: false, workingHours: schedule.workingHours }, { $pull: { workingHours: { start: block.start, end: block.end } } }, { returnDocument: 'after', runValidators: true })
      .exec();
    if (!updated) throw new ConflictException('La agenda cambió. Actualízala e inténtalo nuevamente.');
    return updated;
  }

  async remove(id: string): Promise<BarberSchedule> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid ID format: ${id}`);
    }
    const deletedSchedule = await this.barberScheduleModel.findByIdAndDelete(id).exec();
    if (!deletedSchedule) {
      throw new NotFoundException(`Barber schedule with ID "${id}" not found.`);
    }
    return deletedSchedule;
  }

  // New method: getAvailability for a date range
  async getAvailability(start: string, end: string): Promise<BarberAvailability[]> {
    // Validate date strings (basic)
    if (!start || !end) {
      throw new BadRequestException('Both start and end query parameters are required.');
    }
    // Find appointments between start and end dates (inclusive)
    const appointments = await this.appointmentModel
      .find({
        date: { $gte: start, $lte: end },
      })
      .populate<{ barberId: BarberDocument | Types.ObjectId }>('barberId')
      .exec();
    // Group by barber
    const availabilityMap: Record<string, BarberAvailability> = {};
    appointments.forEach((appt) => {
      const barberId = appt.barberId._id?.toString() || (appt.barberId as { toString(): string }).toString();
      const barberName = appt.barberId instanceof Types.ObjectId ? undefined : appt.barberId.name;
      if (!availabilityMap[barberId]) {
        availabilityMap[barberId] = { barberId, barberName, slots: [] };
      }
      availabilityMap[barberId].slots.push({ date: appt.date, timeSlot: appt.timeSlot });
    });
    // Return array of barbers with busy slots; front‑end can compute free slots.
    return Object.values(availabilityMap);
  }
}
