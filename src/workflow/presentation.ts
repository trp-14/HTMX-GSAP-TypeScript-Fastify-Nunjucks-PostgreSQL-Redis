import { MAIN_PATH, STATUS_META, type RequestStatus } from './definition.js';

export type StepView = {
  status: RequestStatus;
  label: string;
  state: 'done' | 'current' | 'todo' | 'branch';
  tone: string;
};

/**
 * View model for the workflow stepper. Off-path statuses (REJECTED, CHANGES_REQUESTED) are drawn
 * as a branch node in place of the step they diverged at.
 */
export function workflowSteps(status: RequestStatus): StepView[] {
  const branchAt: Partial<Record<RequestStatus, number>> = { CHANGES_REQUESTED: 2, REJECTED: 3 };
  const branchIndex = branchAt[status];
  const currentIndex = branchIndex ?? MAIN_PATH.indexOf(status);
  return MAIN_PATH.map((s, i) => {
    if (i === branchIndex) {
      return { status, label: STATUS_META[status].label, state: 'branch', tone: STATUS_META[status].tone };
    }
    const state =
      i < currentIndex || (status === 'COMPLETED' && i === currentIndex)
        ? 'done'
        : i === currentIndex
          ? 'current'
          : 'todo';
    return { status: s, label: STATUS_META[s].label, state, tone: STATUS_META[s].tone };
  });
}
