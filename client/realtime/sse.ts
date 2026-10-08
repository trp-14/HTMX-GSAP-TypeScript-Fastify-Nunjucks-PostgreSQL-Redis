import { STREAM_EVENTS, type FDEvent } from './types';

/**
 * One EventSource per tab. Every server event is re-dispatched on `document` as a DOM
 * CustomEvent ("fd:event", detail = payload) so page modules can react — and as
 * "fd:<type>" so HTMX elements can use hx-trigger="fd:notification.created from:body".
 *
 * Connection state drives the LIVE / RECONNECTING / OFFLINE indicator. After a connection is
 * restored, "fd:resync" tells live pages to re-fetch their state from the server.
 */
export type LiveState = 'live' | 'reconnecting' | 'offline';

let source: EventSource | null = null;
let state: LiveState = 'offline';
let everConnected = false;
let dropped = false;
let offlineTimer: number | undefined;
let lastEventAt: number | null = null;

export const liveState = () => state;
export const lastEventTime = () => lastEventAt;

function setState(next: LiveState) {
  state = next;
  for (const el of document.querySelectorAll<HTMLElement>('[data-live-status]')) {
    el.dataset.state = next;
    const label = el.querySelector('[data-live-label]');
    if (label) label.textContent = next.toUpperCase();
  }
  for (const dot of document.querySelectorAll<HTMLElement>('[data-live-dot]')) dot.hidden = next !== 'live';
  document.dispatchEvent(new CustomEvent('fd:live-state', { detail: next }));
}

/** Re-applies the current state to freshly swapped DOM (e.g. after hx-boost navigation). */
export function paintLiveState() {
  setState(state);
}

export function connect(): void {
  if (source) return;
  setState(everConnected ? 'reconnecting' : 'offline');
  source = new EventSource('/events/stream', { withCredentials: true });

  source.addEventListener('open', () => {
    window.clearTimeout(offlineTimer);
    setState('live');
    if (dropped) document.dispatchEvent(new CustomEvent('fd:resync'));
    everConnected = true;
    dropped = false;
  });

  source.addEventListener('error', () => {
    if (!source) return;
    dropped = true;
    if (source.readyState === EventSource.CLOSED) {
      // The browser gave up (e.g. 401 after the session expired) — retry ourselves with backoff.
      source = null;
      setState('offline');
      offlineTimer = window.setTimeout(connect, 5000);
      return;
    }
    setState('reconnecting');
    window.clearTimeout(offlineTimer);
    offlineTimer = window.setTimeout(() => state !== 'live' && setState('offline'), 15_000);
  });

  source.addEventListener('session.expired', () => {
    disconnect();
    window.location.href = '/login?next=' + encodeURIComponent(location.pathname);
  });

  for (const type of STREAM_EVENTS) {
    source.addEventListener(type, (msg) => {
      let payload: FDEvent;
      try {
        payload = JSON.parse((msg as MessageEvent<string>).data) as FDEvent;
      } catch {
        return;
      }
      lastEventAt = Date.now();
      document.dispatchEvent(new CustomEvent<FDEvent>('fd:event', { detail: payload }));
      document.body.dispatchEvent(new CustomEvent(`fd:${type}`, { detail: payload, bubbles: true }));
    });
  }
}

export function disconnect(): void {
  window.clearTimeout(offlineTimer);
  source?.close();
  source = null;
  everConnected = false;
  setState('offline');
}

/** Subscribe to stream events; returns an unsubscribe function for module cleanup. */
export function onEvent(handler: (e: FDEvent) => void): () => void {
  const listener = (evt: Event) => handler((evt as CustomEvent<FDEvent>).detail);
  document.addEventListener('fd:event', listener);
  return () => document.removeEventListener('fd:event', listener);
}

export function onResync(handler: () => void): () => void {
  document.addEventListener('fd:resync', handler);
  return () => document.removeEventListener('fd:resync', handler);
}
