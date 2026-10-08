import type pg from 'pg';
import { hashPassword } from '../../auth/password.js';
import { ROLE_DESCRIPTIONS, ROLES, type Role } from '../../auth/permissions.js';
import { inventoryStatusFor } from '../../inventory/rules.js';
import { DEFAULT_SETTINGS } from '../../services/settingsService.js';
import type { RequestStatus } from '../../workflow/definition.js';
import {
  CHANGES_NOTES,
  COMMENT_POOL,
  DEPARTMENTS,
  PRODUCT_CATEGORIES,
  PRODUCTS,
  REJECTION_NOTES,
  REQUEST_TEMPLATES,
  REQUEST_TYPES,
  USERS,
} from './data.js';
import { KB_ARTICLES, KB_CATEGORIES } from './knowledge.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Deterministic PRNG so every seed produces the same demo data. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Status plan for the 56 seeded requests, oldest first. Index 41 becomes request #1042 — the
 * request used in the real-time demonstration (UNDER_REVIEW, ready for a manager to approve).
 */
const STATUS_PLAN: RequestStatus[] = [
  'COMPLETED',
  'COMPLETED',
  'REJECTED',
  'COMPLETED',
  'COMPLETED',
  'COMPLETED',
  'COMPLETED',
  'REJECTED',
  'COMPLETED',
  'COMPLETED',
  'COMPLETED',
  'COMPLETED',
  'COMPLETED',
  'REJECTED',
  'COMPLETED',
  'COMPLETED',
  'PROCESSING',
  'COMPLETED',
  'REJECTED',
  'PROCESSING',
  'COMPLETED',
  'PROCESSING',
  'APPROVED',
  'PROCESSING',
  'CHANGES_REQUESTED',
  'PROCESSING',
  'APPROVED',
  'PROCESSING',
  'COMPLETED',
  'APPROVED',
  'CHANGES_REQUESTED',
  'PROCESSING',
  'UNDER_REVIEW',
  'APPROVED',
  'UNDER_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'UNDER_REVIEW',
  'APPROVED',
  'UNDER_REVIEW',
  'CHANGES_REQUESTED',
  'UNDER_REVIEW',
  'SUBMITTED',
  'UNDER_REVIEW',
  'SUBMITTED',
  'UNDER_REVIEW',
  'SUBMITTED',
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'SUBMITTED',
  'DRAFT',
  'SUBMITTED',
  'DRAFT',
  'SUBMITTED',
  'DRAFT',
];
const DEMO_INDEX = 41;
const FINISH_TODAY = new Set([20, 28, 31, 33, 36, 38, 49, 52, 54]);
const RESUBMITTED = new Set([3, 9, 17, 26, 31]);

function pathTo(status: RequestStatus, resubmitted: boolean): RequestStatus[] {
  const review: RequestStatus[] = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW'];
  const loop: RequestStatus[] = resubmitted ? ['CHANGES_REQUESTED', 'SUBMITTED', 'UNDER_REVIEW'] : [];
  switch (status) {
    case 'DRAFT':
      return ['DRAFT'];
    case 'SUBMITTED':
      return ['DRAFT', 'SUBMITTED'];
    case 'UNDER_REVIEW':
      return review;
    case 'CHANGES_REQUESTED':
      return [...review, 'CHANGES_REQUESTED'];
    case 'REJECTED':
      return [...review, 'REJECTED'];
    case 'APPROVED':
      return [...review, ...loop, 'APPROVED'];
    case 'PROCESSING':
      return [...review, ...loop, 'APPROVED', 'PROCESSING'];
    case 'COMPLETED':
      return [...review, ...loop, 'APPROVED', 'PROCESSING', 'COMPLETED'];
  }
}

const AUDIT_FOR: Record<string, string> = {
  SUBMITTED: 'REQUEST_SUBMITTED',
  UNDER_REVIEW: 'REQUEST_REVIEW_STARTED',
  APPROVED: 'REQUEST_APPROVED',
  REJECTED: 'REQUEST_REJECTED',
  CHANGES_REQUESTED: 'REQUEST_CHANGES_REQUESTED',
  PROCESSING: 'REQUEST_PROCESSING_STARTED',
  COMPLETED: 'REQUEST_COMPLETED',
};

const NOTIFY_REQUESTER: Partial<Record<RequestStatus, (n: number) => [string, string]>> = {
  UNDER_REVIEW: (n) => ['request.review_started', `#${n} is now under review`],
  APPROVED: (n) => ['request.approved', `#${n} was approved`],
  REJECTED: (n) => ['request.rejected', `#${n} was rejected`],
  CHANGES_REQUESTED: (n) => ['request.changes_requested', `Changes requested on #${n}`],
  PROCESSING: (n) => ['request.processing_started', `#${n} is being processed`],
  COMPLETED: (n) => ['request.completed', `#${n} has been completed`],
};

export type SeedOptions = { password: string; log?: (msg: string) => void };

/** Wipes and re-creates all demo data inside a single transaction. */
export async function seedDatabase(pool: pg.Pool, opts: SeedOptions): Promise<void> {
  const log = opts.log ?? (() => undefined);
  const rand = mulberry32(20261008);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
  const between = (a: number, b: number) => a + rand() * (b - a);
  const now = Date.now();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  // "Today" counters use the database day; keep demo events of today inside it.
  const sinceMidnight = now - todayStart.getTime();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`TRUNCATE audit_logs, notifications, inventory_movements, products, product_categories,
      approvals, workflow_transitions, request_attachments, request_comments, requests, request_types,
      kb_articles, kb_categories, system_settings, user_roles, users, roles, departments RESTART IDENTITY CASCADE`);
    await client.query(`ALTER SEQUENCE request_number_seq RESTART WITH 1001`);

    const audit = (
      actorId: string | null,
      action: string,
      entityType: string,
      entityId: string,
      at: number,
      extra: { prev?: unknown; next?: unknown; meta?: unknown } = {},
    ) =>
      client.query(
        `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, previous_state, new_state, metadata, ip_address, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          actorId,
          action,
          entityType,
          entityId,
          extra.prev === undefined ? null : JSON.stringify(extra.prev),
          extra.next === undefined ? null : JSON.stringify(extra.next),
          JSON.stringify(extra.meta ?? {}),
          `10.20.${Math.floor(between(1, 30))}.${Math.floor(between(2, 250))}`,
          new Date(at),
        ],
      );
    const notify = (
      userId: string,
      type: string,
      title: string,
      body: string,
      link: string,
      entityType: string,
      entityId: string,
      at: number,
    ) =>
      client.query(
        `INSERT INTO notifications (user_id, type, title, body, link, entity_type, entity_id, read_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          userId,
          type,
          title,
          body,
          link,
          entityType,
          entityId,
          now - at > 2 * DAY && rand() < 0.85 ? new Date(at + HOUR) : null,
          new Date(at),
        ],
      );

    // ---------------------------------------------------------------- organisation
    const deptIds = new Map<string, number>();
    for (const d of DEPARTMENTS) {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO departments (code, name) VALUES ($1, $2) RETURNING id`,
        [d.code, d.name],
      );
      deptIds.set(d.code, rows[0]!.id);
    }
    for (const r of ROLES)
      await client.query(`INSERT INTO roles (name, description) VALUES ($1, $2)`, [r, ROLE_DESCRIPTIONS[r]]);

    log('hashing demo passwords…');
    type U = { id: string; email: string; fullName: string; dept: string; roles: Role[]; active: boolean };
    const users: U[] = [];
    for (const [i, u] of USERS.entries()) {
      const hash = await hashPassword(opts.password);
      const createdAt = new Date(now - (180 - i * 3) * DAY);
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO users (email, full_name, job_title, department_id, password_hash, is_active, created_at, updated_at, last_login_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8) RETURNING id`,
        [
          u.email,
          u.fullName,
          u.title,
          deptIds.get(u.dept),
          hash,
          u.active !== false,
          createdAt,
          u.active === false ? null : new Date(now - between(0.1, 6) * DAY),
        ],
      );
      const id = rows[0]!.id;
      await client.query(
        `INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = ANY($2::text[])`,
        [id, u.roles],
      );
      users.push({
        id,
        email: u.email,
        fullName: u.fullName,
        dept: u.dept,
        roles: u.roles,
        active: u.active !== false,
      });
    }
    const byEmail = (email: string) => users.find((u) => u.email === email)!;
    const admin = byEmail('admin@arunika.co.id');
    const active = users.filter((u) => u.active);
    const managers = active.filter((u) => u.roles.includes('MANAGER'));
    const ops = active.filter((u) => u.roles.includes('OPERATIONS'));
    const requesters = active.filter((u) => !u.roles.includes('ADMIN'));
    for (const u of users) {
      await audit(admin.id, 'USER_CREATED', 'user', u.id, now - 170 * DAY, {
        next: { email: u.email, roles: u.roles },
      });
    }

    // ---------------------------------------------------------------- request types
    const typeIds = new Map<string, { id: number; sla: number }>();
    for (const t of REQUEST_TYPES) {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO request_types (code, name, description, sla_days) VALUES ($1, $2, $3, $4) RETURNING id`,
        [t.code, t.name, t.description, t.sla],
      );
      typeIds.set(t.code, { id: rows[0]!.id, sla: t.sla });
    }

    // ---------------------------------------------------------------- requests & workflow history
    log('creating requests with workflow history…');
    const rest = REQUEST_TEMPLATES.slice(1);
    let templateCursor = 0;
    const sinta = byEmail('sinta.wirawan@arunika.co.id');
    for (const [i, status] of STATUS_PLAN.entries()) {
      const tpl = i === DEMO_INDEX ? REQUEST_TEMPLATES[0]! : rest[templateCursor++ % rest.length]!;
      const requester = i === DEMO_INDEX ? sinta : requesters[(i * 7 + 3) % requesters.length]!;
      const steps = pathTo(status, RESUBMITTED.has(i));
      const created = now - 36 * DAY * (1 - i / STATUS_PLAN.length) - between(1, 6) * HOUR;
      const lastAt = FINISH_TODAY.has(i)
        ? now - between(0.05, 0.9) * Math.min(5 * HOUR, sinceMidnight)
        : Math.min(now - between(1, 8) * HOUR, created + (steps.length - 1) * between(5, 26) * HOUR);
      const spacing = steps.length > 1 ? (lastAt - created) / (steps.length - 1) : 0;
      const times = steps.map((_, j) => created + j * spacing);
      const reviewer = managers.filter((m) => m.id !== requester.id)[(i * 3) % (managers.length - 1)]!;
      const operator = ops.filter((o) => o.id !== requester.id)[(i * 5) % (ops.length - 1)]!;
      const assigned = ['PROCESSING', 'COMPLETED'].includes(status) || (status === 'APPROVED' && i % 2 === 0);
      const type = typeIds.get(tpl.type)!;
      // Closed requests keep their original due date; most open ones are still within SLA, a few are late.
      const open = !['COMPLETED', 'REJECTED'].includes(status);
      const dueAt = open
        ? now + ((i % 5 === 0 ? -2 : 1) + (i % 4)) * DAY
        : created + type.sla * DAY + (i % 3) * DAY;
      const due = new Date(dueAt).toISOString().slice(0, 10);
      const at = (s: RequestStatus) => {
        const idx = steps.lastIndexOf(s);
        return idx >= 0 ? new Date(times[idx]!) : null;
      };

      const { rows } = await client.query<{ id: string; request_number: number }>(
        `INSERT INTO requests (title, description, request_type_id, requester_id, department_id, priority, status, assignee_id,
                               due_date, submitted_at, decided_at, completed_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id, request_number`,
        [
          tpl.title,
          tpl.description,
          type.id,
          requester.id,
          deptIds.get(requester.dept),
          tpl.priority,
          status,
          assigned ? operator.id : null,
          due,
          at('SUBMITTED'),
          at('APPROVED') ?? at('REJECTED') ?? at('CHANGES_REQUESTED'),
          at('COMPLETED'),
          new Date(created),
          new Date(lastAt),
        ],
      );
      const { id: requestId, request_number: number } = rows[0]!;
      const ref = String(number);
      const link = `/requests/${number}`;

      await client.query(
        `INSERT INTO workflow_transitions (request_id, from_status, to_status, actor_id, created_at) VALUES ($1, NULL, 'DRAFT', $2, $3)`,
        [requestId, requester.id, new Date(created)],
      );
      await audit(requester.id, 'REQUEST_CREATED', 'request', ref, created, {
        next: { status: 'DRAFT', title: tpl.title },
        meta: { title: tpl.title, type: tpl.type },
      });

      for (let j = 1; j < steps.length; j++) {
        const from = steps[j - 1]!;
        const to = steps[j]!;
        const t = times[j]!;
        const actor =
          to === 'SUBMITTED' ? requester : to === 'PROCESSING' || to === 'COMPLETED' ? operator : reviewer;
        const note =
          to === 'REJECTED'
            ? pick(REJECTION_NOTES)
            : to === 'CHANGES_REQUESTED'
              ? pick(CHANGES_NOTES)
              : to === 'APPROVED' && rand() < 0.3
                ? 'Approved — within budget.'
                : null;
        await client.query(
          `INSERT INTO workflow_transitions (request_id, from_status, to_status, actor_id, note, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
          [requestId, from, to, actor.id, note, new Date(t)],
        );
        if (to === 'APPROVED' || to === 'REJECTED' || to === 'CHANGES_REQUESTED') {
          await client.query(
            `INSERT INTO approvals (request_id, approver_id, decision, comment, created_at) VALUES ($1, $2, $3, $4, $5)`,
            [requestId, reviewer.id, to, note, new Date(t)],
          );
        }
        const action = from === 'CHANGES_REQUESTED' ? 'REQUEST_RESUBMITTED' : AUDIT_FOR[to]!;
        await audit(actor.id, action, 'request', ref, t, {
          prev: { status: from },
          next: { status: to },
          meta: { title: tpl.title, note },
        });

        const copy = NOTIFY_REQUESTER[to]?.(number);
        if (copy && actor.id !== requester.id) {
          await notify(
            requester.id,
            copy[0],
            copy[1],
            note ? `${actor.fullName}: “${note}”` : `${actor.fullName} updated “${tpl.title}”.`,
            link,
            'request',
            ref,
            t,
          );
        }
        if (to === 'APPROVED' && assigned) {
          await audit(reviewer.id, 'REQUEST_ASSIGNED', 'request', ref, t + 60_000, {
            prev: { assigneeId: null },
            next: { assigneeId: operator.id, assignee: operator.fullName },
            meta: { title: tpl.title },
          });
          await notify(
            operator.id,
            'request.assigned',
            `You were assigned #${number}`,
            `${reviewer.fullName} assigned “${tpl.title}” to you.`,
            link,
            'request',
            ref,
            t + 60_000,
          );
        }
        if (to === 'SUBMITTED' && status === 'SUBMITTED') {
          for (const m of managers.filter((x) => x.id !== requester.id).slice(0, 3)) {
            await notify(
              m.id,
              'request.submitted',
              `#${number} is waiting for review`,
              `${requester.fullName} submitted “${tpl.title}”.`,
              link,
              'request',
              ref,
              t,
            );
          }
        }
      }

      // Discussion on a good share of active and closed requests.
      if (steps.length > 2 && rand() < 0.65) {
        const count = 1 + Math.floor(rand() * 3);
        for (let c = 0; c < count; c++) {
          const t = created + ((lastAt - created) * (c + 1)) / (count + 1);
          const [author, pool] =
            c % 3 === 0
              ? [requester, COMMENT_POOL.requester]
              : c % 3 === 1
                ? [reviewer, COMMENT_POOL.manager]
                : [operator, COMMENT_POOL.operations];
          const body = pick(pool);
          const { rows: cr } = await client.query<{ id: string }>(
            `INSERT INTO request_comments (request_id, author_id, body, created_at) VALUES ($1, $2, $3, $4) RETURNING id`,
            [requestId, author.id, body, new Date(t)],
          );
          await audit(author.id, 'REQUEST_COMMENTED', 'request', ref, t, {
            meta: { commentId: cr[0]!.id, excerpt: body.slice(0, 120) },
          });
          if (author.id !== requester.id) {
            await notify(
              requester.id,
              'request.commented',
              `${author.fullName} commented on #${number}`,
              body,
              `${link}#comments`,
              'request',
              ref,
              t,
            );
          }
        }
      }
    }

    // ---------------------------------------------------------------- products & inventory
    log('creating products and inventory movements…');
    const catIds = new Map<string, number>();
    for (const c of PRODUCT_CATEGORIES) {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO product_categories (slug, name, description, art, hue) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [c.slug, c.name, c.description, c.art, c.hue],
      );
      catIds.set(c.slug, rows[0]!.id);
    }
    const stockKeepers = ops.filter((o) =>
      [
        'bayu.santoso@arunika.co.id',
        'dewi.lestari@arunika.co.id',
        'larasati.putri@arunika.co.id',
        'fajar.nugroho@arunika.co.id',
      ].includes(o.email),
    );
    for (const [pi, p] of PRODUCTS.entries()) {
      const createdAt = now - (48 - pi * 0.2) * DAY;
      // Build a plausible movement history that ends exactly at the target stock level.
      let qty = p.stock + Math.max(2, Math.round(p.threshold * 1.5)) + Math.floor(rand() * 8);
      const initial = qty;
      const moves: { type: string; delta: number; prev: number; next: number; at: number; reason: string }[] =
        [];
      const n = 3 + Math.floor(rand() * 4);
      for (let k = 0; k < n; k++) {
        const t = createdAt + ((now - createdAt - 2 * HOUR) * (k + 1)) / (n + 2);
        const issue = rand() < 0.7 && qty > 0;
        const amount = issue
          ? Math.max(1, Math.min(qty, Math.ceil(rand() * Math.max(2, p.threshold))))
          : Math.ceil(rand() * Math.max(3, p.threshold * 2));
        const next = issue ? qty - amount : qty + amount;
        moves.push({
          type: issue ? 'ISSUE' : 'RECEIPT',
          delta: next - qty,
          prev: qty,
          next,
          at: t,
          reason: issue ? `Issued for request #${1001 + Math.floor(rand() * 40)}` : 'Supplier delivery',
        });
        qty = next;
      }
      if (qty !== p.stock) {
        const t = now - between(2, 30) * HOUR;
        const issue = qty > p.stock;
        moves.push({
          type: issue ? 'ISSUE' : 'RECEIPT',
          delta: p.stock - qty,
          prev: qty,
          next: p.stock,
          at: t,
          reason: issue ? 'Issued for onboarding kit' : 'Supplier delivery',
        });
        qty = p.stock;
      }
      const status = inventoryStatusFor(p.stock, p.threshold);
      const lastAt = moves.length ? moves[moves.length - 1]!.at : createdAt;
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO products (sku, name, description, category_id, price, stock_quantity, reorder_threshold, status, inventory_status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [
          p.sku,
          p.name,
          p.description,
          catIds.get(p.category),
          p.price,
          p.stock,
          p.threshold,
          p.status ?? 'ACTIVE',
          status,
          new Date(createdAt),
          new Date(lastAt),
        ],
      );
      const productId = rows[0]!.id;
      await audit(admin.id, 'PRODUCT_CREATED', 'product', p.sku, createdAt, {
        next: { sku: p.sku, name: p.name, price: p.price, stockQuantity: initial },
      });
      await client.query(
        `INSERT INTO inventory_movements (product_id, actor_id, movement_type, quantity_delta, previous_quantity, new_quantity, reason, created_at)
         VALUES ($1, $2, 'INITIAL', $3, 0, $3, 'Opening stock', $4)`,
        [productId, admin.id, initial, new Date(createdAt)],
      );
      for (const m of moves) {
        const actor = pick(stockKeepers);
        await client.query(
          `INSERT INTO inventory_movements (product_id, actor_id, movement_type, quantity_delta, previous_quantity, new_quantity, reason, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [productId, actor.id, m.type, m.delta, m.prev, m.next, m.reason, new Date(m.at)],
        );
        await audit(actor.id, 'INVENTORY_CHANGED', 'product', p.sku, m.at, {
          prev: { stockQuantity: m.prev, inventoryStatus: inventoryStatusFor(m.prev, p.threshold) },
          next: { stockQuantity: m.next, inventoryStatus: inventoryStatusFor(m.next, p.threshold) },
          meta: { movementType: m.type, delta: m.delta, reason: m.reason, name: p.name },
        });
      }
      if (status !== 'IN_STOCK' && (p.status ?? 'ACTIVE') === 'ACTIVE') {
        const out = status === 'OUT_OF_STOCK';
        for (const u of [...ops, admin]) {
          await notify(
            u.id,
            out ? 'inventory.out' : 'inventory.low',
            out ? `${p.name} is out of stock` : `${p.name} is running low`,
            out
              ? `${p.sku} has no units left. Reorder threshold is ${p.threshold}.`
              : `${p.sku} is down to ${p.stock} unit(s) — at or below the reorder threshold of ${p.threshold}.`,
            `/products/${productId}`,
            'product',
            p.sku,
            lastAt,
          );
        }
      }
    }

    // ---------------------------------------------------------------- knowledge center
    log('writing Knowledge Center articles…');
    const kbIds = new Map<string, number>();
    for (const [i, c] of KB_CATEGORIES.entries()) {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO kb_categories (slug, name, description, position) VALUES ($1, $2, $3, $4) RETURNING id`,
        [c.slug, c.name, c.description, i],
      );
      kbIds.set(c.slug, rows[0]!.id);
    }
    for (const a of KB_ARTICLES) {
      const words = a.body.split(/\s+/).length;
      const published = new Date(now - a.daysAgo * DAY);
      await client.query(
        `INSERT INTO kb_articles (slug, category_id, title, summary, body_markdown, tags, reading_minutes, author_id, published_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          a.slug,
          kbIds.get(a.category),
          a.title,
          a.summary,
          a.body,
          a.tags,
          Math.max(2, Math.round(words / 200)),
          byEmail(a.author).id,
          published,
          new Date(published.getTime() + Math.floor(a.daysAgo / 3) * DAY),
        ],
      );
    }

    // ---------------------------------------------------------------- settings
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      await client.query(`INSERT INTO system_settings (key, value, updated_by) VALUES ($1, $2, $3)`, [
        key,
        JSON.stringify(value),
        admin.id,
      ]);
    }

    await client.query('COMMIT');
    log(
      `seeded ${users.length} users, ${STATUS_PLAN.length} requests, ${PRODUCTS.length} products, ${KB_ARTICLES.length} articles`,
    );
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
