import { gsap, reducedMotion } from '../core/motion';

/** Product detail entrance: image floats in, details reveal, facts stagger. */
export function productEnter(root: HTMLElement): void {
  if (reducedMotion()) return;
  const art = root.querySelector('[data-product-image] [data-product-art]');
  const info = root.querySelector('[data-detail-reveal]');
  const tl = gsap.timeline();
  if (art) tl.from(art, { y: 40, rotate: -6, scale: 0.85, opacity: 0, duration: 1, ease: 'expo.out' }, 0);
  if (info) {
    tl.from(info, { opacity: 0, x: 24, duration: 0.7 }, 0.1);
    tl.from(
      info.querySelectorAll('.fact, .chips, .actions-panel'),
      { opacity: 0, y: 12, stagger: 0.07, duration: 0.5 },
      0.3,
    );
  }
  if (art) {
    gsap.to(art, { y: -8, duration: 3.2, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 1 });
  }
}

/** Subtle pointer tilt for product cards. Returns cleanup. */
export function tilt(card: HTMLElement): () => void {
  if (reducedMotion() || !window.matchMedia('(pointer: fine)').matches) return () => undefined;
  const art = card.querySelector('[data-product-art]');
  const move = (e: PointerEvent) => {
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    gsap.to(card, {
      rotateY: x * 6,
      rotateX: -y * 6,
      transformPerspective: 900,
      duration: 0.5,
      ease: 'power2.out',
    });
    if (art) gsap.to(art, { x: x * 10, y: y * 8, duration: 0.6 });
  };
  const leave = () => {
    gsap.to(card, { rotateY: 0, rotateX: 0, duration: 0.7, ease: 'elastic.out(1, 0.5)' });
    if (art) gsap.to(art, { x: 0, y: 0, duration: 0.7 });
  };
  card.addEventListener('pointermove', move);
  card.addEventListener('pointerleave', leave);
  return () => {
    card.removeEventListener('pointermove', move);
    card.removeEventListener('pointerleave', leave);
  };
}
