import { gsap, reducedMotion } from '../core/motion';

export function modalIn(modal: HTMLElement): void {
  const scrim = modal.querySelector('.modal-scrim');
  const card = modal.querySelector('[data-modal-card], .modal-card');
  if (reducedMotion()) return;
  gsap
    .timeline()
    .fromTo(scrim, { opacity: 0 }, { opacity: 1, duration: 0.25 }, 0)
    .fromTo(
      card,
      { opacity: 0, y: 40, scale: 0.94, rotateX: 8 },
      { opacity: 1, y: 0, scale: 1, rotateX: 0, duration: 0.55, ease: 'back.out(1.5)' },
      0.04,
    );
}

export function modalOut(modal: HTMLElement): Promise<void> {
  if (reducedMotion()) return Promise.resolve();
  const scrim = modal.querySelector('.modal-scrim');
  const card = modal.querySelector('[data-modal-card], .modal-card');
  return new Promise((resolve) => {
    gsap
      .timeline({ onComplete: () => resolve() })
      .to(card, { opacity: 0, y: 24, scale: 0.96, duration: 0.22, ease: 'power2.in' }, 0)
      .to(scrim, { opacity: 0, duration: 0.22 }, 0.05);
  });
}
