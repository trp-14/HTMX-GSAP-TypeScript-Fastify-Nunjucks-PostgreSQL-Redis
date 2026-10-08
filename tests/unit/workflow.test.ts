import { describe, expect, it } from 'vitest';
import { permissionsFor } from '../../src/auth/permissions.js';
import { allowedTransitions, REQUEST_STATUSES, TRANSITION_RULES } from '../../src/workflow/definition.js';
import { availableTransitions, canTransition, evaluateTransition } from '../../src/workflow/engine.js';

const employee = { id: 'emp', permissions: permissionsFor(['EMPLOYEE']) };
const manager = { id: 'mgr', permissions: permissionsFor(['MANAGER']) };
const operations = { id: 'ops', permissions: permissionsFor(['OPERATIONS']) };

describe('workflow definition', () => {
  it('follows the default path DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED → PROCESSING → COMPLETED', () => {
    expect(canTransition('DRAFT', 'SUBMITTED')).toBe(true);
    expect(canTransition('SUBMITTED', 'UNDER_REVIEW')).toBe(true);
    expect(canTransition('UNDER_REVIEW', 'APPROVED')).toBe(true);
    expect(canTransition('APPROVED', 'PROCESSING')).toBe(true);
    expect(canTransition('PROCESSING', 'COMPLETED')).toBe(true);
  });

  it('supports the review branches and the resubmission loop', () => {
    expect(allowedTransitions.UNDER_REVIEW).toEqual(['APPROVED', 'REJECTED', 'CHANGES_REQUESTED']);
    expect(canTransition('CHANGES_REQUESTED', 'SUBMITTED')).toBe(true);
  });

  it('never lets a completed or rejected request move again', () => {
    for (const to of REQUEST_STATUSES) {
      expect(canTransition('COMPLETED', to)).toBe(false);
      expect(canTransition('REJECTED', to)).toBe(false);
    }
    expect(canTransition('COMPLETED', 'DRAFT')).toBe(false);
  });

  it('rejects skipping steps', () => {
    expect(canTransition('DRAFT', 'APPROVED')).toBe(false);
    expect(canTransition('SUBMITTED', 'COMPLETED')).toBe(false);
    expect(canTransition('APPROVED', 'COMPLETED')).toBe(false);
  });

  it('has a rule for every allowed transition and no rule outside the table', () => {
    for (const rule of TRANSITION_RULES) expect(canTransition(rule.from, rule.to)).toBe(true);
    const ruleCount = Object.values(allowedTransitions).reduce((n, list) => n + list.length, 0);
    expect(TRANSITION_RULES).toHaveLength(ruleCount);
  });
});

describe('evaluateTransition', () => {
  const draftOf = (requesterId: string) => ({ status: 'DRAFT' as const, requesterId });
  const underReview = { status: 'UNDER_REVIEW' as const, requesterId: 'emp' };

  it('lets the requester submit their own draft', () => {
    expect(evaluateTransition(draftOf('emp'), 'submit', employee)).toMatchObject({
      ok: true,
      rule: { to: 'SUBMITTED' },
    });
  });

  it('does not let anyone else submit a draft, even a manager', () => {
    expect(evaluateTransition(draftOf('emp'), 'submit', manager)).toMatchObject({
      ok: false,
      reason: 'FORBIDDEN',
    });
  });

  it('forbids employees from approving', () => {
    expect(evaluateTransition(underReview, 'approve', employee)).toMatchObject({
      ok: false,
      reason: 'FORBIDDEN',
    });
  });

  it('allows managers to approve', () => {
    expect(evaluateTransition(underReview, 'approve', manager)).toMatchObject({
      ok: true,
      rule: { to: 'APPROVED' },
    });
  });

  it('requires a note to reject or request changes', () => {
    expect(evaluateTransition(underReview, 'reject', manager)).toMatchObject({
      ok: false,
      reason: 'NOTE_REQUIRED',
    });
    expect(evaluateTransition(underReview, 'reject', manager, '   ')).toMatchObject({
      ok: false,
      reason: 'NOTE_REQUIRED',
    });
    expect(evaluateTransition(underReview, 'reject', manager, 'Out of budget')).toMatchObject({
      ok: true,
      rule: { to: 'REJECTED' },
    });
  });

  it('treats actions that do not apply to the current status as invalid', () => {
    expect(evaluateTransition({ status: 'COMPLETED', requesterId: 'emp' }, 'submit', employee)).toMatchObject(
      { ok: false, reason: 'INVALID_TRANSITION' },
    );
    expect(evaluateTransition(draftOf('emp'), 'approve', manager)).toMatchObject({
      ok: false,
      reason: 'INVALID_TRANSITION',
    });
    expect(evaluateTransition(underReview, 'teleport', manager)).toMatchObject({
      ok: false,
      reason: 'INVALID_TRANSITION',
    });
  });

  it('reserves processing and completion for operations', () => {
    const approved = { status: 'APPROVED' as const, requesterId: 'emp' };
    expect(evaluateTransition(approved, 'start-processing', manager)).toMatchObject({
      ok: false,
      reason: 'FORBIDDEN',
    });
    expect(evaluateTransition(approved, 'start-processing', operations)).toMatchObject({ ok: true });
  });

  it('lists only the actions an actor may take', () => {
    expect(availableTransitions(underReview, manager).map((r) => r.action)).toEqual([
      'approve',
      'reject',
      'request-changes',
    ]);
    expect(availableTransitions(underReview, employee)).toEqual([]);
  });
});
