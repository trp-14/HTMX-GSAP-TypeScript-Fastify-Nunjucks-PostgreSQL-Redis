import { gsap, reducedMotion } from '../core/motion';
import { splitWords } from './splitText';
import { revealCards } from './cardReveal';

/** Entrance for a freshly rendered page: headline words, then cards. */
export function pageEnter(root: HTMLElement = document.body): void {
  const headings = Array.from(root.querySelectorAll<HTMLElement>('[data-split]'));
  if (reducedMotion()) return;
  const tl = gsap.timeline();
  tl.fromTo(
    root.querySelector('.page-head, .hello, .kb-hero, .article-head'),
    { opacity: 0, y: 10 },
    { opacity: 1, y: 0, duration: 0.45, clearProps: 'transform,opacity' },
    0,
  );
  for (const h of headings) {
    const words = splitWords(h);
    tl.from(words, { yPercent: 110, rotate: 2, duration: 0.8, stagger: 0.045, ease: 'power4.out' }, 0.05);
  }
  revealCards(root);
}
