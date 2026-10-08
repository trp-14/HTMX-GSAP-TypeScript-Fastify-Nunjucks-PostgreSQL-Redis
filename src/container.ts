import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import type pg from 'pg';
import type { AppConfig } from './config.js';
import { SessionStore } from './auth/sessionStore.js';
import { RedisEventPublisher, type EventPublisher } from './events/publisher.js';
import { SseHub } from './events/sseHub.js';
import { NotificationService } from './notifications/notificationService.js';
import { Cache } from './redis/cache.js';
import type { RedisClients } from './redis/client.js';
import { Presence } from './redis/presence.js';
import { RateLimiter } from './redis/rateLimiter.js';
import { AttachmentService } from './services/attachmentService.js';
import { AuditService } from './services/auditService.js';
import { AuthService } from './services/authService.js';
import { DashboardService } from './services/dashboardService.js';
import { FileStorage } from './services/fileStorage.js';
import { KnowledgeService } from './services/knowledgeService.js';
import { ProductService } from './services/productService.js';
import { RequestService } from './services/requestService.js';
import { SettingsService } from './services/settingsService.js';
import { UserService } from './services/userService.js';
import type { ServiceDeps } from './services/types.js';

/** Wires infrastructure and services together. One container per app instance. */
export function createContainer(
  config: AppConfig,
  db: pg.Pool,
  redis: RedisClients,
  log: FastifyBaseLogger,
  publisher?: EventPublisher,
) {
  const deps: ServiceDeps = {
    config,
    db,
    log,
    cache: new Cache(redis.main),
    rateLimiter: new RateLimiter(redis.main),
    sessions: new SessionStore(redis.main, config.session.idleTtlSeconds, config.session.absoluteTtlSeconds),
    // Publishing uses the main connection; channels are not affected by its key prefix.
    publisher: publisher ?? new RedisEventPublisher(redis.main, log),
  };
  const storage = new FileStorage(path.resolve(config.uploads.dir), config.uploads.maxBytes);
  const presence = new Presence(redis.main);
  const settings = new SettingsService(deps);
  const requests = new RequestService(deps, settings);

  return {
    deps,
    redis,
    presence,
    hub: new SseHub(redis.subscriber, log),
    services: {
      settings,
      auth: new AuthService(deps, settings),
      users: new UserService(deps),
      requests,
      attachments: new AttachmentService(deps, requests, storage),
      products: new ProductService(deps, settings, storage),
      notifications: new NotificationService(deps),
      audit: new AuditService(deps),
      dashboard: new DashboardService(deps, presence),
      knowledge: new KnowledgeService(deps),
    },
  };
}

export type Container = ReturnType<typeof createContainer>;
