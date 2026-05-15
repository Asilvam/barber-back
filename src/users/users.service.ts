import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  findByEmail(email: string) {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  findByGoogleId(googleId: string) {
    return this.userModel.findOne({ googleId }).exec();
  }

  createLocalUser(params: {
    name: string;
    email: string;
    passwordHash: string;
  }) {
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
    return this.userModel
      .findByIdAndUpdate(
        userId,
        { googleId, provider: 'google' },
        { new: true },
      )
      .exec();
  }
}
