import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';
import type { Permission } from '../auth/permissions.js';
import { EVENTS_CHANNEL_PREFIX } from '../redis/keys.js';
import type { Audience, FlowDeskEvent } from './types.js';

export type SseClient = {
  id: string;
  userId: string;
  permissions: ReadonlySet<Permission>;
  send(chunk: string): boolean;
  close(): void;
};

export function canReceive(audience: Audience, client: Pick<SseClient, 'userId' | 'permissions'>): boolean {
  switch (audience.kind) {
    case 'all':
      return true;
    case 'users':
      return audience.userIds.includes(client.userId);
    case 'permission':
      return client.permissions.has(audience.permission) || audience.userIds.includes(client.userId);
  }
}

/** Serialises an event in the text/event-stream wire format. Payload never contains newlines (JSON). */
export function formatSse(event: Pick<FlowDeskEvent, 'id' | 'type'>, data: unknown): string {
  return `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Bridges Redis Pub/Sub to Server-Sent Events. Each app instance holds one Redis subscription
 * (pattern `flowdesk.events.*`) and fans every message out to its own connected browsers,
 * filtered by the event's audience. Scale-out works because every instance receives every event.
 */
export class SseHub {
  private readonly clients = new Map<string, SseClient>();
  private heartbeat: NodeJS.Timeout | null = null;
  private started = false;

  constructor(
    private readonly subscriber: Redis,
    private readonly log: FastifyBaseLogger,
  ) {}

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.subscriber.on('pmessage', (_pattern: string, _channel: string, message: string) =>
      this.dispatch(message),
    );
    await this.subscriber.psubscribe(EVENTS_CHANNEL_PREFIX + '*');
    // Comment lines keep proxies from closing idle connections and let us detect dead sockets.
    this.heartbeat = setInterval(() => this.broadcastRaw(`: heartbeat ${Date.now()}\n\n`), 25_000);
    this.heartbeat.unref();
  }

  async stop(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const c of this.clients.values()) c.close();
    this.clients.clear();
    if (this.started) await this.subscriber.punsubscribe().catch(() => undefined);
    this.started = false;
  }

  add(client: Omit<SseClient, 'id'>): string {
    const id = randomUUID();
    this.clients.set(id, { ...client, id });
    return id;
  }

  remove(id: string): void {
    this.clients.delete(id);
  }

  get size(): number {
    return this.clients.size;
  }

  dispatch(message: string): void {
    let event: FlowDeskEvent;
    try {
      event = JSON.parse(message) as FlowDeskEvent;
    } catch (err) {
      this.log.warn({ err }, 'discarding malformed event message');
      return;
    }
    // The audience is routing metadata; it is not forwarded to browsers.
    const { audience, ...payload } = event;
    const chunk = formatSse(event, payload);
    for (const client of this.clients.values()) {
      if (!canReceive(audience, client)) continue;
      if (!client.send(chunk)) {
        this.log.warn({ clientId: client.id }, 'sse write failed; dropping client');
        client.close();
        this.clients.delete(client.id);
      }
    }
  }

  private broadcastRaw(chunk: string): void {
    for (const client of this.clients.values()) {
      if (!client.send(chunk)) {
        client.close();
        this.clients.delete(client.id);
      }
    }
  }
}
