import { defineModule } from '../core/registry';
import { $, $$, Flip, gsap, reducedMotion } from '../core/motion';
import { animateNumber, flashDelta } from '../animations/numbers';
import { exitAndRemove } from '../animations/listUpdate';
import { setInventoryBadge, setMeter, stockTransition, thresholdAlert } from '../animations/inventory';
import { onEvent, onResync } from '../realtime/sse';
import type { FDEvent, InventoryStatus, RequestStatus } from '../realtime/types';

/**
 * Monitor Real-Time. Initial state is server-rendered; afterwards every change arrives as an SSE
 * event and is applied surgically:
 *  - counters tween by the delta implied by the transition (e.g. Pending approvals 17 → 16)
 *  - request cards Flip-animate between lanes (or are fetched as server-rendered fragments)
 *  - inventory rows update quantity, badge and meter, and alert on threshold crossings
 *  - activity / movement feeds prepend server-rendered fragments
 * After a reconnect the whole board is re-fetched from PostgreSQL to resynchronise.
 */

const ACTIVE: RequestStatus[] = ['SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'PROCESSING'];
const PENDING: RequestStatus[] = ['SUBMITTED', 'UNDER_REVIEW'];
const LANE_LIMIT = 6;

function counterDeltas(from: RequestStatus | null, to: RequestStatus | null): Record<string, number> {
  const d: Record<string, number> = {};
  const add = (k: string, v: number) => (d[k] = (d[k] ?? 0) + v);
  const inSet = (s: RequestStatus | null, set: RequestStatus[]) => (s ? set.includes(s) : false);
  add('active', Number(inSet(to, ACTIVE)) - Number(inSet(from, ACTIVE)));
  add('pendingApprovals', Number(inSet(to, PENDING)) - Number(inSet(from, PENDING)));
  add('processing', Number(to === 'PROCESSING') - Number(from === 'PROCESSING'));
  if (to === 'APPROVED') add('approvedToday', 1);
  if (to === 'COMPLETED') add('completedToday', 1);
  if (to === 'SUBMITTED' && from === 'DRAFT') add('submittedToday', 1);
  return d;
}

function inventoryDeltas(from: InventoryStatus, to: InventoryStatus): Record<string, number> {
  return {
    lowStock: Number(to === 'LOW_STOCK') - Number(from === 'LOW_STOCK'),
    outOfStock: Number(to === 'OUT_OF_STOCK') - Number(from === 'OUT_OF_STOCK'),
  };
}

defineModule('monitor', (root) => {
  const ctx = gsap.context(() => undefined, root);
  const lastEventEl = $('[data-last-event]', root);
  let lastEventAt: number | null = null;

  const board = () => $('#monitor-board', root);

  function bumpCounters(deltas: Record<string, number>) {
    for (const [key, delta] of Object.entries(deltas)) {
      if (!delta) continue;
      const counter = $(`[data-counter="${key}"]`, root);
      const value = counter && $('[data-counter-value]', counter);
      if (!counter || !value) continue;
      const current = Number(value.textContent?.replace(/\D/g, '') ?? 0);
      animateNumber(value, Math.max(0, current + delta), { from: current, duration: 0.8 });
      flashDelta($('[data-counter-delta]', counter), delta);
      counter.classList.remove('flash');
      void counter.offsetWidth; // restart CSS animation
      counter.classList.add('flash');
    }
  }

  function laneOf(status: RequestStatus | null | undefined) {
    return status ? $(`[data-lane="${status}"]`, root) : null;
  }

  function adjustLaneTotal(status: RequestStatus | null | undefined, delta: number) {
    const lane = laneOf(status);
    const total = lane && $('[data-lane-total]', lane);
    if (!total) return;
    const current = Number(total.textContent ?? 0);
    animateNumber(total, Math.max(0, current + delta), { from: current, format: false, duration: 0.5 });
  }

  function refreshEmptyStates() {
    for (const lane of $$('[data-lane]', root)) {
      const body = $('[data-lane-body]', lane);
      const empty = $('[data-lane-empty]', lane);
      if (body && empty) empty.hidden = body.querySelectorAll('[data-request-card]').length > 0;
      // Keep lanes short: drop the oldest cards beyond the limit.
      const cards = body ? $$('[data-request-card]', body) : [];
      cards.slice(LANE_LIMIT).forEach((c) => c.remove());
    }
    const watch = $('[data-watch-list]', root);
    const watchEmpty = $('[data-watch-empty]', root);
    if (watch && watchEmpty) watchEmpty.hidden = watch.querySelectorAll('[data-watch-item]').length > 0;
  }

  async function moveRequest(e: FDEvent) {
    if (!e.requestId) return;
    const from = e.fromStatus ?? null;
    const to = e.toStatus ?? null;
    bumpCounters(counterDeltas(from, to));
    adjustLaneTotal(from, -1);
    adjustLaneTotal(to, +1);

    const card = document.getElementById(`mreq-${e.requestId}`);
    const target = laneOf(to);
    const targetBody = target && $('[data-lane-body]', target);

    if (card && targetBody) {
      const state = Flip.getState(card);
      targetBody.prepend(card);
      refreshEmptyStates();
      if (!reducedMotion()) {
        Flip.from(state, { duration: 0.8, ease: 'power3.inOut', absolute: true, zIndex: 20 });
        gsap.fromTo(
          card,
          { boxShadow: '0 0 0 1px rgba(143,227,255,.9), 0 0 40px -4px rgba(143,227,255,.9)' },
          {
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.07)',
            duration: 2,
            delay: 0.6,
            clearProps: 'boxShadow',
          },
        );
      }
      return;
    }
    if (card && !targetBody) {
      await exitAndRemove(card);
      refreshEmptyStates();
      return;
    }
    if (!card && targetBody) {
      await htmx.ajax('GET', `/monitor/requests/${e.requestId}/card`, {
        target: targetBody,
        swap: 'afterbegin',
      });
      refreshEmptyStates();
    }
  }

  async function updateInventory(e: FDEvent) {
    if (!e.productId || !e.newStatus || !e.previousStatus) return;
    if (e.newStatus !== e.previousStatus) bumpCounters(inventoryDeltas(e.previousStatus, e.newStatus));
    const item = $(`[data-watch-item="${e.productId}"]`, root);
    const list = $('[data-watch-list]', root);

    if (e.newStatus === 'IN_STOCK') {
      if (item) {
        stockTransition($('[data-stock-number]', item), e.previousQuantity ?? 0, e.newQuantity ?? 0);
        setInventoryBadge($('[data-badge-slot] .badge', item), 'IN_STOCK');
        window.setTimeout(() => void exitAndRemove(item).then(refreshEmptyStates), 1400);
      }
      return;
    }
    if (item) {
      stockTransition($('[data-stock-number]', item), e.previousQuantity ?? 0, e.newQuantity ?? 0);
      setMeter($('.meter .fill', item), e.newQuantity ?? 0, e.reorderThreshold ?? 0, e.newStatus);
      if (e.newStatus !== e.previousStatus) {
        setInventoryBadge($('[data-badge-slot] .badge', item), e.newStatus);
        thresholdAlert(item, e.newStatus);
      }
      if (list && e.newStatus === 'OUT_OF_STOCK') list.prepend(item);
    } else if (list) {
      await htmx.ajax('GET', `/monitor/products/${e.productId}/watch`, { target: list, swap: 'afterbegin' });
      const fresh = $(`[data-watch-item="${e.productId}"]`, root);
      thresholdAlert(fresh, e.newStatus);
      refreshEmptyStates();
    }
  }

  async function prependFeed(selector: string, url: string) {
    const feed = $(selector, root);
    if (!feed) return;
    const after = feed.dataset.lastId ?? '0';
    await htmx.ajax('GET', `${url}?after=${encodeURIComponent(after)}`, { target: feed, swap: 'afterbegin' });
    const newest = feed.querySelector<HTMLElement>('[data-activity-id], [data-movement-id]');
    const id = newest?.dataset.activityId ?? newest?.dataset.movementId;
    if (id) feed.dataset.lastId = id;
    Array.from(feed.children)
      .slice(30)
      .forEach((c) => c.remove());
  }

  // Serialise event handling so Flip animations and fragment inserts never interleave.
  let queue: Promise<void> = Promise.resolve();
  const enqueue = (fn: () => Promise<void> | void) => {
    queue = queue.then(fn).catch((err) => console.error('monitor update failed', err));
  };

  const offEvent = onEvent((e) => {
    lastEventAt = Date.now();
    if (lastEventEl) lastEventEl.textContent = 'just now';
    enqueue(async () => {
      if (e.toStatus && e.type.startsWith('request.')) await moveRequest(e);
      else if (e.type === 'request.deleted') {
        const card = document.getElementById(`mreq-${e.requestId}`);
        if (card) await exitAndRemove(card);
        bumpCounters(counterDeltas(e.status ?? null, null));
        adjustLaneTotal(e.status, -1);
        refreshEmptyStates();
      } else if (e.type === 'inventory.changed') {
        await updateInventory(e);
        await prependFeed('[data-movement-feed]', '/monitor/movements');
      }
      if (e.type !== 'notification.created' && e.type !== 'inventory.low' && e.type !== 'inventory.out') {
        await prependFeed('[data-activity-feed]', '/monitor/activity');
      }
    });
  });

  const offResync = onResync(() => {
    const b = board();
    if (b) enqueue(() => htmx.ajax('GET', '/monitor', { target: b, swap: 'outerHTML' }));
  });

  // Relative "last event" label.
  const clock = window.setInterval(() => {
    if (!lastEventEl || !lastEventAt) return;
    const s = Math.round((Date.now() - lastEventAt) / 1000);
    lastEventEl.textContent = s < 5 ? 'just now' : s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`;
  }, 5000);

  // Entrance: counters count up, lanes cascade.
  if (!reducedMotion()) {
    ctx.add(() => {
      $$('[data-counter-value]', root).forEach((el) =>
        animateNumber(el, Number(el.textContent ?? 0), { from: 0, duration: 1 }),
      );
      gsap.from($$('.lane-card', root), {
        opacity: 0,
        y: 14,
        duration: 0.5,
        stagger: 0.025,
        delay: 0.25,
        clearProps: 'all',
      });
    });
  }

  return () => {
    offEvent();
    offResync();
    window.clearInterval(clock);
    ctx.revert();
  };
});
