import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const baseEnv = {
    MONGODB_URI: 'mongodb://localhost:27017/barber',
    JWT_SECRET: 'super_secret_value',
    JWT_EXPIRES_IN: '1d',
    CORS_ORIGIN: 'http://localhost:5173',
  };

  it('accepts valid required variables', () => {
    const result = validateEnv(baseEnv);

    expect(result.MONGODB_URI).toBe(baseEnv.MONGODB_URI);
    expect(result.JWT_SECRET).toBe(baseEnv.JWT_SECRET);
    expect(result.CORS_ORIGIN).toBe(baseEnv.CORS_ORIGIN);
  });

  it('rejects insecure JWT secret default', () => {
    expect(() => validateEnv({ ...baseEnv, JWT_SECRET: 'change_me' })).toThrow('JWT_SECRET cannot use insecure default value');
  });

  it('rejects wildcard CORS origin', () => {
    expect(() => validateEnv({ ...baseEnv, CORS_ORIGIN: '*' })).toThrow('CORS_ORIGIN cannot include wildcard (*)');
  });
});
