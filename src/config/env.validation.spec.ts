import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const baseEnv = {
    MONGODB_URI: 'mongodb://localhost:27017/barber',
    JWT_SECRET: 'super_secret_value',
    JWT_EXPIRES_IN: '1d',
    CORS_ORIGIN: 'http://localhost:5173',
    EMAIL_SERVICE_URL: 'http://localhost:3001',
    EMAIL_SERVICE_API_KEY: 'shared-test-key',
  };

  it('accepts valid required variables', () => {
    const result = validateEnv(baseEnv);

    expect(result.MONGODB_URI).toBe(baseEnv.MONGODB_URI);
    expect(result.JWT_SECRET).toBe(baseEnv.JWT_SECRET);
    expect(result.CORS_ORIGIN).toBe(baseEnv.CORS_ORIGIN);
    expect(result.EMAIL_SERVICE_URL).toBe(baseEnv.EMAIL_SERVICE_URL);
    expect(result.EMAIL_SERVICE_TIMEOUT_MS).toBe(5000);
  });

  it('rejects insecure JWT secret default', () => {
    expect(() => validateEnv({ ...baseEnv, JWT_SECRET: 'change_me' })).toThrow('JWT_SECRET cannot use insecure default value');
  });

  it('rejects wildcard CORS origin', () => {
    expect(() => validateEnv({ ...baseEnv, CORS_ORIGIN: '*' })).toThrow('CORS_ORIGIN cannot include wildcard (*)');
  });

  it('rejects an invalid email service URL', () => {
    expect(() => validateEnv({ ...baseEnv, EMAIL_SERVICE_URL: 'localhost:3001' })).toThrow('Invalid EMAIL_SERVICE_URL');
  });

  it('rejects an invalid email service timeout', () => {
    expect(() => validateEnv({ ...baseEnv, EMAIL_SERVICE_TIMEOUT_MS: '60000' })).toThrow('EMAIL_SERVICE_TIMEOUT_MS must be an integer');
  });
});
