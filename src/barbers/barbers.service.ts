import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateBarberDto } from './dto/create-barber.dto';
import { UpdateBarberDto } from './dto/update-barber.dto';
import { Barber, BarberDocument } from './entities/barber.schema'; // Updated import path

@Injectable()
export class BarbersService {
  private readonly logger = new Logger(BarbersService.name);

  constructor(@InjectModel(Barber.name) private barberModel: Model<BarberDocument>) {}

  async create(createBarberDto: CreateBarberDto): Promise<Barber> {
    this.logger.log(`Creating new barber: ${createBarberDto.email}`);
    const createdBarber = new this.barberModel(createBarberDto);
    return createdBarber.save();
  }

  async findAll(): Promise<Barber[]> {
    this.logger.debug('Finding all barbers');
    return this.barberModel.find().exec();
  }

  async findOne(id: string): Promise<Barber> {
    this.logger.debug(`Finding barber with id: ${id}`);
    const barber = await this.barberModel.findById(id).exec();
    if (!barber) {
      throw new NotFoundException(`Barber with ID "${id}" not found`);
    }
    return barber;
  }

  async update(id: string, updateBarberDto: UpdateBarberDto): Promise<Barber> {
    this.logger.log(`Updating barber with id: ${id}`);
    const existingBarber = await this.barberModel.findByIdAndUpdate(id, updateBarberDto, { new: true }).exec();
    if (!existingBarber) {
      throw new NotFoundException(`Barber with ID "${id}" not found`);
    }
    return existingBarber;
  }

  async remove(id: string): Promise<Barber> {
    this.logger.log(`Removing barber with id: ${id}`);
    const result = await this.barberModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Barber with ID "${id}" not found`);
    }
    return result;
  }
}
