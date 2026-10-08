import { gsap, reducedMotion } from '../core/motion';

/** Search / filter / pagination results: quick stagger so new results read as "new". */
export function revealList(root: ParentNode): void {
  const items = Array.from(root.querySelectorAll<HTMLElement>('[data-list-item]')).slice(0, 24);
  if (reducedMotion() || !items.length) return;
  gsap.fromTo(
    items,
    { opacity: 0, y: 10 },
    { opacity: 1, y: 0, duration: 0.45, stagger: 0.025, ease: 'power2.out', clearProps: 'transform,opacity' },
  );
}

/** Any element rendered with data-animate="enter" (live inserts, new comments, notifications). */
export function enterNew(root: ParentNode): void {
  const els = Array.from(root.querySelectorAll<HTMLElement>('[data-animate="enter"]'));
  if (root instanceof HTMLElement && root.dataset.animate === 'enter') els.unshift(root);
  for (const el of els) {
    el.removeAttribute('data-animate');
    if (reducedMotion()) continue;
    gsap.fromTo(
      el,
      { opacity: 0, y: -12, scale: 0.97 },
      { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'back.out(1.6)', clearProps: 'transform,opacity' },
    );
    if (el.classList.contains('lane-card')) {
      el.classList.add('is-new');
      window.setTimeout(() => el.classList.remove('is-new'), 2400);
    }
  }
}

/** Animated removal; resolves when the element is gone. */
export function exitAndRemove(el: Element): Promise<void> {
  if (reducedMotion()) {
    el.remove();
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    gsap.to(el, {
      opacity: 0,
      x: 24,
      height: 0,
      marginTop: 0,
      marginBottom: 0,
      paddingTop: 0,
      paddingBottom: 0,
      duration: 0.4,
      ease: 'power2.in',
      onComplete: () => {
        el.remove();
        resolve();
      },
    });
  });
}
