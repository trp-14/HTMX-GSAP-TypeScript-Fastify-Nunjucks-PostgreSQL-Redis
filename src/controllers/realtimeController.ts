import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Container } from '../container.js';
import { actorOf } from '../auth/plugin.js';

/**
 * Server-Sent Events endpoint. One long-lived connection per browser tab carries every business
 * event the user is allowed to see. The browser reconnects automatically (EventSource) and the
 * pages resynchronise their state from PostgreSQL-backed fragments after a reconnect.
 */
export function realtimeController(c: Container) {
  const { hub, presence } = c;
  const { sessions, log } = c.deps;

  return {
    async stream(req: FastifyRequest, reply: FastifyReply) {
      const actor = actorOf(req);
      const sessionId = req.session!.id;
      reply.hijack();
      const raw = reply.raw;
      raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // disable proxy buffering (nginx)
      });
      raw.socket?.setKeepAlive(true);
      raw.socket?.setNoDelay(true);

      let closed = false;
      const write = (chunk: string) => {
        if (closed || raw.destroyed) return false;
        try {
          raw.write(chunk);
          return true;
        } catch {
          return false;
        }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        hub.remove(clientId);
        presence.leave('online', `${actor.id}:${clientId}`).catch(() => undefined);
        if (!raw.destroyed) raw.end();
      };

      const clientId = hub.add({ userId: actor.id, permissions: actor.permissions, send: write, close });
      write(`retry: 3000\n`);
      write(`event: hello\ndata: ${JSON.stringify({ clientId, serverTime: new Date().toISOString() })}\n\n`);
      await presence.touch('online', `${actor.id}:${clientId}`).catch(() => undefined);

      // Periodically confirm the session is still valid (logout / revocation / expiry end the stream).
      const timer = setInterval(async () => {
        try {
          if (!(await sessions.isAlive(sessionId))) {
            write(`event: session.expired\ndata: {}\n\n`);
            close();
            return;
          }
          await presence.touch('online', `${actor.id}:${clientId}`);
        } catch (err) {
          log.warn({ err }, 'sse session check failed');
        }
      }, 30_000);
      timer.unref();

      req.raw.on('close', close);
      raw.on('error', (err) => {
        log.warn({ err, clientId }, 'sse connection error');
        close();
      });
      log.debug({ clientId, userId: actor.id, clients: hub.size }, 'sse client connected');
    },
  };
}
