import { gsap, reducedMotion } from '../core/motion';

/**
 * Animates the workflow stepper: completed connectors draw left→right, then the current node
 * pops. `fromStep` lets a transition animate only the newly completed part.
 */
export function animateStepper(stepper: HTMLElement, opts: { fromStep?: number } = {}): void {
  if (reducedMotion()) return;
  const steps = Array.from(stepper.querySelectorAll<HTMLElement>('.step'));
  const from = opts.fromStep ?? 0;
  const tl = gsap.timeline();
  steps.forEach((step, i) => {
    if (i < from) return;
    const node = step.querySelector('.node');
    const lit =
      step.classList.contains('done') ||
      step.classList.contains('current') ||
      step.classList.contains('branch');
    if (!lit) return;
    tl.fromTo(
      node,
      { scale: 0.5, opacity: 0.4 },
      { scale: 1, opacity: 1, duration: 0.45, ease: 'back.out(2)' },
      (i - from) * 0.09,
    );
  });
  const current = stepper.querySelector('.step.current .node, .step.branch .node');
  if (current) {
    tl.fromTo(
      current,
      { boxShadow: '0 0 0 0 rgba(143,227,255,.7)' },
      { boxShadow: '0 0 0 14px rgba(143,227,255,0)', duration: 1.1, ease: 'power2.out' },
      '>-0.1',
    );
  }
}

/** Highlights a status badge that just changed (flip + glow). */
export function statusChanged(badge: Element | null): void {
  if (!badge || reducedMotion()) return;
  gsap.fromTo(
    badge,
    { rotateX: -90, opacity: 0 },
    { rotateX: 0, opacity: 1, duration: 0.6, ease: 'back.out(1.8)', transformPerspective: 400 },
  );
}

/** Timeline items cascade in from the top. */
export function animateTimeline(root: HTMLElement, onlyFirst = false): void {
  if (reducedMotion()) return;
  const items = Array.from(root.querySelectorAll<HTMLElement>('.tl-item'));
  const targets = onlyFirst ? items.slice(0, 1) : items.slice(0, 10);
  gsap.fromTo(root, { '--line': 0 }, { '--line': 1, duration: 0.8 });
  gsap.from(targets, {
    opacity: 0,
    x: -10,
    duration: 0.5,
    stagger: 0.05,
    ease: 'power2.out',
    clearProps: 'all',
  });
}
