import type { Permission } from '../auth/permissions.js';
import {
  allowedTransitions,
  TRANSITION_RULES,
  type RequestStatus,
  type TransitionRule,
} from './definition.js';

export type WorkflowActor = { id: string; permissions: ReadonlySet<Permission> };
export type WorkflowSubject = { status: RequestStatus; requesterId: string };

export type TransitionCheck =
  | { ok: true; rule: TransitionRule }
  | { ok: false; reason: 'INVALID_TRANSITION' | 'FORBIDDEN' | 'NOTE_REQUIRED'; message: string };

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return allowedTransitions[from].includes(to);
}

function actorSatisfies(rule: TransitionRule, actor: WorkflowActor, subject: WorkflowSubject): boolean {
  if (rule.actor.kind === 'requester') return subject.requesterId === actor.id;
  return actor.permissions.has(rule.actor.permission);
}

/**
 * Validates a requested transition against the workflow table, the actor's permissions and the
 * rule's requirements. The browser only ever names an *action*; the target status comes from here.
 */
export function evaluateTransition(
  subject: WorkflowSubject,
  action: string,
  actor: WorkflowActor,
  note?: string | null,
): TransitionCheck {
  const rule = TRANSITION_RULES.find((r) => r.action === action && r.from === subject.status);
  if (!rule || !canTransition(rule.from, rule.to)) {
    return {
      ok: false,
      reason: 'INVALID_TRANSITION',
      message: `A request that is ${subject.status.replace(/_/g, ' ').toLowerCase()} cannot be moved with "${action}".`,
    };
  }
  if (!actorSatisfies(rule, actor, subject)) {
    return {
      ok: false,
      reason: 'FORBIDDEN',
      message: 'You are not allowed to perform this workflow action.',
    };
  }
  if (rule.requiresNote && !note?.trim()) {
    return { ok: false, reason: 'NOTE_REQUIRED', message: 'Please add a note explaining this decision.' };
  }
  return { ok: true, rule };
}

/** Actions the given actor may take right now — used to render buttons, never to authorize. */
export function availableTransitions(subject: WorkflowSubject, actor: WorkflowActor): TransitionRule[] {
  return TRANSITION_RULES.filter((r) => r.from === subject.status && actorSatisfies(r, actor, subject));
}
