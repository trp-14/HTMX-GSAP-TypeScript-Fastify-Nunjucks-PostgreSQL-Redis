import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pino from 'pino';
import { permissionsFor } from '../../src/auth/permissions.js';
import { RedisEventPublisher } from '../../src/events/publisher.js';
import { SseHub } from '../../src/events/sseHub.js';
import { createEvent } from '../../src/events/types.js';
import { createRedisClients } from '../../src/redis/client.js';
import { createTestApp, signIn, type TestContext } from '../helpers/testApp.js';

let ctx: TestContext;
let baseUrl: string;

beforeAll(async () => {
  ctx = await createTestApp({}, { realtime: true });
  await ctx.app.listen({ port: 0, host: '127.0.0.1' });
  baseUrl = `http://127.0.0.1:${(ctx.app.server.address() as AddressInfo).port}`;
});
afterAll(async () => ctx?.close());

/** Opens the SSE stream with a session cookie and collects parsed events. */
async function openStream(cookie: string) {
  const controller = new AbortController();
  const res = await fetch(`${baseUrl}/events/stream`, { headers: { cookie }, signal: controller.signal });
  expect(res.headers.get('content-type')).toContain('text/event-stream');
  const events: { event: string; data: Record<string, unknown> }[] = [];
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  void (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const event = /^event: (.+)$/m.exec(block)?.[1];
          const data = /^data: (.+)$/m.exec(block)?.[1];
          if (event && data) events.push({ event, data: JSON.parse(data) as Record<string, unknown> });
        }
      }
    } catch {
      /* aborted */
    }
  })();
  const waitFor = async (
    predicate: (e: { event: string; data: Record<string, unknown> }) => boolean,
    timeoutMs = 4000,
  ) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const found = events.find(predicate);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`event not received; got ${events.map((e) => e.event).join(', ')}`);
  };
  return { events, waitFor, close: () => controller.abort() };
}

describe('Redis Pub/Sub → SSE', () => {
  it('delivers a committed workflow transition to a connected browser (the #1042 scenario)', async () => {
    const manager = await signIn(ctx.app, 'raka.pratama@arunika.co.id');
    const operations = await signIn(ctx.app, 'dewi.lestari@arunika.co.id');
    const stream = await openStream(operations.cookie);
    try {
      await stream.waitFor((e) => e.event === 'hello');
      const res = await manager.request('POST', '/requests/1042/transitions/approve');
      expect(res.statusCode).toBe(200);
      const approved = await stream.waitFor((e) => e.event === 'request.approved');
      expect(approved.data).toMatchObject({
        requestNumber: 1042,
        fromStatus: 'UNDER_REVIEW',
        toStatus: 'APPROVED',
      });
      expect(approved.data).not.toHaveProperty('audience');
    } finally {
      stream.close();
    }
  });

  it('streams inventory changes and threshold alerts', async () => {
    const operations = await signIn(ctx.app, 'bayu.santoso@arunika.co.id');
    const viewer = await signIn(ctx.app, 'teguh.prasetyo@arunika.co.id');
    const stream = await openStream(viewer.cookie);
    try {
      await stream.waitFor((e) => e.event === 'hello');
      const { rows } = await ctx.db.query(
        `SELECT id, stock_quantity AS q FROM products WHERE sku = 'PER-DOCK-C'`,
      );
      const { id, q } = rows[0] as { id: string; q: number };
      await operations.request('POST', `/products/${id}/movements`, { type: 'ISSUE', quantity: String(q) });
      const changed = await stream.waitFor((e) => e.event === 'inventory.changed' && e.data.productId === id);
      expect(changed.data).toMatchObject({ previousQuantity: q, newQuantity: 0, newStatus: 'OUT_OF_STOCK' });
      await stream.waitFor((e) => e.event === 'inventory.out' && e.data.productId === id);
    } finally {
      stream.close();
    }
  });

  it('only sends notifications to the user they belong to', async () => {
    const requester = await signIn(ctx.app, 'sinta.wirawan@arunika.co.id');
    const bystander = await signIn(ctx.app, 'putri.anggraini@arunika.co.id');
    const manager = await signIn(ctx.app, 'maya.kusuma@arunika.co.id');
    const mine = await openStream(requester.cookie);
    const theirs = await openStream(bystander.cookie);
    try {
      await mine.waitFor((e) => e.event === 'hello');
      await theirs.waitFor((e) => e.event === 'hello');
      await manager.request('POST', '/requests/1042/comments', {
        body: 'Laptop is reserved — collect from IT on Monday.',
      });
      await mine.waitFor((e) => e.event === 'notification.created');
      await new Promise((r) => setTimeout(r, 300));
      expect(theirs.events.some((e) => e.event === 'notification.created')).toBe(false);
      // …and request events for someone else's request do not reach an employee either.
      expect(theirs.events.some((e) => e.event === 'request.commented')).toBe(false);
    } finally {
      mine.close();
      theirs.close();
    }
  });

  it('rejects anonymous stream connections', async () => {
    const res = await fetch(`${baseUrl}/events/stream`, { redirect: 'manual' });
    expect(res.status).toBe(302);
  });
});

describe('SseHub with a real Redis subscription', () => {
  it('receives events published by another instance', async () => {
    const log = pino({ level: 'silent' });
    const publisherClients = createRedisClients(ctx.config.redisUrl, 'fdtest:', log);
    const subscriberClients = createRedisClients(ctx.config.redisUrl, 'fdtest:', log);
    const hub = new SseHub(subscriberClients.subscriber, log);
    try {
      await hub.start();
      const received: string[] = [];
      hub.add({
        userId: 'u',
        permissions: permissionsFor(['EMPLOYEE']),
        send: (c) => (received.push(c), true),
        close: () => undefined,
      });
      const publisher = new RedisEventPublisher(publisherClients.main, log);
      await publisher.publish(
        createEvent({
          type: 'product.updated',
          entityId: 'p1',
          actorId: null,
          audience: { kind: 'all' },
          productId: 'p1',
          sku: 'SKU-1',
          name: 'Test',
        }),
      );
      for (let i = 0; i < 40 && !received.length; i++) await new Promise((r) => setTimeout(r, 25));
      expect(received[0]).toContain('event: product.updated');
    } finally {
      await hub.stop();
      await publisherClients.close();
      await subscriberClients.close();
    }
  });
});
