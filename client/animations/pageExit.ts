import { gsap, reducedMotion } from '../core/motion';

/**
 * Exit transition for boosted navigation. Runs during HTMX's swap delay (hx-swap="… swap:140ms"
 * on <body>), so the old page fades before the new one is swapped in.
 */
export function pageExit(): void {
  if (reducedMotion()) return;
  const main = document.getElementById('main');
  if (!main) return;
  gsap.to(main, { opacity: 0, y: 6, duration: 0.14, ease: 'power1.in', overwrite: true });
}

/** Thin progress bar shown while a boosted navigation is in flight. */
export function progressStart(): void {
  const bar = document.getElementById('top-progress');
  if (!bar || reducedMotion()) return;
  gsap.killTweensOf(bar);
  gsap.fromTo(bar, { scaleX: 0, opacity: 1 }, { scaleX: 0.7, duration: 1.4, ease: 'power2.out' });
}

export function progressDone(): void {
  const bar = document.getElementById('top-progress');
  if (!bar || reducedMotion()) return;
  gsap.killTweensOf(bar);
  gsap
    .timeline()
    .to(bar, { scaleX: 1, duration: 0.2, ease: 'power1.out' })
    .to(bar, { opacity: 0, duration: 0.3 })
    .set(bar, { scaleX: 0 });
}
