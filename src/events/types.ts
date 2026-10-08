import { randomUUID } from 'node:crypto';
import type { Permission } from '../auth/permissions.js';
import type { InventoryStatus, MovementType } from '../inventory/rules.js';
import type { RequestStatus } from '../workflow/definition.js';

/**
 * The FlowDesk event model. Events are facts about something that has *already been committed*
 * to PostgreSQL; they are published to Redis Pub/Sub and fanned out to browsers over SSE.
 */

/** Who may receive an event over SSE. Checked by the SSE hub per connection. */
export type Audience =
  | { kind: 'all' }
  | { kind: 'users'; userIds: string[] }
  | { kind: 'permission'; permission: Permission; userIds: string[] };

type Base<T extends string, P> = {
  id: string;
  type: T;
  entityId: string;
  actorId: string | null;
  timestamp: string;
  audience: Audience;
} & P;

type RequestRef = {
  requestId: string;
  requestNumber: number;
  title: string;
  priority: string;
  requesterId: string;
  assigneeId: string | null;
};

export type RequestStatusEventType =
  | 'request.submitted'
  | 'request.review_started'
  | 'request.approved'
  | 'request.rejected'
  | 'request.changes_requested'
  | 'request.processing_started'
  | 'request.completed';

export type FlowDeskEvent =
  | Base<'request.created', RequestRef & { status: RequestStatus }>
  | Base<
      RequestStatusEventType,
      RequestRef & { fromStatus: RequestStatus; toStatus: RequestStatus; note: string | null }
    >
  | Base<
      'request.assigned',
      RequestRef & { previousAssigneeId: string | null; assigneeName: string | null; status: RequestStatus }
    >
  | Base<'request.updated', RequestRef & { status: RequestStatus }>
  | Base<'request.deleted', RequestRef & { status: RequestStatus }>
  | Base<'request.commented', RequestRef & { commentId: string; status: RequestStatus }>
  | Base<
      'product.created' | 'product.updated' | 'product.deleted',
      { productId: string; sku: string; name: string }
    >
  | Base<
      'inventory.changed' | 'inventory.low' | 'inventory.out',
      {
        productId: string;
        sku: string;
        name: string;
        movementType: MovementType;
        previousQuantity: number;
        newQuantity: number;
        reorderThreshold: number;
        previousStatus: InventoryStatus;
        newStatus: InventoryStatus;
      }
    >
  | Base<
      'notification.created',
      { notificationId: string; userId: string; title: string; notificationType: string }
    >;

export type EventType = FlowDeskEvent['type'];

export const STATUS_EVENT: Record<Exclude<RequestStatus, 'DRAFT'>, RequestStatusEventType> = {
  SUBMITTED: 'request.submitted',
  UNDER_REVIEW: 'request.review_started',
  APPROVED: 'request.approved',
  REJECTED: 'request.rejected',
  CHANGES_REQUESTED: 'request.changes_requested',
  PROCESSING: 'request.processing_started',
  COMPLETED: 'request.completed',
};

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type EventInput = DistributiveOmit<FlowDeskEvent, 'id' | 'timestamp'>;

/** Stamps an event with an id and timestamp. */
export function createEvent<E extends EventInput>(input: E): E & { id: string; timestamp: string } {
  return { ...input, id: randomUUID(), timestamp: new Date().toISOString() };
}

/** Audience for request events: everyone who can read all requests, plus the people involved. */
export function requestAudience(
  ref: Pick<RequestRef, 'requesterId' | 'assigneeId'>,
  ...extra: (string | null)[]
): Audience {
  const userIds = [ref.requesterId, ref.assigneeId, ...extra].filter((x): x is string => !!x);
  return { kind: 'permission', permission: 'request:read:all', userIds: [...new Set(userIds)] };
}
