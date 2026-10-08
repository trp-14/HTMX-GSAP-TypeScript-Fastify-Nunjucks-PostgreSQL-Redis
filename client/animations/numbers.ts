import { gsap, reducedMotion } from '../core/motion';

const fmt = new Intl.NumberFormat('en-US');

/** Tweens the integer shown in `el` to `to` (number transitions for counters and stock). */
export function animateNumber(
  el: Element,
  to: number,
  opts: { from?: number; duration?: number; format?: boolean } = {},
): gsap.core.Tween | null {
  const from = opts.from ?? (Number((el.textContent ?? '0').replace(/[^\d-]/g, '')) || 0);
  const format = opts.format ?? true;
  const write = (v: number) => {
    el.textContent = format ? fmt.format(Math.round(v)) : String(Math.round(v));
  };
  if (reducedMotion() || from === to) {
    write(to);
    return null;
  }
  const state = { v: from };
  return gsap.to(state, {
    v: to,
    duration: opts.duration ?? Math.min(1.4, 0.5 + Math.abs(to - from) * 0.04),
    ease: 'power2.out',
    onUpdate: () => write(state.v),
  });
}

/** Counts up every [data-count-to] element inside root (stats on Overview / landing). */
export function countUp(root: ParentNode, opts: { delay?: number } = {}) {
  root.querySelectorAll<HTMLElement>('[data-count-to]').forEach((el, i) => {
    const to = Number(el.dataset.countTo ?? '0');
    if (reducedMotion()) return void (el.textContent = fmt.format(to));
    el.textContent = '0';
    gsap.delayedCall((opts.delay ?? 0) + i * 0.06, () => animateNumber(el, to, { from: 0, duration: 1.2 }));
  });
}

/** Small "+1 / −1" flag next to a counter that fades out. */
export function flashDelta(el: HTMLElement | null, delta: number) {
  if (!el || delta === 0) return;
  el.textContent = `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`;
  el.className = `delta ${delta > 0 ? 'up' : 'down'}`;
  if (reducedMotion()) return;
  gsap.fromTo(
    el,
    { opacity: 1, y: 0 },
    { opacity: 0, y: delta > 0 ? -10 : 10, duration: 1.6, ease: 'power2.in', delay: 0.6 },
  );
}
