import { defineModule } from '../core/registry';
import { $, $$, gsap, ScrollTrigger, reducedMotion } from '../core/motion';
import { scrollReveal } from '../animations/scrollReveal';

/** Knowledge Center index: keeps the category rail and search form in sync with HTMX swaps. */
defineModule('knowledge', (root) => {
  const hidden = $<HTMLInputElement>('#kb-category', root);
  const onClick = (e: Event) => {
    const link = (e.target as Element).closest<HTMLElement>('[data-kb-category]');
    if (!link) return;
    const slug = link.dataset.kbCategory ?? '';
    if (hidden) hidden.value = slug;
    for (const a of $$('.kb-cats [data-kb-category]', root))
      a.setAttribute('aria-current', String(a.dataset.kbCategory === slug));
    // Category tiles collapse once a category is chosen.
    const grid = $('.kb-cat-grid', root);
    if (grid && slug) {
      if (reducedMotion()) grid.remove();
      else
        gsap.to(grid, {
          height: 0,
          opacity: 0,
          marginBottom: 0,
          duration: 0.45,
          ease: 'power2.inOut',
          onComplete: () => grid.remove(),
        });
    }
  };
  root.addEventListener('click', onClick);
  return () => root.removeEventListener('click', onClick);
});

/** Article page: reading progress, scroll-triggered sections, active table of contents. */
defineModule('article', (root) => {
  const ctx = gsap.context(() => undefined, root);
  const cleanups: (() => void)[] = [];
  const bar = $('[data-reading-progress]');
  const article = $('.article', root);
  if (bar && article && !reducedMotion()) {
    ctx.add(() => {
      gsap.to(bar, {
        scaleX: 1,
        ease: 'none',
        scrollTrigger: { trigger: article, start: 'top 80px', end: 'bottom bottom', scrub: 0.3 },
      });
      gsap.from(article, { opacity: 0, y: 30, duration: 0.8, ease: 'power3.out' });
    });
  }
  cleanups.push(scrollReveal(root, '.md-section'));

  const tocLinks = $$<HTMLAnchorElement>('[data-toc] a', root);
  const triggers = tocLinks.map((link) => {
    const id = decodeURIComponent(link.hash.slice(1));
    const heading = document.getElementById(id);
    if (!heading) return null;
    return ScrollTrigger.create({
      trigger: heading,
      start: 'top 40%',
      end: 'bottom top',
      onToggle: (self) => {
        if (!self.isActive) return;
        tocLinks.forEach((l) => l.classList.toggle('active', l === link));
      },
    });
  });
  return () => {
    triggers.forEach((t) => t?.kill());
    cleanups.forEach((c) => c());
    ctx.revert();
  };
});
