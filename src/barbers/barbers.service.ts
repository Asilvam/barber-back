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
    this.logger.log(`Attempting to create new barber: ${createBarberDto.email}`);
    const createdBarber = new this.barberModel(createBarberDto);
    const savedBarber = await createdBarber.save();
    this.logger.log(`Barber ${savedBarber.email} created successfully with ID: ${savedBarber._id.toString()}`);
    return savedBarber;
  }

  async findAll(): Promise<Barber[]> {
    this.logger.debug('Finding all barbers');
    const barbers = await this.barberModel.find().exec();
    this.logger.debug(`Found ${barbers.length} barbers.`);
    return barbers;
  }

  async findOne(id: string): Promise<Barber> {
    this.logger.debug(`Finding barber with ID: ${id}`);
    const barber = await this.barberModel.findById(id).exec();
    if (!barber) {
      this.logger.warn(`Barber with ID ${id} not found.`);
      throw new NotFoundException(`Barber with ID "${id}" not found`);
    }
    this.logger.debug(`Barber ${id} found.`);
    return barber;
  }

  async update(id: string, updateBarberDto: UpdateBarberDto): Promise<Barber> {
    this.logger.log(`Attempting to update barber with ID: ${id}. Data: ${JSON.stringify(updateBarberDto)}`);
    const existingBarber = await this.barberModel.findByIdAndUpdate(id, updateBarberDto, { new: true }).exec();
    if (!existingBarber) {
      this.logger.warn(`Barber with ID ${id} not found for update.`);
      throw new NotFoundException(`Barber with ID "${id}" not found`);
    }
    this.logger.log(`Barber ${id} updated successfully.`);
    return existingBarber;
  }

  async remove(id: string): Promise<Barber> {
    this.logger.log(`Attempting to remove barber with ID: ${id}.`);
    const result = await this.barberModel.findByIdAndDelete(id).exec();
    if (!result) {
      this.logger.warn(`Barber with ID ${id} not found for removal.`);
      throw new NotFoundException(`Barber with ID "${id}" not found`);
    }
    this.logger.log(`Barber ${id} removed successfully.`);
    return result;
  }
}
