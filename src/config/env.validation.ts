type EnvMap = Record<string, unknown>;

function getRequiredString(config: EnvMap, key: string): string {
  const value = config[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value.trim();
}

function validateMongoUri(uri: string): string {
  const isValid = uri.startsWith('mongodb://') || uri.startsWith('mongodb+srv://');
  if (!isValid) {
    throw new Error('Invalid MONGODB_URI. Expected mongodb:// or mongodb+srv://');
  }
  return uri;
}

function validateCorsOrigin(rawOrigins: string): string {
  const origins = rawOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    throw new Error('CORS_ORIGIN must contain at least one allowed origin');
  }

  if (origins.includes('*')) {
    throw new Error('CORS_ORIGIN cannot include wildcard (*)');
  }

  for (const origin of origins) {
    const isHttp = origin.startsWith('http://') || origin.startsWith('https://');
    if (!isHttp) {
      throw new Error(`Invalid CORS origin: ${origin}`);
    }
  }

  return origins.join(',');
}

export function validateEnv(config: EnvMap): EnvMap {
  const mongodbUri = validateMongoUri(getRequiredString(config, 'MONGODB_URI'));
  const jwtSecret = getRequiredString(config, 'JWT_SECRET');
  const jwtExpiresIn = getRequiredString(config, 'JWT_EXPIRES_IN');
  const corsOrigin = validateCorsOrigin(getRequiredString(config, 'CORS_ORIGIN'));

  if (jwtSecret === 'change_me') {
    throw new Error('JWT_SECRET cannot use insecure default value');
  }

  return {
    ...config,
    MONGODB_URI: mongodbUri,
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN: jwtExpiresIn,
    CORS_ORIGIN: corsOrigin,
  };
}
