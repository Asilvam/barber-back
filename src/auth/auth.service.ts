import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  private googleClient: OAuth2Client;

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {
    const clientId = process.env.GOOGLE_CLIENT_ID ?? '';
    this.googleClient = new OAuth2Client(clientId);
  }

  async register(name: string, email: string, password: string) {
    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new BadRequestException('Email already in use');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.usersService.createLocalUser({
      name,
      email,
      passwordHash,
    });

    return this.buildAuthResponse(user);
  }

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.emailVerified) {
      throw new UnauthorizedException('Email not verified');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.buildAuthResponse(user);
  }

  async loginWithGoogle(credential: string) {
    if (!credential) {
      throw new BadRequestException('Missing credential');
    }

    const clientId = process.env.GOOGLE_CLIENT_ID ?? '';
    if (!clientId) {
      throw new BadRequestException('Missing GOOGLE_CLIENT_ID');
    }

    const ticket = await this.googleClient.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.sub || !payload.email || !payload.name) {
      throw new UnauthorizedException('Invalid Google token');
    }

    const googleId = payload.sub;
    const email = payload.email.toLowerCase();
    const name = payload.name;

    let user = await this.usersService.findByGoogleId(googleId);
    if (!user) {
      user = await this.usersService.findByEmail(email);
      if (user) {
        if (!user.googleId) {
          user = await this.usersService.setGoogleId(user.id, googleId);
        }
      } else {
        user = await this.usersService.createGoogleUser({
          name,
          email,
          googleId,
        });
      }
    }

    if (!user) {
      throw new UnauthorizedException('Unable to create user');
    }

    return this.buildAuthResponse(user);
  }

  private buildAuthResponse(user: {
    id: string;
    name: string;
    email: string;
    role?: string;
    provider?: string;
    googleId?: string | null;
    emailVerified?: boolean;
  }) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role ?? 'user',
      provider: user.provider ?? 'local',
    };

    const token = this.jwtService.sign(payload);
    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role ?? 'user',
      provider: user.provider ?? 'local',
      googleId: user.googleId ?? null,
      emailVerified: user.emailVerified ?? false,
    };

    return { token, user: safeUser };
  }
}
