import { gsap, ScrollTrigger, reducedMotion } from '../core/motion';

/**
 * Staggered entrance for [data-reveal="card"] elements. Cards in view animate immediately;
 * the rest are batched by ScrollTrigger as they scroll in. Each card animates once.
 */
export function revealCards(root: ParentNode = document): void {
  const cards = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal="card"]:not([data-revealed])'));
  if (!cards.length) return;
  cards.forEach((c) => (c.dataset.revealed = '1'));
  if (reducedMotion()) return;
  gsap.set(cards, { opacity: 0, y: 18 });
  ScrollTrigger.batch(cards, {
    start: 'top 92%',
    once: true,
    onEnter: (batch) =>
      gsap.to(batch, {
        opacity: 1,
        y: 0,
        duration: 0.7,
        stagger: 0.06,
        ease: 'power3.out',
        clearProps: 'transform,opacity',
      }),
  });
}
