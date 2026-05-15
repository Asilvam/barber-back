import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ type: String, default: null })
  passwordHash: string | null;

  @Prop({ default: 'local', enum: ['local', 'google'] })
  provider: 'local' | 'google';

  @Prop({ type: String, default: null, unique: true, sparse: true })
  googleId: string | null;

  @Prop({ default: 'user' })
  role: string;

  @Prop({ default: true })
  emailVerified: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
