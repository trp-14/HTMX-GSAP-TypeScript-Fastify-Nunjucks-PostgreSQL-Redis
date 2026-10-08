import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, scalar, signIn, type Agent, type TestContext } from '../helpers/testApp.js';

let ctx: TestContext;
let employee: Agent;
let manager: Agent;
let operations: Agent;

beforeAll(async () => {
  ctx = await createTestApp();
  employee = await signIn(ctx.app, 'michael.tanoto@arunika.co.id');
  manager = await signIn(ctx.app, 'raka.pratama@arunika.co.id');
  operations = await signIn(ctx.app, 'dewi.lestari@arunika.co.id');
});
afterAll(async () => ctx?.close());

async function createDraft(title = 'Docking station for hybrid work setup') {
  const typeId = await scalar<number>(ctx.db, `SELECT id FROM request_types WHERE code = 'EQUIPMENT'`);
  const res = await employee.request('POST', '/requests', {
    title,
    description: 'Requesting a USB-C docking station for hot-desk days on Level 12.',
    typeId: String(typeId),
    priority: 'LOW',
    intent: 'draft',
  });
  expect(res.statusCode).toBe(204); // HTMX redirect via HX-Location
  const location = JSON.parse(String(res.headers['hx-location'])) as { path: string };
  return Number(location.path.split('/').pop());
}

const status = (n: number) =>
  scalar<string>(ctx.db, `SELECT status FROM requests WHERE request_number = $1`, [n]);

describe('workflow engine (end to end)', () => {
  it('validates input on create', async () => {
    const res = await employee.request('POST', '/requests', {
      title: 'x',
      description: 'short',
      typeId: '',
      priority: 'NOPE',
      intent: 'draft',
    });
    expect(res.statusCode).toBe(422);
    expect(res.body).toContain('Title must be at least 4 characters.');
  });

  it('runs the full happy path and records every step atomically', async () => {
    const n = await createDraft();
    ctx.events.events.length = 0;

    expect((await employee.request('POST', `/requests/${n}/transitions/submit`)).statusCode).toBe(200);
    expect((await manager.request('POST', `/requests/${n}/transitions/start-review`)).statusCode).toBe(200);
    expect((await manager.request('POST', `/requests/${n}/transitions/approve`)).statusCode).toBe(200);
    expect((await operations.request('POST', `/requests/${n}/transitions/start-processing`)).statusCode).toBe(
      200,
    );
    expect((await operations.request('POST', `/requests/${n}/transitions/complete`)).statusCode).toBe(200);
    expect(await status(n)).toBe('COMPLETED');

    const transitions = await ctx.db.query(
      `SELECT from_status, to_status FROM workflow_transitions w JOIN requests r ON r.id = w.request_id WHERE r.request_number = $1 ORDER BY w.id`,
      [n],
    );
    expect(transitions.rows.map((t) => `${t.from_status ?? '∅'}→${t.to_status}`)).toEqual([
      '∅→DRAFT',
      'DRAFT→SUBMITTED',
      'SUBMITTED→UNDER_REVIEW',
      'UNDER_REVIEW→APPROVED',
      'APPROVED→PROCESSING',
      'PROCESSING→COMPLETED',
    ]);

    const audit = await ctx.db.query(
      `SELECT action FROM audit_logs WHERE entity_type = 'request' AND entity_id = $1 ORDER BY id`,
      [String(n)],
    );
    expect(audit.rows.map((a) => a.action)).toEqual([
      'REQUEST_CREATED',
      'REQUEST_SUBMITTED',
      'REQUEST_REVIEW_STARTED',
      'REQUEST_APPROVED',
      'REQUEST_PROCESSING_STARTED',
      'REQUEST_COMPLETED',
    ]);
    expect(
      await scalar(
        ctx.db,
        `SELECT count(*)::int FROM approvals a JOIN requests r ON r.id = a.request_id WHERE r.request_number = $1`,
        [n],
      ),
    ).toBe(1);

    const types = ctx.events.events.map((e) => e.type).filter((t) => t.startsWith('request.'));
    expect(types).toEqual([
      'request.submitted',
      'request.review_started',
      'request.approved',
      'request.processing_started',
      'request.completed',
    ]);
    const approved = ctx.events.events.find((e) => e.type === 'request.approved')!;
    expect(approved).toMatchObject({ fromStatus: 'UNDER_REVIEW', toStatus: 'APPROVED', requestNumber: n });

    // The requester was notified of the decision and completion.
    const notes = await ctx.db.query(
      `SELECT type FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.email = 'michael.tanoto@arunika.co.id' AND n.entity_id = $1`,
      [String(n)],
    );
    expect(notes.rows.map((r) => r.type)).toEqual(
      expect.arrayContaining(['request.approved', 'request.completed']),
    );
  });

  it('never lets a completed request go back to draft (or anywhere else)', async () => {
    const completed = await scalar<number>(
      ctx.db,
      `SELECT request_number FROM requests WHERE status = 'COMPLETED' LIMIT 1`,
    );
    for (const action of [
      'submit',
      'start-review',
      'approve',
      'reject',
      'resubmit',
      'start-processing',
      'complete',
    ]) {
      const res = await manager.request('POST', `/requests/${completed}/transitions/${action}`, {
        note: 'try',
      });
      expect(res.statusCode).toBe(409);
    }
    expect(await status(completed)).toBe('COMPLETED');
  });

  it('rejects invalid transitions with 409 and changes nothing', async () => {
    const n = await createDraft('Replacement keyboard and mouse');
    const res = await manager.request('POST', `/requests/${n}/transitions/approve`);
    expect(res.statusCode).toBe(409);
    expect(await status(n)).toBe('DRAFT');
  });

  it('requires a note to reject, then supports the changes-requested loop', async () => {
    const n = await createDraft('Second monitor for reconciliation work');
    await employee.request('POST', `/requests/${n}/transitions/submit`);
    await manager.request('POST', `/requests/${n}/transitions/start-review`);

    const noNote = await manager.request('POST', `/requests/${n}/transitions/request-changes`);
    expect(noNote.statusCode).toBe(422);
    expect(await status(n)).toBe('UNDER_REVIEW');

    expect(
      (
        await manager.request('POST', `/requests/${n}/transitions/request-changes`, {
          note: 'Add the cost centre.',
        })
      ).statusCode,
    ).toBe(200);
    expect(await status(n)).toBe('CHANGES_REQUESTED');
    // Only the requester can resubmit.
    expect((await manager.request('POST', `/requests/${n}/transitions/resubmit`)).statusCode).toBe(403);
    expect((await employee.request('POST', `/requests/${n}/transitions/resubmit`)).statusCode).toBe(200);
    expect(await status(n)).toBe('SUBMITTED');
  });

  it('lets only the requester edit a draft, and only while editable', async () => {
    const n = await createDraft('Webcam for interview room');
    const typeId = await scalar<number>(ctx.db, `SELECT id FROM request_types WHERE code = 'EQUIPMENT'`);
    const body = {
      title: 'Webcam for the interview room',
      description: 'A 1080p webcam that mounts on the screen.',
      typeId: String(typeId),
      priority: 'MEDIUM',
    };
    expect((await manager.request('PUT', `/requests/${n}`, body)).statusCode).toBe(403);
    expect((await employee.request('PUT', `/requests/${n}`, body)).statusCode).toBe(204);
    expect(await scalar(ctx.db, `SELECT title FROM requests WHERE request_number = $1`, [n])).toBe(
      'Webcam for the interview room',
    );
  });

  it('deletes drafts for their requester only', async () => {
    const n = await createDraft('Branded notebook request');
    expect((await manager.request('DELETE', `/requests/${n}?from=list`)).statusCode).toBe(403);
    expect((await employee.request('DELETE', `/requests/${n}?from=list`)).statusCode).toBe(200);
    expect(await scalar(ctx.db, `SELECT count(*)::int FROM requests WHERE request_number = $1`, [n])).toBe(0);
  });

  it('assigns only to operations or manager accounts and notifies the assignee', async () => {
    const n = await scalar<number>(
      ctx.db,
      `SELECT request_number FROM requests WHERE status = 'SUBMITTED' LIMIT 1`,
    );
    const employeeId = await scalar<string>(
      ctx.db,
      `SELECT id FROM users WHERE email = 'putri.anggraini@arunika.co.id'`,
    );
    expect(
      (await manager.request('PUT', `/requests/${n}/assignee`, { assigneeId: employeeId })).statusCode,
    ).toBe(400);
    const opsId = await scalar<string>(
      ctx.db,
      `SELECT id FROM users WHERE email = 'dewi.lestari@arunika.co.id'`,
    );
    expect((await employee.request('PUT', `/requests/${n}/assignee`, { assigneeId: opsId })).statusCode).toBe(
      403,
    );
    expect((await manager.request('PUT', `/requests/${n}/assignee`, { assigneeId: opsId })).statusCode).toBe(
      200,
    );
    expect(
      await scalar(
        ctx.db,
        `SELECT count(*)::int FROM notifications WHERE user_id = $1 AND type = 'request.assigned' AND entity_id = $2`,
        [opsId, String(n)],
      ),
    ).toBe(1);
  });
});
