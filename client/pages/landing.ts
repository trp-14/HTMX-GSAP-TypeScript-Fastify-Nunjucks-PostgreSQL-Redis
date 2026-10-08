import { defineModule } from '../core/registry';
import { $, $$, gsap, ScrollTrigger, reducedMotion } from '../core/motion';
import { splitWords } from '../animations/splitText';
import { animateNumber, countUp } from '../animations/numbers';

/**
 * Landing page — the motion showcase. Everything lives in one gsap.context so the whole page's
 * tweens and ScrollTriggers are reverted when HTMX navigates away.
 */
defineModule('landing', (root) => {
  const reduce = reducedMotion();
  const cleanups: (() => void)[] = [];
  const ctx = gsap.context(() => {
    // ---------------------------------------------------------- nav
    const nav = $('[data-landing-nav]', root);
    if (nav) {
      ScrollTrigger.create({
        start: 80,
        onToggle: (self) =>
          gsap.to(nav, {
            paddingTop: self.isActive ? 5 : 8,
            paddingBottom: self.isActive ? 5 : 8,
            duration: 0.3,
          }),
      });
    }

    // ---------------------------------------------------------- hero
    const title = $('[data-hero-title]', root);
    if (title) {
      const words = splitWords(title);
      if (!reduce) {
        const tl = gsap.timeline({ delay: 0.1 });
        tl.from(words, { yPercent: 115, rotate: 4, duration: 1.1, stagger: 0.08, ease: 'expo.out' })
          .from($$('[data-hero-fade]', root), { opacity: 0, y: 18, duration: 0.8, stagger: 0.1 }, 0.35)
          .from(
            $('[data-hero-console]', root),
            { opacity: 0, y: 60, rotateX: 18, scale: 0.92, duration: 1.3, ease: 'expo.out' },
            0.2,
          )
          .from(
            $$('.halo', root),
            { scale: 0.6, opacity: 0, duration: 1.6, stagger: 0.15, ease: 'expo.out' },
            0.1,
          )
          .from(
            $$('.float-chip', root),
            { opacity: 0, scale: 0.6, y: 20, duration: 0.8, stagger: 0.12, ease: 'back.out(1.8)' },
            0.8,
          );
        gsap.to($$('.halo', root), { rotate: 360, duration: 40, repeat: -1, ease: 'none' });
      }
    }

    // A looping "live" story inside the hero console: #1042 gets approved, counters move, stock drops.
    const badge = $('[data-hc-badge]', root);
    const pending = $('[data-hc-pending]', root);
    const approved = $('[data-hc-approved]', root);
    const stock = $('[data-hc-stock]', root);
    const eventChip = $('[data-hc-event]', root);
    const row = $('[data-hc-row]', root);
    if (!reduce && badge && pending && approved && stock && eventChip && row) {
      const setBadge = (tone: string, label: string) => {
        badge.className = `badge tone-${tone}`;
        badge.innerHTML = '<i class="dot"></i>';
        badge.append(document.createTextNode(label));
      };
      const loop = gsap.timeline({ repeat: -1, repeatDelay: 1.2, delay: 2 });
      loop
        .call(() => {
          eventChip.textContent = 'request.approved';
          setBadge('violet', 'Under review');
          pending.textContent = '17';
          approved.textContent = '42';
          stock.textContent = '10';
        })
        .to(
          row,
          {
            boxShadow: 'inset 0 0 0 1px rgba(91,227,162,.8), 0 0 30px -6px rgba(91,227,162,.8)',
            duration: 0.3,
          },
          0.6,
        )
        .to(badge, { rotateX: 90, duration: 0.18, ease: 'power1.in' }, 0.7)
        .call(() => setBadge('good', 'Approved'), [], 0.88)
        .to(badge, { rotateX: 0, duration: 0.4, ease: 'back.out(2)' }, 0.88)
        .call(() => void animateNumber(pending, 16, { from: 17, duration: 0.6 }), [], 0.9)
        .call(() => void animateNumber(approved, 43, { from: 42, duration: 0.6 }), [], 1.0)
        .fromTo(eventChip, { opacity: 0.2 }, { opacity: 1, duration: 0.4 }, 0.9)
        .to(row, { boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.07)', duration: 1 }, 1.8)
        .call(
          () => {
            eventChip.textContent = 'inventory.changed';
          },
          [],
          3,
        )
        .call(() => void animateNumber(stock, 9, { from: 10, duration: 0.5, format: false }), [], 3.1)
        .call(
          () => {
            eventChip.textContent = 'inventory.low';
          },
          [],
          4.3,
        )
        .call(() => void animateNumber(stock, 3, { from: 9, duration: 0.8, format: false }), [], 4.3)
        .to(stock, { color: '#ffc65c', duration: 0.3 }, 4.4)
        .to(stock, { color: 'inherit', duration: 0.6 }, 6);
    }

    // Pointer parallax on the hero stage.
    const stage = $('[data-hero-stage]', root);
    if (stage && !reduce && window.matchMedia('(pointer: fine)').matches) {
      const consoleEl = $('[data-hero-console]', stage);
      const onMove = (e: PointerEvent) => {
        const x = e.clientX / window.innerWidth - 0.5;
        const y = e.clientY / window.innerHeight - 0.5;
        if (consoleEl)
          gsap.to(consoleEl, { rotateY: x * 10, rotateX: -y * 8, duration: 0.8, ease: 'power2.out' });
        $$<HTMLElement>('[data-depth]', stage).forEach((chip) => {
          const d = Number(chip.dataset.depth ?? 1);
          gsap.to(chip, { x: x * 30 * d, y: y * 24 * d, duration: 0.9, ease: 'power2.out' });
        });
      };
      window.addEventListener('pointermove', onMove);
      cleanups.push(() => window.removeEventListener('pointermove', onMove));
    }

    // Magnetic buttons.
    if (!reduce && window.matchMedia('(pointer: fine)').matches) {
      for (const btn of $$('[data-magnetic]', root)) {
        const move = (e: PointerEvent) => {
          const r = btn.getBoundingClientRect();
          gsap.to(btn, {
            x: (e.clientX - r.left - r.width / 2) * 0.25,
            y: (e.clientY - r.top - r.height / 2) * 0.3,
            duration: 0.4,
          });
        };
        const leave = () => gsap.to(btn, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.4)' });
        btn.addEventListener('pointermove', move);
        btn.addEventListener('pointerleave', leave);
        cleanups.push(() => {
          btn.removeEventListener('pointermove', move);
          btn.removeEventListener('pointerleave', leave);
        });
      }
    }

    // ---------------------------------------------------------- marquee
    const track = $('[data-marquee]', root);
    if (track && !reduce) {
      const tween = gsap.to(track, { xPercent: -50, duration: 38, ease: 'none', repeat: -1 });
      ScrollTrigger.create({
        onUpdate: (self) =>
          gsap.to(tween, { timeScale: self.direction === 1 ? 1 : -1, duration: 0.4, overwrite: true }),
      });
    }

    // ---------------------------------------------------------- section titles
    for (const h of $$('[data-reveal-title]', root)) {
      const words = splitWords(h);
      if (!reduce)
        gsap.from(words, {
          yPercent: 110,
          duration: 0.9,
          stagger: 0.05,
          ease: 'power4.out',
          scrollTrigger: { trigger: h, start: 'top 85%' },
        });
    }

    // ---------------------------------------------------------- workflow (pinned, scrubbed)
    const pin = $('[data-wf-pin]', root);
    const nodes = $$('[data-wf-node]', root);
    const line = $('[data-wf-line]', root);
    if (pin && nodes.length && !reduce) {
      const mm = gsap.matchMedia();
      mm.add('(min-width: 761px)', () => {
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: pin,
            start: 'center center',
            end: '+=900',
            scrub: 0.6,
            pin: true,
            anticipatePin: 1,
          },
        });
        if (line) tl.to(line, { scaleX: 1, ease: 'none', duration: nodes.length }, 0);
        nodes.forEach((node, i) => {
          tl.call(() => void node.classList.add('lit'), [], i + 0.01);
          tl.fromTo(
            node.querySelector('.orb'),
            { scale: 0.85 },
            { scale: 1.12, duration: 0.3, yoyo: true, repeat: 1 },
            i,
          );
        });
        tl.from(
          $$('[data-wf-branch]', root),
          { opacity: 0, y: 20, stagger: 0.3, duration: 0.6 },
          nodes.length - 1,
        );
        tl.from($('[data-wf-event]', root), { opacity: 0, y: 12, duration: 0.6 }, nodes.length);
        return () => nodes.forEach((n) => n.classList.remove('lit'));
      });
      mm.add('(max-width: 760px)', () => {
        nodes.forEach((n) => n.classList.add('lit'));
        gsap.from(nodes, {
          opacity: 0,
          y: 20,
          stagger: 0.08,
          scrollTrigger: { trigger: pin, start: 'top 80%' },
        });
      });
      cleanups.push(() => mm.revert());
    } else {
      nodes.forEach((n) => n.classList.add('lit'));
      if (line) line.style.transform = 'scaleX(1)';
    }

    // ---------------------------------------------------------- features
    if (!reduce) {
      ScrollTrigger.batch($$('[data-feature]', root), {
        start: 'top 88%',
        once: true,
        onEnter: (batch) =>
          gsap.from(batch, { opacity: 0, y: 40, rotateX: 8, duration: 0.9, stagger: 0.1, ease: 'expo.out' }),
      });
    }

    // ---------------------------------------------------------- inventory demo + event terminal
    const demo = $('[data-live-demo]', root);
    const stockNum = $('[data-demo-stock]', root);
    const demoBadge = $('[data-demo-badge]', root);
    const meter = $('[data-demo-meter]', root);
    const lines = $$('.terminal .ln', root);
    if (demo && stockNum && demoBadge && meter) {
      const setDemo = (tone: string, label: string, pct: number, color: string) => {
        demoBadge.className = `badge tone-${tone}`;
        demoBadge.innerHTML = '<i class="dot"></i>';
        demoBadge.append(document.createTextNode(label));
        meter.style.setProperty('--v', `${pct}%`);
        meter.style.setProperty('--tone', color);
      };
      if (reduce) {
        lines.forEach((l) => (l.style.opacity = '1'));
      } else {
        const tl = gsap.timeline({ scrollTrigger: { trigger: demo, start: 'top 70%' } });
        tl.from(demo, { opacity: 0, y: 40, duration: 0.8 })
          .to(lines[0] ?? {}, { opacity: 1, duration: 0.3 })
          .to(lines[1] ?? {}, { opacity: 1, duration: 0.3 }, '+=0.4')
          .call(() => void animateNumber(stockNum, 9, { from: 10, format: false, duration: 0.5 }))
          .call(() => setDemo('good', 'In stock', 90, 'var(--good)'))
          .to(lines[2] ?? {}, { opacity: 1, duration: 0.3 }, '+=0.7')
          .call(() => void animateNumber(stockNum, 3, { from: 9, format: false, duration: 0.8 }))
          .call(() => setDemo('warn', 'Low stock', 30, 'var(--warn)'), [], '+=0.5')
          .fromTo(demoBadge, { scale: 0.6 }, { scale: 1, duration: 0.5, ease: 'back.out(2)' })
          .to(lines[3] ?? {}, { opacity: 1, duration: 0.3 })
          .to(lines[4] ?? {}, { opacity: 1, duration: 0.3 }, '+=0.3')
          .to(lines[5] ?? {}, { opacity: 1, duration: 0.3 }, '+=0.8')
          .call(() => void animateNumber(stockNum, 0, { from: 3, format: false, duration: 0.6 }))
          .call(() => setDemo('bad', 'Out of stock', 0, 'var(--bad)'), [], '+=0.6')
          .fromTo(stockNum, { x: 0 }, { x: -6, duration: 0.06, repeat: 5, yoyo: true })
          .to(lines[6] ?? {}, { opacity: 1, duration: 0.3 });
      }
    }

    // ---------------------------------------------------------- stats & stack
    const stats = $('.big-stats', root);
    if (stats) {
      if (reduce) countUp(stats);
      else
        ScrollTrigger.create({ trigger: stats, start: 'top 80%', once: true, onEnter: () => countUp(stats) });
    }
    const stackItems = $$('[data-stack] span', root);
    if (stackItems.length && !reduce) {
      gsap.from(stackItems, {
        opacity: 0,
        y: 16,
        scale: 0.9,
        stagger: 0.05,
        duration: 0.5,
        ease: 'back.out(2)',
        scrollTrigger: { trigger: stackItems[0], start: 'top 90%' },
      });
    }
  }, root);

  return () => {
    cleanups.forEach((c) => c());
    ctx.revert();
  };
});
