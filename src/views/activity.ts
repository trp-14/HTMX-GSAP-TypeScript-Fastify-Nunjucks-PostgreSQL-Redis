import type { ActivityItem } from '../repositories/statsRepository.js';

export type ActivityView = { text: string; tone: string; icon: string; href: string | null };

const meta = (m: Record<string, unknown>, k: string) => (typeof m[k] === 'string' || typeof m[k] === 'number' ? String(m[k]) : '');

/** Turns an audit record into a human sentence for activity feeds. */
export function activityView(a: ActivityItem): ActivityView {
  const who = a.actorName ?? 'System';
  const m = a.metadata ?? {};
  const req = `#${a.entityId}`;
  const reqHref = a.entityType === 'request' ? `/requests/${a.entityId}` : null;
  switch (a.action) {
    case 'REQUEST_CREATED':
      return { text: `${who} created ${req} “${meta(m, 'title')}”`, tone: 'muted', icon: 'plus', href: reqHref };
    case 'REQUEST_SUBMITTED':
    case 'REQUEST_RESUBMITTED':
      return { text: `${who} submitted ${req} for review`, tone: 'info', icon: 'send', href: reqHref };
    case 'REQUEST_REVIEW_STARTED':
      return { text: `${who} started reviewing ${req}`, tone: 'violet', icon: 'eye', href: reqHref };
    case 'REQUEST_APPROVED':
      return { text: `${who} approved ${req}`, tone: 'good', icon: 'check', href: reqHref };
    case 'REQUEST_REJECTED':
      return { text: `${who} rejected ${req}`, tone: 'bad', icon: 'x', href: reqHref };
    case 'REQUEST_CHANGES_REQUESTED':
      return { text: `${who} requested changes on ${req}`, tone: 'warn', icon: 'edit', href: reqHref };
    case 'REQUEST_PROCESSING_STARTED':
      return { text: `${who} started processing ${req}`, tone: 'ice', icon: 'zap', href: reqHref };
    case 'REQUEST_COMPLETED':
      return { text: `${who} completed ${req}`, tone: 'good', icon: 'check', href: reqHref };
    case 'REQUEST_ASSIGNED':
      return { text: `${who} reassigned ${req}`, tone: 'violet', icon: 'user', href: reqHref };
    case 'REQUEST_COMMENTED':
      return { text: `${who} commented on ${req}`, tone: 'muted', icon: 'message', href: reqHref };
    case 'REQUEST_UPDATED':
      return { text: `${who} edited ${req}`, tone: 'muted', icon: 'edit', href: reqHref };
    case 'REQUEST_DELETED':
      return { text: `${who} deleted ${req}`, tone: 'bad', icon: 'trash', href: null };
    case 'ATTACHMENT_UPLOADED':
      return { text: `${who} attached a document to ${req}`, tone: 'muted', icon: 'paperclip', href: reqHref };
    case 'INVENTORY_CHANGED': {
      const delta = Number(m.delta ?? 0);
      const sign = delta > 0 ? '+' : '';
      return { text: `${who} moved ${meta(m, 'name') || a.entityId} stock ${sign}${delta} (${String(m.movementType ?? '').toLowerCase()})`, tone: delta < 0 ? 'warn' : 'good', icon: 'box', href: `/products?q=${encodeURIComponent(a.entityId)}` };
    }
    case 'PRODUCT_CREATED':
      return { text: `${who} added product ${a.entityId}`, tone: 'ice', icon: 'box', href: `/products?q=${encodeURIComponent(a.entityId)}` };
    case 'PRODUCT_UPDATED':
      return { text: `${who} updated product ${a.entityId}`, tone: 'muted', icon: 'edit', href: `/products?q=${encodeURIComponent(a.entityId)}` };
    case 'PRODUCT_DELETED':
      return { text: `${who} deleted product ${a.entityId}`, tone: 'bad', icon: 'trash', href: null };
    case 'USER_LOGGED_IN':
      return { text: `${who} signed in`, tone: 'muted', icon: 'key', href: null };
    case 'ROLE_CHANGED':
      return { text: `${who} changed roles for a user`, tone: 'violet', icon: 'shield', href: null };
    default:
      return { text: `${who} · ${a.action.replace(/_/g, ' ').toLowerCase()}`, tone: 'muted', icon: 'info', href: reqHref };
  }
}
