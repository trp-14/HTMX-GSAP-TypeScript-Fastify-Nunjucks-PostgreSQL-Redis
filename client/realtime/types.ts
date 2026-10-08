/** Shape of events streamed over SSE (mirrors src/events/types.ts, minus routing metadata). */
export type RequestStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'CHANGES_REQUESTED'
  | 'PROCESSING'
  | 'COMPLETED';
export type InventoryStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export type FDEvent = {
  id: string;
  type: string;
  entityId: string;
  actorId: string | null;
  timestamp: string;
  // request events
  requestId?: string;
  requestNumber?: number;
  title?: string;
  status?: RequestStatus;
  fromStatus?: RequestStatus;
  toStatus?: RequestStatus;
  // inventory events
  productId?: string;
  sku?: string;
  name?: string;
  previousQuantity?: number;
  newQuantity?: number;
  reorderThreshold?: number;
  previousStatus?: InventoryStatus;
  newStatus?: InventoryStatus;
  // notifications
  notificationId?: string;
  userId?: string;
  notificationType?: string;
};

export const STREAM_EVENTS = [
  'request.created',
  'request.submitted',
  'request.review_started',
  'request.approved',
  'request.rejected',
  'request.changes_requested',
  'request.processing_started',
  'request.completed',
  'request.assigned',
  'request.updated',
  'request.deleted',
  'request.commented',
  'product.created',
  'product.updated',
  'product.deleted',
  'inventory.changed',
  'inventory.low',
  'inventory.out',
  'notification.created',
] as const;
