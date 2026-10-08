import { gsap, ScrollTrigger, reducedMotion } from '../core/motion';

/** Scroll-triggered reveals for content sections ([data-reveal] blocks, e.g. article sections). */
export function scrollReveal(
  root: ParentNode,
  selector = '[data-reveal]:not([data-reveal="card"])',
): () => void {
  const els = Array.from(root.querySelectorAll<HTMLElement>(selector));
  if (reducedMotion() || !els.length) return () => undefined;
  const triggers = els.map(
    (el) =>
      gsap.from(el, {
        opacity: 0,
        y: 26,
        duration: 0.8,
        ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      }).scrollTrigger,
  );
  return () => triggers.forEach((t) => t?.kill());
}

export { ScrollTrigger };
