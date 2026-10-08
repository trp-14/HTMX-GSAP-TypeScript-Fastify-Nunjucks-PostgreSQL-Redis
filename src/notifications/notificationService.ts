import type { Queryable } from '../db/pool.js';
import { createEvent, type FlowDeskEvent } from '../events/types.js';
import { notificationRepository, type NotificationInput } from '../repositories/notificationRepository.js';
import type { ServiceDeps } from '../services/types.js';
import { notFound } from '../utils/errors.js';

/**
 * Notifications are persisted in PostgreSQL (inside the caller's transaction) and announced via a
 * `notification.created` event once that transaction commits.
 */
export class NotificationService {
  constructor(private readonly deps: ServiceDeps) {}

  /** Inserts notifications in the caller's transaction and returns the events to publish after commit. */
  static async create(
    tx: Queryable,
    inputs: NotificationInput[],
    actorId: string | null,
  ): Promise<FlowDeskEvent[]> {
    const events: FlowDeskEvent[] = [];
    const seen = new Set<string>();
    for (const input of inputs) {
      // Never notify people about their own actions, and never twice for the same thing.
      if (input.userId === actorId || seen.has(input.userId + input.type)) continue;
      seen.add(input.userId + input.type);
      const id = await notificationRepository.insert(tx, input);
      events.push(
        createEvent({
          type: 'notification.created',
          entityId: id,
          actorId,
          audience: { kind: 'users', userIds: [input.userId] },
          notificationId: id,
          userId: input.userId,
          title: input.title,
          notificationType: input.type,
        }),
      );
    }
    return events;
  }

  list(userId: string, unreadOnly: boolean, page: number, pageSize = 15) {
    return notificationRepository.list(this.deps.db, userId, { unreadOnly }, page, pageSize);
  }

  unreadCount(userId: string) {
    return notificationRepository.unreadCount(this.deps.db, userId);
  }

  async markRead(userId: string, id: string) {
    if (!(await notificationRepository.markRead(this.deps.db, id, userId))) throw notFound('Notification');
    return notificationRepository.findForUser(this.deps.db, id, userId);
  }

  markAllRead(userId: string) {
    return notificationRepository.markAllRead(this.deps.db, userId);
  }

  async remove(userId: string, id: string) {
    if (!(await notificationRepository.delete(this.deps.db, id, userId))) throw notFound('Notification');
  }

  /** Opens a notification: marks it read and returns where it points. */
  async open(userId: string, id: string): Promise<string> {
    const n = await this.markRead(userId, id);
    return n?.link ?? '/notifications';
  }
}
