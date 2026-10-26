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

function validateHttpUrl(rawUrl: string, key: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid ${key}. Expected an absolute HTTP(S) URL`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Invalid ${key}. Expected an absolute HTTP(S) URL`);
  }

  return rawUrl.replace(/\/+$/, '');
}

function validateEmailTimeout(rawTimeout: unknown): number {
  if (rawTimeout === undefined || rawTimeout === '') {
    return 5000;
  }

  const timeout = Number(rawTimeout);
  if (!Number.isInteger(timeout) || timeout < 100 || timeout > 30000) {
    throw new Error('EMAIL_SERVICE_TIMEOUT_MS must be an integer between 100 and 30000');
  }
  return timeout;
}

export function validateEnv(config: EnvMap): EnvMap {
  const mongodbUri = validateMongoUri(getRequiredString(config, 'MONGODB_URI'));
  const jwtSecret = getRequiredString(config, 'JWT_SECRET');
  const jwtExpiresIn = getRequiredString(config, 'JWT_EXPIRES_IN');
  const corsOrigin = validateCorsOrigin(getRequiredString(config, 'CORS_ORIGIN'));
  const emailServiceUrl = validateHttpUrl(getRequiredString(config, 'EMAIL_SERVICE_URL'), 'EMAIL_SERVICE_URL');
  const emailServiceApiKey = getRequiredString(config, 'EMAIL_SERVICE_API_KEY');
  const emailServiceTimeout = validateEmailTimeout(config.EMAIL_SERVICE_TIMEOUT_MS);

  if (jwtSecret === 'change_me') {
    throw new Error('JWT_SECRET cannot use insecure default value');
  }

  const whatsappKeys = ['WHATSAPP_NOTIFY_PHONE', 'CALLMEBOT_API_KEY', 'WHATSAPP_ACTION_BASE_URL', 'WHATSAPP_ACTION_SECRET'];
  if (['WHATSAPP_ACTION_BASE_URL', 'WHATSAPP_ACTION_SECRET'].some((key) => typeof config[key] === 'string' && String(config[key]).trim() !== '')) {
    for (const key of whatsappKeys) getRequiredString(config, key);
    if (!/^\+?[1-9]\d{7,14}$/.test(String(config.WHATSAPP_NOTIFY_PHONE))) throw new Error('WHATSAPP_NOTIFY_PHONE must include a valid country code');
    if (config.WHATSAPP_ACTION_SECRET === jwtSecret) throw new Error('WHATSAPP_ACTION_SECRET must differ from JWT_SECRET');
    if (String(config.WHATSAPP_ACTION_SECRET).length < 32) throw new Error('WHATSAPP_ACTION_SECRET must contain at least 32 characters');
    const actionUrl = new URL(validateHttpUrl(String(config.WHATSAPP_ACTION_BASE_URL), 'WHATSAPP_ACTION_BASE_URL'));
    if (actionUrl.username || actionUrl.password || actionUrl.search || actionUrl.hash || actionUrl.pathname !== '/') throw new Error('WHATSAPP_ACTION_BASE_URL must be the backend origin without a path, credentials, query or fragment');
    if (actionUrl.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(actionUrl.hostname)) throw new Error('WHATSAPP_ACTION_BASE_URL requires HTTPS');
  }

  return {
    ...config,
    MONGODB_URI: mongodbUri,
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN: jwtExpiresIn,
    CORS_ORIGIN: corsOrigin,
    EMAIL_SERVICE_URL: emailServiceUrl,
    EMAIL_SERVICE_API_KEY: emailServiceApiKey,
    EMAIL_SERVICE_TIMEOUT_MS: emailServiceTimeout,
  };
}
