import { defineModule } from '../core/registry';
import { $, gsap, reducedMotion } from '../core/motion';
import { countUp } from '../animations/numbers';
import { animateTimeline } from '../animations/workflow';

/** Executive overview: number transitions, sparkline draw, timeline cascade. */
defineModule('overview', (root) => {
  const ctx = gsap.context(() => {
    countUp(root, { delay: 0.15 });
    if (reducedMotion()) return;
    const line = $<SVGPolylineElement>('[data-draw]', root);
    if (line) {
      const len = line.getTotalLength();
      gsap.fromTo(
        line,
        { strokeDasharray: len, strokeDashoffset: len },
        { strokeDashoffset: 0, duration: 1.6, ease: 'power2.inOut', delay: 0.3 },
      );
      gsap.from($('[data-spark] .area', root), { opacity: 0, duration: 1.2, delay: 0.9 });
    }
    root.querySelectorAll<HTMLElement>('.flow-row .fill').forEach((fill, i) => {
      gsap.from(fill, { width: 0, duration: 1, delay: 0.3 + i * 0.05, ease: 'power3.out' });
    });
    const tl = $('[data-module~="timeline"]', root);
    if (tl) animateTimeline(tl);
  }, root);
  return () => ctx.revert();
});
