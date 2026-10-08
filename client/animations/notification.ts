import { gsap, reducedMotion } from '../core/motion';

export function toastIn(el: HTMLElement): void {
  if (reducedMotion()) return;
  gsap.fromTo(
    el,
    { opacity: 0, y: 24, scale: 0.94 },
    { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: 'back.out(1.7)' },
  );
}

export function toastOut(el: HTMLElement): Promise<void> {
  if (reducedMotion()) return Promise.resolve();
  return new Promise((resolve) =>
    gsap.to(el, { opacity: 0, x: 40, duration: 0.3, ease: 'power2.in', onComplete: () => resolve() }),
  );
}

/** Badge pop when the unread count changes. */
export function badgePop(el: HTMLElement): void {
  if (reducedMotion()) return;
  gsap.fromTo(el, { scale: 0.4 }, { scale: 1, duration: 0.7, ease: 'elastic.out(1.2, 0.4)' });
}

/** Little wiggle on the bell icon button. */
export function bellRing(el: Element | null): void {
  if (!el || reducedMotion()) return;
  gsap.fromTo(
    el,
    { rotate: -14 },
    { rotate: 0, duration: 0.9, ease: 'elastic.out(1.4, 0.3)', transformOrigin: '50% 10%' },
  );
}
