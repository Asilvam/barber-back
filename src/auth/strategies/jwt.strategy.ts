import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'change_me',
    });
  }

  validate(payload: {
    sub: string;
    email: string;
    role: string;
    provider: string;
  }) {
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      provider: payload.provider,
    };
  }
}
