import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, scalar, signIn, type Agent, type TestContext } from '../helpers/testApp.js';

let ctx: TestContext;
let employee: Agent;
let manager: Agent;
let operations: Agent;

beforeAll(async () => {
  ctx = await createTestApp();
  employee = await signIn(ctx.app, 'sinta.wirawan@arunika.co.id');
  manager = await signIn(ctx.app, 'raka.pratama@arunika.co.id');
  operations = await signIn(ctx.app, 'dewi.lestari@arunika.co.id');
});
afterAll(async () => ctx?.close());

describe('request authorization', () => {
  it('does not let an employee approve, even their own request', async () => {
    // #1042 belongs to Sinta and is UNDER_REVIEW.
    const res = await employee.request('POST', '/requests/1042/transitions/approve');
    expect(res.statusCode).toBe(403);
    expect(await scalar(ctx.db, `SELECT status FROM requests WHERE request_number = 1042`)).toBe(
      'UNDER_REVIEW',
    );
  });

  it('does not let operations approve either', async () => {
    expect((await operations.request('POST', '/requests/1042/transitions/approve')).statusCode).toBe(403);
  });

  it('lets a manager approve', async () => {
    const res = await manager.request('POST', '/requests/1042/transitions/approve');
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('id="workflow-panel"');
    expect(await scalar(ctx.db, `SELECT status FROM requests WHERE request_number = 1042`)).toBe('APPROVED');
  });

  it('hides other people’s requests from employees (404, not 403)', async () => {
    const otherNumber = await scalar<number>(
      ctx.db,
      `SELECT r.request_number FROM requests r JOIN users u ON u.id = r.requester_id
       WHERE u.email <> 'sinta.wirawan@arunika.co.id' AND (r.assignee_id IS NULL OR r.assignee_id <> u.id) LIMIT 1`,
    );
    expect((await employee.request('GET', `/requests/${otherNumber}`)).statusCode).toBe(404);
    expect((await manager.request('GET', `/requests/${otherNumber}`)).statusCode).toBe(200);
  });

  it('limits the request list to the employee’s own requests', async () => {
    const res = await employee.request('GET', '/requests', undefined, { 'hx-target': 'request-results' });
    const numbers = [...res.body.matchAll(/id="req-row-(\d+)"/g)].map((m) => Number(m[1]));
    const own = await ctx.db.query<{ n: number }>(
      `SELECT r.request_number AS n FROM requests r JOIN users u ON u.id = r.requester_id WHERE u.email = 'sinta.wirawan@arunika.co.id'`,
    );
    const ownSet = new Set(own.rows.map((r) => r.n));
    expect(numbers.length).toBeGreaterThan(0);
    expect(numbers.every((n) => ownSet.has(n))).toBe(true);
  });
});

describe('administrative areas', () => {
  it.each(['/audit', '/users', '/settings', '/products/new'])('forbids employees from %s', async (url) => {
    expect((await employee.request('GET', url, undefined, { 'hx-request': '' })).statusCode).toBe(403);
  });

  it('lets admins in', async () => {
    const admin = await signIn(ctx.app, 'admin@arunika.co.id');
    for (const url of ['/audit', '/users', '/settings'])
      expect((await admin.request('GET', url)).statusCode).toBe(200);
  });

  it('ignores role values smuggled into self-registration', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/register',
      remoteAddress: '10.44.0.1',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        fullName: 'Bima Saputra',
        email: 'bima.saputra@arunika.co.id',
        departmentId: '1',
        password: 'Strong-Pass-123',
        confirmPassword: 'Strong-Pass-123',
        roles: 'ADMIN',
      }).toString(),
    });
    expect(res.statusCode).toBe(303);
    const roles = await scalar<string[]>(
      ctx.db,
      `SELECT array_agg(r.name) FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id WHERE u.email = 'bima.saputra@arunika.co.id'`,
    );
    expect(roles).toEqual(['EMPLOYEE']);
  });

  it('only lets users act on their own notifications', async () => {
    const someoneElses = await scalar<string>(
      ctx.db,
      `SELECT n.id FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.email <> 'sinta.wirawan@arunika.co.id' LIMIT 1`,
    );
    expect((await employee.request('DELETE', `/notifications/${someoneElses}`)).statusCode).toBe(404);
    expect(
      await scalar(ctx.db, `SELECT count(*)::int FROM notifications WHERE id = $1`, [someoneElses]),
    ).toBe(1);
  });
});
