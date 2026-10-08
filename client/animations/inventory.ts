import { gsap, reducedMotion } from '../core/motion';
import type { InventoryStatus } from '../realtime/types';
import { animateNumber } from './numbers';

const TONE: Record<InventoryStatus, { tone: string; label: string; color: string }> = {
  IN_STOCK: { tone: 'good', label: 'In stock', color: 'var(--good)' },
  LOW_STOCK: { tone: 'warn', label: 'Low stock', color: 'var(--warn)' },
  OUT_OF_STOCK: { tone: 'bad', label: 'Out of stock', color: 'var(--bad)' },
};

/** Restyles an inventory badge in place (used for live monitor rows). */
export function setInventoryBadge(badge: HTMLElement | null, status: InventoryStatus): void {
  if (!badge) return;
  const t = TONE[status];
  badge.className = `badge tone-${t.tone}`;
  badge.dataset.inventoryBadge = status;
  badge.innerHTML = '';
  const dot = document.createElement('i');
  dot.className = 'dot';
  badge.append(dot, document.createTextNode(t.label));
  if (!reducedMotion())
    gsap.fromTo(
      badge,
      { scale: 0.6, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(2)' },
    );
}

export function setMeter(
  fill: HTMLElement | null,
  quantity: number,
  threshold: number,
  status: InventoryStatus,
): void {
  if (!fill) return;
  const cap = Math.max(threshold * 3, quantity, 1);
  fill.style.setProperty('--tone', TONE[status].color);
  fill.style.setProperty('--v', `${Math.round((quantity / cap) * 100)}%`);
}

/** Stock number change: count, nudge colour by direction. */
export function stockTransition(numberEl: HTMLElement | null, from: number, to: number): void {
  if (!numberEl) return;
  animateNumber(numberEl, to, { from, format: false, duration: 0.9 });
  if (reducedMotion() || from === to) return;
  gsap.fromTo(
    numberEl,
    { color: to < from ? '#ffb3bd' : '#b9ffd9', scale: 1.08 },
    { color: 'inherit', scale: 1, duration: 1.2, ease: 'power2.out', clearProps: 'color,transform' },
  );
}

/** Attention-grabbing (but brief) warning for crossing into LOW/OUT. */
export function thresholdAlert(el: HTMLElement | null, status: InventoryStatus): void {
  if (!el || reducedMotion() || status === 'IN_STOCK') return;
  const color = status === 'OUT_OF_STOCK' ? 'rgba(255,111,128,.85)' : 'rgba(255,198,92,.85)';
  gsap
    .timeline()
    .fromTo(el, { x: 0 }, { x: -6, duration: 0.06, repeat: 5, yoyo: true, ease: 'sine.inOut' })
    .fromTo(
      el,
      { boxShadow: `0 0 0 0 ${color}` },
      { boxShadow: '0 0 0 18px rgba(0,0,0,0)', duration: 1.1, ease: 'power2.out', clearProps: 'boxShadow' },
      0,
    );
}
