import type { Permission } from '../auth/permissions.js';

/**
 * The request workflow, expressed as data. The engine (engine.ts) is the only code allowed to
 * change a request's status, and it consults nothing but this table.
 *
 *   DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED → PROCESSING → COMPLETED
 *                          ├─→ REJECTED
 *                          └─→ CHANGES_REQUESTED → SUBMITTED
 */
export const REQUEST_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'CHANGES_REQUESTED',
  'PROCESSING',
  'COMPLETED',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const allowedTransitions: Readonly<Record<RequestStatus, readonly RequestStatus[]>> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED', 'CHANGES_REQUESTED'],
  CHANGES_REQUESTED: ['SUBMITTED'],
  APPROVED: ['PROCESSING'],
  PROCESSING: ['COMPLETED'],
  REJECTED: [],
  COMPLETED: [],
};

/** Who may perform a transition: the requester themself, or anyone holding a permission. */
export type TransitionActor = { kind: 'requester' } | { kind: 'permission'; permission: Permission };

export type TransitionRule = {
  from: RequestStatus;
  to: RequestStatus;
  /** Action name used in URLs, audit logs and events. */
  action:
    | 'submit'
    | 'start-review'
    | 'approve'
    | 'reject'
    | 'request-changes'
    | 'resubmit'
    | 'start-processing'
    | 'complete';
  label: string;
  actor: TransitionActor;
  /** A note is mandatory when the decision needs a justification (reject / changes requested). */
  requiresNote: boolean;
  tone: 'primary' | 'positive' | 'negative' | 'neutral';
};

export const TRANSITION_RULES: readonly TransitionRule[] = [
  {
    from: 'DRAFT',
    to: 'SUBMITTED',
    action: 'submit',
    label: 'Submit for review',
    actor: { kind: 'requester' },
    requiresNote: false,
    tone: 'primary',
  },
  {
    from: 'SUBMITTED',
    to: 'UNDER_REVIEW',
    action: 'start-review',
    label: 'Start review',
    actor: { kind: 'permission', permission: 'request:review' },
    requiresNote: false,
    tone: 'neutral',
  },
  {
    from: 'UNDER_REVIEW',
    to: 'APPROVED',
    action: 'approve',
    label: 'Approve',
    actor: { kind: 'permission', permission: 'request:review' },
    requiresNote: false,
    tone: 'positive',
  },
  {
    from: 'UNDER_REVIEW',
    to: 'REJECTED',
    action: 'reject',
    label: 'Reject',
    actor: { kind: 'permission', permission: 'request:review' },
    requiresNote: true,
    tone: 'negative',
  },
  {
    from: 'UNDER_REVIEW',
    to: 'CHANGES_REQUESTED',
    action: 'request-changes',
    label: 'Request changes',
    actor: { kind: 'permission', permission: 'request:review' },
    requiresNote: true,
    tone: 'neutral',
  },
  {
    from: 'CHANGES_REQUESTED',
    to: 'SUBMITTED',
    action: 'resubmit',
    label: 'Resubmit',
    actor: { kind: 'requester' },
    requiresNote: false,
    tone: 'primary',
  },
  {
    from: 'APPROVED',
    to: 'PROCESSING',
    action: 'start-processing',
    label: 'Start processing',
    actor: { kind: 'permission', permission: 'request:process' },
    requiresNote: false,
    tone: 'primary',
  },
  {
    from: 'PROCESSING',
    to: 'COMPLETED',
    action: 'complete',
    label: 'Mark completed',
    actor: { kind: 'permission', permission: 'request:process' },
    requiresNote: false,
    tone: 'positive',
  },
];

export const STATUS_META: Readonly<Record<RequestStatus, { label: string; tone: string; step: number }>> = {
  DRAFT: { label: 'Draft', tone: 'muted', step: 0 },
  SUBMITTED: { label: 'Submitted', tone: 'info', step: 1 },
  UNDER_REVIEW: { label: 'Under review', tone: 'violet', step: 2 },
  CHANGES_REQUESTED: { label: 'Changes requested', tone: 'warn', step: 2 },
  APPROVED: { label: 'Approved', tone: 'good', step: 3 },
  REJECTED: { label: 'Rejected', tone: 'bad', step: 3 },
  PROCESSING: { label: 'Processing', tone: 'ice', step: 4 },
  COMPLETED: { label: 'Completed', tone: 'good', step: 5 },
};

/** The "happy path" used to draw the workflow stepper. */
export const MAIN_PATH: readonly RequestStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'PROCESSING',
  'COMPLETED',
];

export const TERMINAL_STATUSES: readonly RequestStatus[] = ['REJECTED', 'COMPLETED'];
export const PENDING_APPROVAL_STATUSES: readonly RequestStatus[] = ['SUBMITTED', 'UNDER_REVIEW'];
export const ACTIVE_STATUSES: readonly RequestStatus[] = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'PROCESSING',
];

export function isRequestStatus(value: unknown): value is RequestStatus {
  return typeof value === 'string' && (REQUEST_STATUSES as readonly string[]).includes(value);
}
