import type { Redis } from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';
import { EVENTS_CHANNEL_PREFIX } from '../redis/keys.js';
import type { FlowDeskEvent } from './types.js';

export interface EventPublisher {
  publish(event: FlowDeskEvent): Promise<void>;
  publishAll(events: readonly FlowDeskEvent[]): Promise<void>;
}

/**
 * Publishes committed business events to Redis Pub/Sub, one channel per event type
 * (`flowdesk.events.request.approved`, …). Services call this *after* their transaction commits,
 * so subscribers never see an event for data that was rolled back.
 *
 * Publishing is best effort: PostgreSQL already holds the truth, and live clients resynchronise
 * from it on reconnect, so a Redis outage degrades real-time updates but never loses data.
 */
export class RedisEventPublisher implements EventPublisher {
  constructor(
    private readonly redis: Redis,
    private readonly log: FastifyBaseLogger,
  ) {}

  async publish(event: FlowDeskEvent): Promise<void> {
    try {
      await this.redis.publish(EVENTS_CHANNEL_PREFIX + event.type, JSON.stringify(event));
      this.log.debug({ eventType: event.type, entityId: event.entityId }, 'event published');
    } catch (err) {
      this.log.error({ err, eventType: event.type }, 'failed to publish event');
    }
  }

  async publishAll(events: readonly FlowDeskEvent[]): Promise<void> {
    for (const e of events) await this.publish(e);
  }
}

/** Collects events in memory — used by unit tests. */
export class InMemoryEventPublisher implements EventPublisher {
  readonly events: FlowDeskEvent[] = [];
  async publish(event: FlowDeskEvent): Promise<void> {
    this.events.push(event);
  }
  async publishAll(events: readonly FlowDeskEvent[]): Promise<void> {
    this.events.push(...events);
  }
}
