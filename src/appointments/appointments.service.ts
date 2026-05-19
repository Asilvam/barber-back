import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { Model, Types } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Appointment } from './entities/appointment.schema';
import { Barber } from '../barbers/entities/barber.schema';
import { BarberSchedule } from '../barber-schedules/entities/barber-schedule.schema'; // Importamos el nuevo esquema

@Injectable()
export class AppointmentsService {
  constructor(
    @InjectModel(Appointment.name) private appointmentModel: Model<Appointment>,
    @InjectModel(Barber.name) private barberModel: Model<Barber>,
    @InjectModel(BarberSchedule.name) private barberScheduleModel: Model<BarberSchedule>, // Inyectamos el modelo de horario
  ) {}

  async create(createAppointmentDto: CreateAppointmentDto) {
    const { barberId, date, timeSlot } = createAppointmentDto;

    // 1. Verify Barber exists
    const barber = await this.barberModel.findById(barberId).exec();
    if (!barber) {
      throw new NotFoundException(`Barber with ID ${barberId} not found`);
    }

    // 2. Obtener el horario del barbero para la fecha específica
    const schedule = await this.barberScheduleModel.findOne({ barberId, date }).exec();
    if (!schedule || schedule.isDayOff) {
      throw new ConflictException(`Barber with ID ${barberId} is not available on ${date}`);
    }

    // 3. Validar que el timeSlot esté dentro de las workingHours y no en breakTimes
    const slotTime = new Date(`2000-01-01T${timeSlot}:00`); // Usamos una fecha base para comparar solo la hora

    let isWorkingHour = false;
    for (const wh of schedule.workingHours) {
      const start = new Date(`2000-01-01T${wh.start}:00`);
      const end = new Date(`2000-01-01T${wh.end}:00`);
      if (slotTime >= start && slotTime < end) { // El slot debe empezar dentro del bloque de trabajo
        isWorkingHour = true;
        break;
      }
    }

    if (!isWorkingHour) {
      throw new ConflictException(`Time slot ${timeSlot} is outside of barber's working hours on ${date}`);
    }

    for (const bt of schedule.breakTimes) {
      const start = new Date(`2000-01-01T${bt.start}:00`);
      const end = new Date(`2000-01-01T${bt.end}:00`);
      if (slotTime >= start && slotTime < end) { // El slot no debe empezar dentro de un descanso
        throw new ConflictException(`Time slot ${timeSlot} is during barber's break time on ${date}`);
      }
    }

    // 4. Check if the slot is already booked
    const existingAppointment = await this.appointmentModel
      .findOne({
        barberId: new Types.ObjectId(barberId),
        date,
        timeSlot,
        status: { $ne: 'cancelled' },
      })
      .exec();

    if (existingAppointment) {
      throw new ConflictException('This time slot is already occupied');
    }

    const createdAppointment = new this.appointmentModel(createAppointmentDto);
    return await createdAppointment.save();
  }

  async findAll() {
    return await this.appointmentModel
      .find()
      .populate('barberId')
      .sort({ date: -1, timeSlot: -1 })
      .exec();
  }

  async findOne(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid ID format: ${id}`);
    }

    const appointment = await this.appointmentModel.findById(id).populate('barberId').exec();

    if (!appointment) {
      throw new NotFoundException(`Appointment with ID ${id} not found`);
    }
    return appointment;
  }

  async update(id: string, updateAppointmentDto: UpdateAppointmentDto) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid ID format: ${id}`);
    }

    const updatedAppointment = await this.appointmentModel
      .findByIdAndUpdate(id, updateAppointmentDto, { new: true })
      .populate('barberId')
      .exec();

    if (!updatedAppointment) {
      throw new NotFoundException(`Appointment with ID ${id} not found`);
    }

    return updatedAppointment;
  }

  async remove(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid ID format: ${id}`);
    }

    const deletedAppointment = await this.appointmentModel.findByIdAndDelete(id).exec();

    if (!deletedAppointment) {
      throw new NotFoundException(`Appointment with ID ${id} not found`);
    }

    return deletedAppointment;
  }

  async getAvailableSlots(barberId: string, date: string) {
    // 1. Verificar que el barbero exista
    const barber = await this.barberModel.findById(barberId).exec();
    if (!barber) {
      throw new NotFoundException(`Barber with ID ${barberId} not found`);
    }

    // 2. Obtener el horario del barbero para la fecha específica
    const schedule = await this.barberScheduleModel.findOne({ barberId, date }).exec();

    if (!schedule || schedule.isDayOff) {
      return {
        date,
        barberId,
        availableSlots: [], // No hay slots disponibles si el barbero no trabaja o no tiene horario
      };
    }

    // Configuración de la duración de los slots (asumimos 1 hora por ahora, o podríamos obtenerla del servicio)
    const slotDurationMinutes = 60; // Asumimos slots de 60 minutos

    const allPossibleSlots: string[] = [];

    for (const wh of schedule.workingHours) {
      let currentSlotTime = new Date(`2000-01-01T${wh.start}:00`);
      const endWorkingTime = new Date(`2000-01-01T${wh.end}:00`);

      while (currentSlotTime.getTime() < endWorkingTime.getTime()) {
        const slotEnd = new Date(currentSlotTime.getTime() + slotDurationMinutes * 60 * 1000);

        // Asegurarse de que el slot no se extienda más allá del final del bloque de trabajo
        if (slotEnd.getTime() > endWorkingTime.getTime()) {
          break;
        }

        const formattedSlot = currentSlotTime.toTimeString().slice(0, 5); // HH:MM

        // Verificar si el slot cae dentro de un breakTime
        let isDuringBreak = false;
        for (const bt of schedule.breakTimes) {
          const breakStart = new Date(`2000-01-01T${bt.start}:00`);
          const breakEnd = new Date(`2000-01-01T${bt.end}:00`);

          // Si el slot actual empieza en o después del inicio del break y termina en o antes del fin del break
          // O si el slot actual se superpone con el break
          if (
            (currentSlotTime.getTime() >= breakStart.getTime() && currentSlotTime.getTime() < breakEnd.getTime()) ||
            (slotEnd.getTime() > breakStart.getTime() && slotEnd.getTime() <= breakEnd.getTime()) ||
            (breakStart.getTime() >= currentSlotTime.getTime() && breakStart.getTime() < slotEnd.getTime())
          ) {
            isDuringBreak = true;
            break;
          }
        }

        if (!isDuringBreak) {
          allPossibleSlots.push(formattedSlot);
        }

        currentSlotTime = slotEnd; // Mover al siguiente slot
      }
    }

    // 3. Buscar en MongoDB las horas que ya están reservadas para ese barbero ese día específico
    const bookedAppointments = await this.appointmentModel
      .find({
        barberId: new Types.ObjectId(barberId),
        date: date,
        status: { $ne: 'cancelled' }, // Ignorar citas canceladas para liberar el bloque
      })
      .select('timeSlot')
      .exec();

    // Extraer solo los strings de las horas reservadas: ['13:00', '17:00']
    const bookedSlots = bookedAppointments.map((app) => app.timeSlot);

    // 4. Filtrar los bloques teóricos quitando los que ya están ocupados
    const availableSlots = allPossibleSlots.filter((slot) => !bookedSlots.includes(slot));

    return {
      date,
      barberId,
      availableSlots,
    };
  }
}
