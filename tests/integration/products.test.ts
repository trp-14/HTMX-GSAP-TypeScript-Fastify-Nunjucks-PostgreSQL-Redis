import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, scalar, signIn, type Agent, type TestContext } from '../helpers/testApp.js';

let ctx: TestContext;
let admin: Agent;
let operations: Agent;
let employee: Agent;
let categoryId: number;

beforeAll(async () => {
  ctx = await createTestApp();
  admin = await signIn(ctx.app, 'admin@arunika.co.id');
  operations = await signIn(ctx.app, 'bayu.santoso@arunika.co.id');
  employee = await signIn(ctx.app, 'wulan.sari@arunika.co.id');
  categoryId = await scalar<number>(ctx.db, `SELECT id FROM product_categories WHERE slug = 'peripherals'`);
});
afterAll(async () => ctx?.close());

const productBody = (overrides: Record<string, string> = {}) => ({
  sku: 'PER-MSE-ERG',
  name: 'Vertical Ergonomic Mouse',
  description: 'Reduces wrist strain for heavy spreadsheet users.',
  categoryId: String(categoryId),
  price: '450000',
  reorderThreshold: '5',
  status: 'ACTIVE',
  stockQuantity: '12',
  ...overrides,
});

async function productId(sku: string) {
  return scalar<string>(ctx.db, `SELECT id FROM products WHERE sku = $1`, [sku]);
}

describe('products', () => {
  it('creates a product, derives its inventory status and records opening stock', async () => {
    const res = await admin.request('POST', '/products', productBody());
    expect(res.statusCode).toBe(204);
    const row = (
      await ctx.db.query(`SELECT stock_quantity, inventory_status FROM products WHERE sku = 'PER-MSE-ERG'`)
    ).rows[0];
    expect(row).toEqual({ stock_quantity: 12, inventory_status: 'IN_STOCK' });
    expect(
      await scalar(
        ctx.db,
        `SELECT count(*)::int FROM inventory_movements m JOIN products p ON p.id = m.product_id WHERE p.sku = 'PER-MSE-ERG' AND m.movement_type = 'INITIAL'`,
      ),
    ).toBe(1);
    expect(
      await scalar(
        ctx.db,
        `SELECT count(*)::int FROM audit_logs WHERE action = 'PRODUCT_CREATED' AND entity_id = 'PER-MSE-ERG'`,
      ),
    ).toBe(1);
    expect(
      ctx.events.events.some((e) => e.type === 'product.created' && 'sku' in e && e.sku === 'PER-MSE-ERG'),
    ).toBe(true);
  });

  it('validates input and rejects duplicate SKUs', async () => {
    const bad = await admin.request(
      'POST',
      '/products',
      productBody({ sku: 'bad sku!', price: '-5', name: '' }),
    );
    expect(bad.statusCode).toBe(422);
    expect(bad.body).toContain('Price cannot be negative.');
    const dup = await admin.request('POST', '/products', productBody());
    expect(dup.statusCode).toBe(422);
    expect(dup.body).toContain('This SKU is already in use.');
  });

  it('forbids non-admins from managing the catalogue', async () => {
    expect(
      (await employee.request('POST', '/products', productBody({ sku: 'PER-NOPE-01' }))).statusCode,
    ).toBe(403);
    expect(
      (await operations.request('POST', '/products', productBody({ sku: 'PER-NOPE-02' }))).statusCode,
    ).toBe(403);
  });

  it('updates a product; changing the threshold re-derives the inventory status', async () => {
    const id = await productId('PER-MSE-ERG');
    const res = await admin.request('PUT', `/products/${id}`, {
      ...productBody({ reorderThreshold: '20', price: '475000' }),
    });
    expect(res.statusCode).toBe(204);
    const row = (await ctx.db.query(`SELECT price, inventory_status FROM products WHERE id = $1`, [id]))
      .rows[0];
    expect(row).toEqual({ price: 475000, inventory_status: 'LOW_STOCK' });
    expect(
      ctx.events.events.some((e) => e.type === 'inventory.low' && 'productId' in e && e.productId === id),
    ).toBe(true);
  });

  it('deletes a product without inventory history', async () => {
    await admin.request(
      'POST',
      '/products',
      productBody({ sku: 'PER-TMP-001', name: 'Temporary listing', stockQuantity: '0' }),
    );
    const id = await productId('PER-TMP-001');
    expect((await admin.request('DELETE', `/products/${id}`)).statusCode).toBe(204);
    expect(await scalar(ctx.db, `SELECT count(*)::int FROM products WHERE sku = 'PER-TMP-001'`)).toBe(0);
  });

  it('refuses to delete a product with movement history', async () => {
    const id = await productId('PRN-TN-760');
    expect((await admin.request('DELETE', `/products/${id}`)).statusCode).toBe(409);
  });
});

describe('inventory', () => {
  const stock = async (sku: string) =>
    (
      await ctx.db.query(`SELECT stock_quantity AS q, inventory_status AS s FROM products WHERE sku = $1`, [
        sku,
      ])
    ).rows[0] as { q: number; s: string };

  it('never lets quantity become negative', async () => {
    const id = await productId('PRN-TN-760');
    const before = await stock('PRN-TN-760');
    const res = await operations.request('POST', `/products/${id}/movements`, {
      type: 'ISSUE',
      quantity: String(before.q + 1),
    });
    expect(res.statusCode).toBe(422);
    expect(res.body).toContain(`Only ${before.q} unit(s) in stock`);
    expect(await stock('PRN-TN-760')).toEqual(before);
  });

  it('is also protected by a database constraint', async () => {
    await expect(
      ctx.db.query(`UPDATE products SET stock_quantity = -1 WHERE sku = 'PRN-TN-760'`),
    ).rejects.toThrow(/check constraint/);
  });

  it('walks 10 → 9 → 3 → 0 through IN_STOCK → LOW_STOCK → OUT_OF_STOCK with events and notifications', async () => {
    const id = await productId('PRN-TN-760');
    expect(await stock('PRN-TN-760')).toEqual({ q: 10, s: 'IN_STOCK' });
    ctx.events.events.length = 0;

    await operations.request('POST', `/products/${id}/movements`, {
      type: 'ISSUE',
      quantity: '1',
      reason: 'Issued for #1042',
    });
    expect(await stock('PRN-TN-760')).toEqual({ q: 9, s: 'IN_STOCK' });

    await operations.request('POST', `/products/${id}/movements`, { type: 'ISSUE', quantity: '6' });
    expect(await stock('PRN-TN-760')).toEqual({ q: 3, s: 'LOW_STOCK' });

    const res = await operations.request('POST', `/products/${id}/movements`, {
      type: 'ISSUE',
      quantity: '3',
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('data-status="OUT_OF_STOCK"');
    expect(await stock('PRN-TN-760')).toEqual({ q: 0, s: 'OUT_OF_STOCK' });

    const inv = ctx.events.events.filter((e) => e.type.startsWith('inventory.'));
    expect(inv.map((e) => e.type)).toEqual([
      'inventory.changed',
      'inventory.changed',
      'inventory.low',
      'inventory.changed',
      'inventory.out',
    ]);
    expect(inv[0]).toMatchObject({
      previousQuantity: 10,
      newQuantity: 9,
      previousStatus: 'IN_STOCK',
      newStatus: 'IN_STOCK',
    });
    expect(inv.at(-1)).toMatchObject({ previousQuantity: 3, newQuantity: 0, newStatus: 'OUT_OF_STOCK' });

    const movements = await ctx.db.query(
      `SELECT previous_quantity AS p, new_quantity AS n FROM inventory_movements WHERE product_id = $1 AND created_at > now() - interval '1 minute' ORDER BY id`,
      [id],
    );
    expect(movements.rows).toEqual([
      { p: 10, n: 9 },
      { p: 9, n: 3 },
      { p: 3, n: 0 },
    ]);
    expect(
      await scalar(
        ctx.db,
        `SELECT count(*)::int FROM notifications WHERE type = 'inventory.out' AND entity_id = 'PRN-TN-760' AND created_at > now() - interval '1 minute'`,
      ),
    ).toBeGreaterThan(0);
    expect(
      await scalar(
        ctx.db,
        `SELECT count(*)::int FROM audit_logs WHERE action = 'INVENTORY_CHANGED' AND entity_id = 'PRN-TN-760' AND created_at > now() - interval '1 minute'`,
      ),
    ).toBe(3);
  });

  it('only lets operations (or admins) record movements', async () => {
    const id = await productId('STA-A4-80');
    expect(
      (await employee.request('POST', `/products/${id}/movements`, { type: 'ISSUE', quantity: '1' }))
        .statusCode,
    ).toBe(403);
  });

  it('requires a reason for stock-count adjustments', async () => {
    const id = await productId('STA-A4-80');
    const res = await operations.request('POST', `/products/${id}/movements`, {
      type: 'ADJUSTMENT',
      quantity: '100',
    });
    expect(res.statusCode).toBe(422);
  });
});
