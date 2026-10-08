import { describe, expect, it, vi } from 'vitest';
import type { Redis } from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';
import { permissionsFor } from '../../src/auth/permissions.js';
import { RedisEventPublisher } from '../../src/events/publisher.js';
import { canReceive, formatSse, SseHub } from '../../src/events/sseHub.js';
import { createEvent, requestAudience, STATUS_EVENT } from '../../src/events/types.js';

const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as FastifyBaseLogger;

const approved = () =>
  createEvent({
    type: 'request.approved',
    entityId: 'req-1',
    actorId: 'mgr',
    audience: requestAudience({ requesterId: 'emp', assigneeId: null }),
    requestId: 'req-1',
    requestNumber: 1042,
    title: 'Laptop for new finance analyst',
    priority: 'HIGH',
    requesterId: 'emp',
    assigneeId: null,
    fromStatus: 'UNDER_REVIEW',
    toStatus: 'APPROVED',
    note: null,
  });

describe('event model', () => {
  it('stamps events with a unique id and ISO timestamp', () => {
    const a = approved();
    const b = approved();
    expect(a.id).not.toBe(b.id);
    expect(new Date(a.timestamp).toISOString()).toBe(a.timestamp);
    expect(a).toMatchObject({
      type: 'request.approved',
      requestNumber: 1042,
      fromStatus: 'UNDER_REVIEW',
      toStatus: 'APPROVED',
    });
  });

  it('maps every non-draft status to a request event type', () => {
    expect(STATUS_EVENT.APPROVED).toBe('request.approved');
    expect(STATUS_EVENT.COMPLETED).toBe('request.completed');
    expect(Object.keys(STATUS_EVENT)).toHaveLength(7);
  });

  it('scopes request events to readers of all requests plus the people involved', () => {
    const audience = requestAudience({ requesterId: 'emp', assigneeId: 'ops' }, 'old-assignee', null);
    expect(audience).toEqual({
      kind: 'permission',
      permission: 'request:read:all',
      userIds: ['emp', 'ops', 'old-assignee'],
    });
    const employee = { userId: 'someone-else', permissions: permissionsFor(['EMPLOYEE']) };
    expect(canReceive(audience, employee)).toBe(false);
    expect(canReceive(audience, { ...employee, userId: 'emp' })).toBe(true);
    expect(canReceive(audience, { userId: 'x', permissions: permissionsFor(['MANAGER']) })).toBe(true);
  });

  it('delivers user-targeted events only to those users', () => {
    const audience = { kind: 'users' as const, userIds: ['u1'] };
    expect(canReceive(audience, { userId: 'u1', permissions: new Set() })).toBe(true);
    expect(canReceive(audience, { userId: 'u2', permissions: permissionsFor(['ADMIN']) })).toBe(false);
  });

  it('serialises events in the text/event-stream format', () => {
    const chunk = formatSse({ id: 'abc', type: 'inventory.changed' }, { newQuantity: 9 });
    expect(chunk).toBe('id: abc\nevent: inventory.changed\ndata: {"newQuantity":9}\n\n');
  });
});

describe('RedisEventPublisher', () => {
  it('publishes each event to its own flowdesk.events.<type> channel as JSON', async () => {
    const publish = vi.fn().mockResolvedValue(1);
    const publisher = new RedisEventPublisher({ publish } as unknown as Redis, log);
    const event = approved();
    await publisher.publish(event);
    expect(publish).toHaveBeenCalledWith('flowdesk.events.request.approved', JSON.stringify(event));
  });

  it('never throws when Redis is unavailable (PostgreSQL already holds the truth)', async () => {
    const publish = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const publisher = new RedisEventPublisher({ publish } as unknown as Redis, log);
    await expect(publisher.publish(approved())).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalled();
  });
});

describe('SseHub', () => {
  it('fans a Redis message out to permitted clients only, without the audience metadata', () => {
    const hub = new SseHub({} as Redis, log);
    const managerChunks: string[] = [];
    const strangerChunks: string[] = [];
    hub.add({
      userId: 'mgr',
      permissions: permissionsFor(['MANAGER']),
      send: (c) => (managerChunks.push(c), true),
      close: () => undefined,
    });
    hub.add({
      userId: 'stranger',
      permissions: permissionsFor(['EMPLOYEE']),
      send: (c) => (strangerChunks.push(c), true),
      close: () => undefined,
    });
    hub.dispatch(JSON.stringify(approved()));
    expect(strangerChunks).toHaveLength(0);
    expect(managerChunks).toHaveLength(1);
    expect(managerChunks[0]).toContain('event: request.approved');
    expect(managerChunks[0]).not.toContain('audience');
  });

  it('drops clients whose connection can no longer be written to', () => {
    const hub = new SseHub({} as Redis, log);
    const close = vi.fn();
    hub.add({ userId: 'mgr', permissions: permissionsFor(['MANAGER']), send: () => false, close });
    hub.dispatch(JSON.stringify(approved()));
    expect(close).toHaveBeenCalled();
    expect(hub.size).toBe(0);
  });

  it('ignores malformed messages', () => {
    const hub = new SseHub({} as Redis, log);
    expect(() => hub.dispatch('{not json')).not.toThrow();
  });
});
