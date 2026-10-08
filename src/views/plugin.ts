import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Environment } from 'nunjucks';
import type { Container } from '../container.js';
import type { Permission } from '../auth/permissions.js';
import { isHtmx } from '../middleware/htmx.js';

declare module 'fastify' {
  interface FastifyReply {
    /** Renders a Nunjucks template with the shared layout context. */
    render(template: string, context?: Record<string, unknown>): Promise<FastifyReply>;
  }
}

type NavItem = { href: string; label: string; icon: string; section: 'main' | 'admin'; permission?: Permission };

const NAV: NavItem[] = [
  { href: '/overview', label: 'Overview', icon: 'grid', section: 'main' },
  { href: '/requests', label: 'Requests', icon: 'inbox', section: 'main' },
  { href: '/monitor', label: 'Monitor Real-Time', icon: 'pulse', section: 'main', permission: 'monitor:view' },
  { href: '/products', label: 'Products', icon: 'box', section: 'main', permission: 'product:read' },
  { href: '/knowledge', label: 'Knowledge Center', icon: 'book', section: 'main' },
  { href: '/notifications', label: 'Notifications', icon: 'bell', section: 'main' },
  { href: '/account', label: 'Account', icon: 'user', section: 'main' },
  { href: '/users', label: 'Users', icon: 'users', section: 'admin', permission: 'user:manage' },
  { href: '/audit', label: 'Audit Logs', icon: 'shield', section: 'admin', permission: 'audit:read' },
  { href: '/settings', label: 'Settings', icon: 'sliders', section: 'admin', permission: 'settings:manage' },
];

export default fp(async function viewPlugin(app: FastifyInstance, opts: { env: Environment; container: Container }) {
  const { env, container } = opts;
  const { sessions } = container.deps;

  async function baseContext(req: FastifyRequest) {
    const actor = req.actor;
    const settings = await container.services.settings.get();
    const path = req.url.split('?')[0] ?? '/';
    const ctx: Record<string, unknown> = {
      currentPath: path,
      settings,
      isHtmx: isHtmx(req),
      csrfToken: req.session?.data.csrfToken ?? '',
      user: null,
    };
    if (actor) {
      const [unreadCount, flash] = await Promise.all([
        container.services.notifications.unreadCount(actor.id),
        req.session ? sessions.takeFlash(req.session.id) : null,
      ]);
      const perms = Object.fromEntries([...actor.permissions].map((p) => [p, true]));
      ctx.user = { ...actor, permissions: perms, roleLabel: actor.roles.map((r) => r[0] + r.slice(1).toLowerCase()).join(' · ') };
      ctx.can = perms;
      ctx.unreadCount = unreadCount;
      ctx.flash = flash;
      ctx.nav = NAV.filter((n) => !n.permission || actor.permissions.has(n.permission)).map((n) => ({
        ...n,
        active: path === n.href || path.startsWith(n.href + '/'),
      }));
    }
    return ctx;
  }

  app.decorateReply('render', async function render(this: FastifyReply, template: string, context: Record<string, unknown> = {}) {
    const base = await baseContext(this.request);
    const html = await new Promise<string>((resolve, reject) =>
      env.render(template, { ...base, ...context }, (err, out) => (err ? reject(err) : resolve(out ?? ''))),
    );
    // Responses differ between full page and HTMX fragment for the same URL.
    this.header('Vary', 'HX-Request, HX-Target, HX-Boosted');
    this.header('Cache-Control', 'no-store');
    return this.type('text/html; charset=utf-8').send(html);
  });
});
