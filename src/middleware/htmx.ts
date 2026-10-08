import type { FastifyReply, FastifyRequest } from 'fastify';

export const isHtmx = (req: FastifyRequest) => req.headers['hx-request'] === 'true';
export const isBoosted = (req: FastifyRequest) => req.headers['hx-boosted'] === 'true';

/**
 * True when HTMX asked for a fragment for a specific target (search, filter, pagination…).
 * Boosted navigation and normal browser requests get full pages.
 */
export function wantsFragment(req: FastifyRequest, ...targets: string[]): boolean {
  if (!isHtmx(req) || isBoosted(req)) return false;
  if (targets.length === 0) return true;
  const target = req.headers['hx-target'];
  return typeof target === 'string' && targets.includes(target);
}

/** Redirect that works for both HTMX (client-side navigation) and plain form posts (303). */
export function redirect(req: FastifyRequest, reply: FastifyReply, url: string) {
  if (isHtmx(req)) {
    reply.header('HX-Location', JSON.stringify({ path: url, target: 'body' }));
    return reply.code(204).send();
  }
  return reply.code(303).redirect(url);
}

export type Toast = { type: 'success' | 'error' | 'info' | 'warning'; message: string };

/** Attaches client-side events to an HTMX response via the HX-Trigger header. */
export function trigger(reply: FastifyReply, events: Record<string, unknown>) {
  const existing = reply.getHeader('HX-Trigger');
  const merged = {
    ...(existing ? (JSON.parse(String(existing)) as Record<string, unknown>) : {}),
    ...events,
  };
  reply.header('HX-Trigger', asciiJson(merged));
}

export function toast(reply: FastifyReply, t: Toast) {
  trigger(reply, { 'fd:toast': t });
}

/** JSON with non-ASCII characters escaped, so it is always a valid HTTP header value. */
export function asciiJson(value: unknown): string {
  return JSON.stringify(value).replace(
    /[\u007f-\uffff]/g,
    (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
  );
}
