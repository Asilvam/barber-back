import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { UpdateUserDto } from './dto/update-user.dto'; // Import UpdateUserDto

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  findByEmail(email: string) {
    this.logger.debug(`Find by email email=${email}`);
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  findByGoogleId(googleId: string) {
    this.logger.debug(`Find by googleId googleId=${googleId}`);
    return this.userModel.findOne({ googleId }).exec();
  }

  createLocalUser(params: { name: string; email: string; passwordHash: string }) {
    this.logger.log(`Create local user email=${params.email}`);
    const user = new this.userModel({
      name: params.name,
      email: params.email.toLowerCase(),
      passwordHash: params.passwordHash,
      provider: 'local',
      emailVerified: true,
    });
    return user.save();
  }

  createGoogleUser(params: { name: string; email: string; googleId: string }) {
    this.logger.log(`Create google user email=${params.email}`);
    const user = new this.userModel({
      name: params.name,
      email: params.email.toLowerCase(),
      googleId: params.googleId,
      provider: 'google',
      emailVerified: true,
    });
    return user.save();
  }

  setGoogleId(userId: string, googleId: string) {
    this.logger.log(`Attach googleId userId=${userId}`);
    return this.userModel.findByIdAndUpdate(userId, { googleId, provider: 'google' }, { returnDocument: 'after' }).exec();
  }

  // New CRUD methods for UsersController
  async findAll(): Promise<User[]> {
    this.logger.debug('Finding all users');
    return this.userModel.find().exec();
  }

  async findOne(id: string): Promise<User> {
    this.logger.debug(`Finding user with id: ${id}`);
    const user = await this.userModel.findById(id).exec();
    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }
    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    this.logger.log(`Updating user with id: ${id}`);
    const existingUser = await this.userModel.findByIdAndUpdate(id, updateUserDto, { returnDocument: 'after' }).exec();
    if (!existingUser) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }
    return existingUser;
  }

  async remove(id: string): Promise<User> {
    this.logger.log(`Removing user with id: ${id}`);
    const result = await this.userModel.findByIdAndDelete(id).exec(); // Changed to findByIdAndDelete
    if (!result) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }
    return result;
  }
}