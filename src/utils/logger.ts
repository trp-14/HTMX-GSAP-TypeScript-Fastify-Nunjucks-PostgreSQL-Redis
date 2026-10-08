import type { FastifyServerOptions } from 'fastify';
import type { AppConfig } from '../config.js';

/**
 * Structured logging options. Anything that could carry credentials is redacted at the
 * serializer level, so a careless `log.info({ body })` can never leak a password or cookie.
 */
export function loggerOptions(config: AppConfig): FastifyServerOptions['logger'] {
  if (config.logLevel === 'silent') return false;
  return {
    level: config.logLevel,
    redact: {
      paths: [
        'req.headers.cookie',
        'req.headers.authorization',
        'req.headers["x-csrf-token"]',
        'res.headers["set-cookie"]',
        '*.password',
        '*.currentPassword',
        '*.newPassword',
        '*.passwordHash',
        '*.sessionId',
        '*.csrfToken',
      ],
      censor: '[redacted]',
    },
    ...(config.env === 'development'
      ? {
          transport: {
            target: 'pino-pretty',
            options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
          },
        }
      : {}),
  };
}
