import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestApp,
  loginRequest,
  scalar,
  sessionCookie,
  signIn,
  type TestContext,
} from '../helpers/testApp.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => ctx?.close());

describe('authentication', () => {
  it('signs in with valid credentials and sets a secure session cookie', async () => {
    const res = await loginRequest(ctx.app, 'sinta.wirawan@arunika.co.id');
    expect(res.statusCode).toBe(303);
    expect(res.headers.location).toBe('/overview');
    const raw = String(res.headers['set-cookie']);
    expect(raw).toMatch(/fd_sid=/);
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Lax/i);
    const overview = await ctx.app.inject({
      method: 'GET',
      url: '/overview',
      headers: { cookie: sessionCookie(res)! },
    });
    expect(overview.statusCode).toBe(200);
    expect(overview.body).toContain('Sinta');
  });

  it('stores only a hash of the session id in Redis', async () => {
    const res = await loginRequest(ctx.app, 'sinta.wirawan@arunika.co.id', undefined, '10.0.0.2');
    const id = sessionCookie(res)!.split('=')[1]!;
    const keys = await ctx.redis.main.keys('fdtest:sess:*');
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.some((k) => k.includes(id))).toBe(false);
  });

  it('rejects invalid credentials without revealing which part was wrong', async () => {
    const wrongPassword = await loginRequest(
      ctx.app,
      'sinta.wirawan@arunika.co.id',
      'not-the-password',
      '10.0.0.3',
    );
    const unknownUser = await loginRequest(ctx.app, 'nobody@arunika.co.id', 'not-the-password', '10.0.0.3');
    for (const res of [wrongPassword, unknownUser]) {
      expect(res.statusCode).toBe(422);
      expect(sessionCookie(res)).toBeNull();
      expect(res.body).toContain('That email and password combination is not recognised.');
    }
  });

  it('refuses deactivated accounts', async () => {
    const res = await loginRequest(ctx.app, 'lina.marlina@arunika.co.id', undefined, '10.0.0.4');
    expect(res.statusCode).toBe(403);
    expect(sessionCookie(res)).toBeNull();
  });

  it('rate limits repeated sign-in attempts for an account', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++)
      statuses.push(
        (await loginRequest(ctx.app, 'raka.pratama@arunika.co.id', 'wrong-password', `10.1.0.${i}`))
          .statusCode,
      );
    expect(statuses.slice(0, 6).every((s) => s === 422)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });

  it('redirects anonymous users away from protected pages and fragments', async () => {
    const page = await ctx.app.inject({ method: 'GET', url: '/requests' });
    expect(page.statusCode).toBe(302);
    expect(page.headers.location).toBe('/login?next=%2Frequests');
    const fragment = await ctx.app.inject({
      method: 'GET',
      url: '/notifications/count',
      headers: { 'hx-request': 'true' },
    });
    expect(fragment.statusCode).toBe(401);
    expect(fragment.headers['hx-redirect']).toContain('/login');
  });

  it('logs out and invalidates the server-side session', async () => {
    const agent = await signIn(ctx.app, 'putri.anggraini@arunika.co.id');
    const out = await ctx.app.inject({
      method: 'POST',
      url: '/logout',
      headers: { cookie: agent.cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: `_csrf=${encodeURIComponent(agent.csrf)}`,
    });
    expect(out.statusCode).toBe(303);
    const after = await ctx.app.inject({
      method: 'GET',
      url: '/overview',
      headers: { cookie: agent.cookie },
    });
    expect(after.statusCode).toBe(302);
    expect(
      await scalar(ctx.db, `SELECT count(*)::int FROM audit_logs WHERE action = 'USER_LOGGED_OUT'`),
    ).toBeGreaterThan(0);
  });

  it('requires a CSRF token for state-changing requests', async () => {
    const agent = await signIn(ctx.app, 'putri.anggraini@arunika.co.id');
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/notifications/read-all',
      headers: { cookie: agent.cookie, 'hx-request': 'true' },
    });
    expect(res.statusCode).toBe(403);
    const ok = await agent.request('POST', '/notifications/read-all');
    expect(ok.statusCode).toBe(200);
  });

  it('blocks cross-site form posts by Origin', async () => {
    const agent = await signIn(ctx.app, 'putri.anggraini@arunika.co.id');
    const res = await agent.request('POST', '/notifications/read-all', undefined, {
      origin: 'https://evil.example',
    });
    expect(res.statusCode).toBe(403);
  });

  it('changing the password signs out other sessions', async () => {
    const first = await signIn(ctx.app, 'andi.setiawan@arunika.co.id');
    const second = await signIn(ctx.app, 'andi.setiawan@arunika.co.id');
    const res = await first.request('PUT', '/account/password', {
      currentPassword: 'FlowDesk!2026',
      newPassword: 'Another-Strong-Pass-1',
      confirmPassword: 'Another-Strong-Pass-1',
    });
    expect(res.statusCode).toBe(200);
    expect((await first.request('GET', '/account')).statusCode).toBe(200);
    expect(
      (await ctx.app.inject({ method: 'GET', url: '/account', headers: { cookie: second.cookie } }))
        .statusCode,
    ).toBe(302);
  });
});

describe('session expiration', () => {
  it('expires idle sessions', async () => {
    const short = await createTestApp({ SESSION_IDLE_TTL_SECONDS: '1' });
    try {
      const agent = await signIn(short.app, 'citra.maharani@arunika.co.id');
      expect((await agent.request('GET', '/overview')).statusCode).toBe(200);
      await new Promise((r) => setTimeout(r, 2100));
      const res = await short.app.inject({
        method: 'GET',
        url: '/overview',
        headers: { cookie: agent.cookie },
      });
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toContain('/login');
    } finally {
      await short.close();
    }
  });

  it('enforces the absolute session lifetime even for active sessions', async () => {
    const short = await createTestApp({ SESSION_ABSOLUTE_TTL_SECONDS: '1' });
    try {
      const agent = await signIn(short.app, 'citra.maharani@arunika.co.id');
      await new Promise((r) => setTimeout(r, 1200));
      const res = await short.app.inject({
        method: 'GET',
        url: '/overview',
        headers: { cookie: agent.cookie },
      });
      expect(res.statusCode).toBe(302);
    } finally {
      await short.close();
    }
  });
});
