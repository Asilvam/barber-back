import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BarberSchedule, BarberScheduleDocument } from './entities/barber-schedule.schema';
import { Appointment, AppointmentDocument } from '../appointments/entities/appointment.schema';
import { CreateBarberScheduleDto } from './dto/create-barber-schedule.dto';
import { UpdateBarberScheduleDto } from './dto/update-barber-schedule.dto';
import { Barber } from '../barbers/entities/barber.schema'; // Para validar que el barbero existe

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

    const updatedSchedule = await this.barberScheduleModel.findByIdAndUpdate(id, updateBarberScheduleDto, { new: true }).populate('barberId').exec();

    if (!updatedSchedule) {
      throw new NotFoundException(`Barber schedule with ID "${id}" not found.`);
    }
    return updatedSchedule;
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
  async getAvailability(start: string, end: string): Promise<any> {
    // Validate date strings (basic)
    if (!start || !end) {
      throw new BadRequestException('Both start and end query parameters are required.');
    }
    // Find appointments between start and end dates (inclusive)
    const appointments = await this.appointmentModel
      .find({
        date: { $gte: start, $lte: end },
      })
      .populate('barberId')
      .exec();
    // Group by barber
    const availabilityMap: Record<string, any> = {};
    appointments.forEach((appt) => {
      const barberId = (appt.barberId as any)._id?.toString() || (appt.barberId as any).toString();
      const barberName = (appt.barberId as any).name;
      if (!availabilityMap[barberId]) {
        availabilityMap[barberId] = { barberId, barberName, slots: [] };
      }
      availabilityMap[barberId].slots.push({ date: appt.date, timeSlot: (appt as any).timeSlot });
    });
    // Return array of barbers with busy slots; front‑end can compute free slots.
    return Object.values(availabilityMap);
  }
}