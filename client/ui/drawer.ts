import { gsap, reducedMotion } from '../core/motion';

let openDrawerId: string | null = null;

export function openDrawer(id: string): void {
  const drawer = document.getElementById(id);
  const scrim = document.querySelector<HTMLElement>('[data-drawer-scrim]');
  if (!drawer) return;
  openDrawerId = id;
  drawer.inert = false;
  drawer.setAttribute('aria-hidden', 'false');
  drawer.classList.add('open');
  scrim?.classList.add('on');
  drawer.querySelector<HTMLElement>('[data-drawer-close]')?.focus();
}

export function closeDrawer(): void {
  if (!openDrawerId) return;
  const drawer = document.getElementById(openDrawerId);
  openDrawerId = null;
  document.querySelector('[data-drawer-scrim]')?.classList.remove('on');
  if (!drawer) return;
  drawer.classList.remove('open');
  drawer.inert = true;
  drawer.setAttribute('aria-hidden', 'true');
}

export const isDrawerOpen = (id: string) => openDrawerId === id;

/** Staggers drawer content in after HTMX loads it. */
export function drawerContentIn(body: HTMLElement): void {
  if (reducedMotion()) return;
  gsap.from(body.querySelectorAll('.notif, .empty'), {
    x: 40,
    opacity: 0,
    duration: 0.55,
    stagger: 0.05,
    ease: 'power3.out',
    delay: 0.1,
    clearProps: 'all',
  });
}
