import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import type pg from 'pg';
import type { AppConfig } from './config.js';
import { createContainer, type Container } from './container.js';
import authPlugin from './auth/plugin.js';
import type { EventPublisher } from './events/publisher.js';
import { registerErrorHandling } from './middleware/errorHandler.js';
import type { RedisClients } from './redis/client.js';
import { registerRoutes } from './routes/index.js';
import { loggerOptions } from './utils/logger.js';
import { createViewEnvironment } from './views/renderer.js';
import viewPlugin from './views/plugin.js';

declare module 'fastify' {
  interface FastifyInstance {
    container: Container;
  }
}

export type BuildOptions = {
  config: AppConfig;
  db: pg.Pool;
  redis: RedisClients;
  publisher?: EventPublisher;
  /** Start the Redis → SSE bridge (disabled in some tests). */
  realtime?: boolean;
};

export async function buildApp(opts: BuildOptions): Promise<FastifyInstance> {
  const { config } = opts;
  // HTTPS-only headers follow the deployment's TLS setting, not NODE_ENV (the Compose demo is plain HTTP).
  const https = config.session.secureCookie;
  const app = Fastify({
    logger: loggerOptions(config),
    trustProxy: config.isProduction,
    bodyLimit: 1024 * 1024,
    requestIdHeader: 'x-request-id',
  });

  const container = createContainer(config, opts.db, opts.redis, app.log, opts.publisher);
  app.decorate('container', container);

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        // Inline style *attributes* carry per-item CSS variables (e.g. --hue); no inline <style>/script.
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        upgradeInsecureRequests: https ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: https,
  });
  await app.register(cookie);
  await app.register(formbody);
  await app.register(multipart, {
    limits: { fileSize: config.uploads.maxBytes, files: 1, fields: 10, fieldSize: 2048 },
  });
  await app.register(fastifyStatic, {
    root: path.resolve('public'),
    prefix: '/',
    wildcard: false,
    index: false,
    setHeaders(res, filePath) {
      if (filePath.includes(`${path.sep}assets${path.sep}`))
        res.header('Cache-Control', 'public, max-age=86400');
    },
  });

  const env = createViewEnvironment({
    root: 'views',
    watch: config.env === 'development',
    assetVersion: Date.now().toString(36),
  });
  await app.register(viewPlugin, { env, container });
  await app.register(authPlugin, { container });
  registerErrorHandling(app);
  await registerRoutes(app);

  if (opts.realtime !== false) {
    app.addHook('onReady', async () => container.hub.start());
  }
  app.addHook('onClose', async () => container.hub.stop());
  return app;
}
