/**
 * FlowDesk browser entry point.
 *
 * The server renders all HTML (Nunjucks); HTMX performs requests and swaps fragments. This file
 * only wires behaviour around that lifecycle:
 *   htmx:beforeRequest / beforeSwap  → page exit + progress bar
 *   htmx:afterSettle                 → mount modules, run enter animations, sweep removed modules
 *   SSE events                       → live updates (realtime/sse.ts → page modules)
 */
import { $, $$, currentUser, gsap, reducedMotion, ScrollTrigger } from './core/motion';
import { defineModule, mountModules, sweepModules } from './core/registry';
import { pageEnter } from './animations/pageEnter';
import { pageExit, progressDone, progressStart } from './animations/pageExit';
import { revealCards } from './animations/cardReveal';
import { enterNew, revealList } from './animations/listUpdate';
import { animateStepper, animateTimeline, statusChanged } from './animations/workflow';
import { stockTransition, thresholdAlert } from './animations/inventory';
import { badgePop, bellRing } from './animations/notification';
import { tilt } from './animations/product';
import { connect, disconnect, onEvent, paintLiveState } from './realtime/sse';
import { toast, type ToastInput } from './ui/toast';
import { closeModal, confirmDialog, openModal, trapFocus } from './ui/modal';
import { closeDrawer, drawerContentIn, isDrawerOpen, openDrawer } from './ui/drawer';
import type { InventoryStatus } from './realtime/types';
import './pages/monitor';
import './pages/requestLive';
import './pages/productLive';
import './pages/overview';
import './pages/knowledge';
import './pages/landing';

// ------------------------------------------------------------------ small generic modules

defineModule('listReveal', (root) => revealList(root));
defineModule('stepper', (root) => animateStepper(root));
defineModule('timeline', (root) => {
  if (!root.closest('[data-module~="overview"]')) animateTimeline(root);
});
defineModule('modal', (root) => {
  if (root.closest('#modal-root')) openModal(root);
});
defineModule('drawer', () => undefined);
defineModule('authCard', (root) => {
  if (!reducedMotion())
    gsap.from(root, { opacity: 0, y: 30, rotateX: 6, duration: 0.8, ease: 'expo.out', delay: 0.15 });
});

// ------------------------------------------------------------------ helpers

function setUnreadCount(count: number) {
  for (const el of $$('[data-unread-count]')) {
    const next = count > 0 ? String(count) : '';
    if (el.textContent === next) continue;
    el.textContent = next;
    if (next) badgePop(el);
  }
}

async function refreshUnreadCount() {
  try {
    const res = await fetch('/notifications/count', {
      headers: { 'HX-Request': 'true' },
      credentials: 'same-origin',
    });
    if (res.ok) setUnreadCount(Number((await res.text()) || 0));
  } catch {
    /* offline — the next event will catch up */
  }
}

function syncRealtimeConnection() {
  if (currentUser()) connect();
  else disconnect();
  paintLiveState();
}

/** Everything that should happen for newly swapped-in DOM. */
function settle(scope: HTMLElement) {
  sweepModules();
  mountModules(scope);
  enterNew(scope);
  revealCards(scope);
}

// ------------------------------------------------------------------ HTMX lifecycle

let stockBefore: { qty: number; status: string } | null = null;
let workflowBefore: { status: string } | null = null;

document.addEventListener('htmx:beforeRequest', (evt) => {
  const d = (evt as CustomEvent<HtmxRequestDetail>).detail;
  if (d.boosted || d.target === document.body) progressStart();
});

document.addEventListener('htmx:beforeSwap', (evt) => {
  const d = (evt as CustomEvent<HtmxRequestDetail>).detail;
  if (d.target === document.body && d.shouldSwap) pageExit();
  // Remember what is about to be replaced so the replacement can animate *from* it.
  const stock = document.getElementById('stock-panel');
  if (stock && (d.target === stock || d.target.contains(stock))) {
    stockBefore = { qty: Number(stock.dataset.quantity), status: stock.dataset.status ?? '' };
  }
  const wf = document.getElementById('workflow-panel');
  if (wf && d.target === wf) workflowBefore = { status: wf.dataset.status ?? '' };
});

document.addEventListener('htmx:afterSettle', (evt) => {
  const d = (evt as CustomEvent<HtmxRequestDetail>).detail;
  const target = (d.target as HTMLElement | undefined) ?? document.body;

  if (target === document.body) {
    // Full page (boosted navigation or form posted to body).
    progressDone();
    ScrollTrigger.getAll().forEach((t) => t.kill());
    syncRealtimeConnection();
    settle(document.body);
    const main = document.getElementById('main');
    if (main) {
      gsap.set(main, { clearProps: 'opacity,transform' });
      pageEnter(main);
    }
    showFlash();
    return;
  }

  settle(target);

  // Stock panel replaced (own movement or live refresh): animate the change.
  const stock = document.getElementById('stock-panel');
  if (stock && stockBefore) {
    const qty = Number(stock.dataset.quantity);
    const status = stock.dataset.status as InventoryStatus;
    stockTransition($('[data-stock-number]', stock), stockBefore.qty, qty);
    if (status !== stockBefore.status) thresholdAlert(stock, status);
    const value = $('[data-stock-value]');
    if (value)
      value.textContent = new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 0,
      }).format(qty * Number(value.dataset.price ?? 0));
    stockBefore = null;
  }

  // Workflow panel replaced: replay the stepper from the previous status and flip the badge.
  const wf = document.getElementById('workflow-panel');
  if (wf && workflowBefore && workflowBefore.status !== wf.dataset.status) {
    const stepper = $('.stepper', wf);
    if (stepper) animateStepper(stepper, { fromStep: Math.max(0, $$('.step.done', stepper).length - 1) });
    statusChanged($('#request-status-badge .badge'));
    const tl = document.getElementById('workflow-timeline');
    if (tl) animateTimeline(tl, true);
  }
  workflowBefore = null;

  if (target.id === 'notif-drawer-body') drawerContentIn(target);
});

// Out-of-band swaps (e.g. timeline, movements) also need modules/animations.
document.addEventListener('htmx:oobAfterSwap', (evt) => {
  const d = (evt as CustomEvent<HtmxRequestDetail>).detail;
  if (d.target instanceof HTMLElement) {
    mountModules(d.target);
    enterNew(d.target);
  }
});

// Drop empty filter values from GET requests so pushed URLs stay clean (/requests?q=desk).
document.addEventListener('htmx:configRequest', (evt) => {
  const d = (evt as CustomEvent<{ verb: string; formData?: FormData }>).detail;
  if (d.verb !== 'get' || !d.formData) return;
  const empty: string[] = [];
  d.formData.forEach((value, key) => {
    if (value === '') empty.push(key);
  });
  for (const key of empty) d.formData.delete(key);
});

// Errors: status codes HTMX does not swap carry their message in X-Error-Message.
document.addEventListener('htmx:responseError', (evt) => {
  const d = (evt as CustomEvent<HtmxRequestDetail>).detail;
  progressDone();
  const header = d.xhr.getResponseHeader('X-Error-Message');
  const message = header
    ? decodeURIComponent(header)
    : d.xhr.status === 0
      ? 'Network error — check your connection.'
      : 'Something went wrong. Please try again.';
  toast({ type: 'error', message });
});
document.addEventListener('htmx:sendError', () => {
  progressDone();
  toast({ type: 'error', message: 'Could not reach the server. Check your connection.' });
});

// Styled confirmation for every [data-confirm] action.
document.addEventListener('htmx:confirm', (evt) => {
  const d = (evt as CustomEvent<HtmxRequestDetail>).detail;
  const question = (d.elt as HTMLElement).dataset.confirm;
  if (!question) return;
  evt.preventDefault();
  void confirmDialog(
    question,
    (d.elt.textContent ?? '').trim().split(/\s+/).slice(0, 2).join(' ') || 'Confirm',
  ).then((ok) => ok && d.issueRequest?.(true));
});

// Animated row removal for hx-delete with "swap:" delay (e.g. table rows).
document.addEventListener('htmx:beforeSwap', (evt) => {
  const d = (evt as CustomEvent<HtmxRequestDetail>).detail;
  if (
    d.requestConfig?.verb === 'delete' &&
    d.xhr.status === 200 &&
    d.target.matches('tr, .notif') &&
    !reducedMotion()
  ) {
    gsap.to(d.target, { opacity: 0, x: 30, duration: 0.25, ease: 'power2.in' });
  }
});

// Forms that should reset after a successful submit (comments).
document.addEventListener('htmx:afterRequest', (evt) => {
  const d = (evt as CustomEvent<HtmxRequestDetail>).detail;
  const form = d.elt instanceof HTMLFormElement ? d.elt : null;
  if (form && d.successful && form.hasAttribute('data-reset-on-success')) form.reset();
});

// ------------------------------------------------------------------ server-sent HX-Trigger events

document.body.addEventListener('fd:toast', (evt) => toast((evt as CustomEvent<ToastInput>).detail));
document.body.addEventListener('fd:close-modal', () => void closeModal());
document.body.addEventListener('fd:unread', (evt) =>
  setUnreadCount((evt as CustomEvent<{ count: number }>).detail.count),
);
document.body.addEventListener('fd:comment-added', () => {
  $('#no-comments')?.remove();
  const count = $('#comment-count');
  if (count) {
    const n = $$('#comment-list .comment').length;
    count.textContent = `${n} comment${n === 1 ? '' : 's'}`;
  }
});

// ------------------------------------------------------------------ realtime → global UI

onEvent((e) => {
  if (e.type === 'notification.created' && e.userId === currentUser()) {
    void refreshUnreadCount();
    bellRing($('[data-drawer-open="notif-drawer"] svg'));
    toast({
      type:
        e.notificationType === 'inventory.out'
          ? 'error'
          : e.notificationType === 'inventory.low'
            ? 'warning'
            : 'info',
      title: 'New notification',
      message: e.title ?? '',
      href: '/notifications',
    });
    if (isDrawerOpen('notif-drawer')) {
      const body = document.getElementById('notif-drawer-body');
      if (body) void htmx.ajax('GET', '/notifications/drawer', { target: body, swap: 'innerHTML' });
    }
    const list = document.getElementById('notification-results');
    if (list) void htmx.ajax('GET', location.pathname + location.search, { target: list, swap: 'outerHTML' });
  }
});

// ------------------------------------------------------------------ delegated UI behaviour

document.addEventListener('click', (e) => {
  const t = e.target as Element;

  const drawerOpen = t.closest<HTMLElement>('[data-drawer-open]');
  if (drawerOpen) openDrawer(drawerOpen.dataset.drawerOpen!);
  if (t.closest('[data-drawer-close], [data-drawer-scrim]')) closeDrawer();

  if (t.closest('[data-close-modal]')) void closeModal();

  const navToggle = t.closest('[data-nav-toggle]');
  if (navToggle || t.closest('[data-nav-scrim]')) {
    const sidebar = document.getElementById('sidebar');
    const open = !sidebar?.classList.contains('open');
    sidebar?.classList.toggle('open', open);
    $('[data-nav-scrim]')?.classList.toggle('on', open);
    $('[data-nav-toggle]')?.setAttribute('aria-expanded', String(open));
  }

  const demo = t.closest<HTMLElement>('[data-demo-email]');
  if (demo) {
    const email = $<HTMLInputElement>('#f-email');
    const password = $<HTMLInputElement>('#f-password');
    if (email) email.value = demo.dataset.demoEmail ?? '';
    if (password) password.value = demo.dataset.demoPassword ?? '';
    password?.focus();
  }

  const quick = t.closest<HTMLElement>('[data-quick-issue]');
  if (quick) {
    const form = quick.closest('form');
    const type = form?.querySelector<HTMLSelectElement>('[name="type"]');
    const qty = form?.querySelector<HTMLInputElement>('[name="quantity"]');
    const reason = form?.querySelector<HTMLInputElement>('[name="reason"]');
    if (form && type && qty) {
      type.value = 'ISSUE';
      qty.value = quick.dataset.quickIssue ?? '1';
      if (reason && !reason.value) reason.value = 'Issued at the service desk';
      form.requestSubmit();
    }
  }

  const viewToggle = t.closest<HTMLElement>('[data-view-toggle]');
  if (viewToggle) {
    const hidden = $<HTMLInputElement>('#prod-view');
    if (hidden) hidden.value = viewToggle.dataset.viewToggle ?? 'grid';
    $$('[data-view-toggle]').forEach((a) => a.setAttribute('aria-current', String(a === viewToggle)));
  }

  const seg = t.closest<HTMLElement>('[data-seg]');
  if (seg)
    seg.parentElement
      ?.querySelectorAll('[data-seg]')
      .forEach((a) => a.setAttribute('aria-current', String(a === seg)));
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeDrawer();
    if ($('#modal-root .modal')) void closeModal();
    const sidebar = document.getElementById('sidebar');
    if (sidebar?.classList.contains('open')) $<HTMLElement>('[data-nav-toggle]')?.click();
  }
  trapFocus(e);
});

// Product card tilt (delegated per card via the registry-like attribute).
const tilted = new WeakSet<HTMLElement>();
function attachTilt(scope: ParentNode) {
  for (const card of $$('[data-tilt]', scope)) {
    if (tilted.has(card)) continue;
    tilted.add(card);
    tilt(card);
  }
}
document.addEventListener('htmx:afterSettle', () => attachTilt(document));

// ------------------------------------------------------------------ flash & boot

function showFlash() {
  const flash = document.getElementById('flash') as HTMLTemplateElement | null;
  if (!flash) return;
  toast({
    type: (flash.dataset.type as ToastInput['type']) ?? 'success',
    message: flash.dataset.message ?? '',
  });
  flash.remove();
}

function boot() {
  syncRealtimeConnection();
  mountModules(document);
  const main = document.getElementById('main');
  if (main && main.dataset.page !== 'landing') pageEnter(main);
  revealCards(document);
  attachTilt(document);
  showFlash();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
