import type { Queryable } from '../db/pool.js';
import type { InventoryStatus, MovementType, ProductStatus } from '../inventory/rules.js';
import { offsetFor, toPage, type Page } from '../utils/pagination.js';

export type ProductCategory = {
  id: number;
  slug: string;
  name: string;
  description: string;
  art: string;
  hue: number;
};

export type ProductRecord = {
  id: string;
  sku: string;
  name: string;
  description: string;
  categoryId: number;
  categoryName: string;
  categorySlug: string;
  art: string;
  hue: number;
  price: number;
  stockQuantity: number;
  reorderThreshold: number;
  status: ProductStatus;
  inventoryStatus: InventoryStatus;
  imageKey: string | null;
  imageMime: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MovementRecord = {
  id: number;
  productId: string;
  productName: string;
  sku: string;
  actorName: string | null;
  movementType: MovementType;
  quantityDelta: number;
  previousQuantity: number;
  newQuantity: number;
  reason: string | null;
  createdAt: Date;
};

export type ProductFilters = {
  q?: string;
  categoryId?: number;
  status?: ProductStatus;
  inventoryStatus?: InventoryStatus;
};

export const PRODUCT_SORTS = {
  name: 'lower(p.name)',
  sku: 'p.sku',
  price: 'p.price',
  stock: 'p.stock_quantity',
  updated: 'p.updated_at',
  category: 'lower(c.name)',
} as const;
export type ProductSort = keyof typeof PRODUCT_SORTS;

const SELECT = `
  SELECT p.id, p.sku, p.name, p.description, p.category_id AS "categoryId", c.name AS "categoryName",
         c.slug AS "categorySlug", c.art, c.hue, p.price, p.stock_quantity AS "stockQuantity",
         p.reorder_threshold AS "reorderThreshold", p.status, p.inventory_status AS "inventoryStatus",
         p.image_key AS "imageKey", p.image_mime AS "imageMime", p.created_at AS "createdAt", p.updated_at AS "updatedAt"
  FROM products p JOIN product_categories c ON c.id = p.category_id`;

const SELECT_MOVEMENT = `
  SELECT m.id, m.product_id AS "productId", p.name AS "productName", p.sku, u.full_name AS "actorName",
         m.movement_type AS "movementType", m.quantity_delta AS "quantityDelta",
         m.previous_quantity AS "previousQuantity", m.new_quantity AS "newQuantity", m.reason, m.created_at AS "createdAt"
  FROM inventory_movements m JOIN products p ON p.id = m.product_id LEFT JOIN users u ON u.id = m.actor_id`;

export type ProductWrite = {
  sku: string;
  name: string;
  description: string;
  categoryId: number;
  price: number;
  reorderThreshold: number;
  status: ProductStatus;
};

export const productRepository = {
  async categories(db: Queryable): Promise<ProductCategory[]> {
    const { rows } = await db.query<ProductCategory>(
      `SELECT id, slug, name, description, art, hue FROM product_categories ORDER BY name`,
    );
    return rows;
  },

  async list(
    db: Queryable,
    f: ProductFilters,
    sort: ProductSort,
    dir: 'asc' | 'desc',
    page: number,
    pageSize: number,
  ): Promise<Page<ProductRecord>> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (f.q) {
      params.push(`%${f.q.trim().replace(/[%_\\]/g, '\\$&')}%`);
      where.push(
        `(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR p.description ILIKE $${params.length})`,
      );
    }
    if (f.categoryId) {
      params.push(f.categoryId);
      where.push(`p.category_id = $${params.length}`);
    }
    if (f.status) {
      params.push(f.status);
      where.push(`p.status = $${params.length}`);
    }
    if (f.inventoryStatus) {
      params.push(f.inventoryStatus);
      where.push(`p.inventory_status = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (
      await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM products p ${whereSql}`, params)
    ).rows[0]!.n;
    const order = `${PRODUCT_SORTS[sort]} ${dir === 'asc' ? 'ASC' : 'DESC'}, p.sku`;
    const { rows } = await db.query<ProductRecord>(
      `${SELECT} ${whereSql} ORDER BY ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offsetFor(page, pageSize)],
    );
    return toPage(rows, total, page, pageSize);
  },

  async findById(db: Queryable, id: string): Promise<ProductRecord | null> {
    const { rows } = await db.query<ProductRecord>(`${SELECT} WHERE p.id = $1`, [id]);
    return rows[0] ?? null;
  },

  async lockById(db: Queryable, id: string): Promise<ProductRecord | null> {
    await db.query(`SELECT 1 FROM products WHERE id = $1 FOR UPDATE`, [id]);
    return this.findById(db, id);
  },

  async skuTaken(db: Queryable, sku: string, exceptId?: string): Promise<boolean> {
    const { rowCount } = await db.query(`SELECT 1 FROM products WHERE sku = $1 AND id IS DISTINCT FROM $2`, [
      sku,
      exceptId ?? null,
    ]);
    return (rowCount ?? 0) > 0;
  },

  async insert(
    db: Queryable,
    p: ProductWrite & { stockQuantity: number; inventoryStatus: InventoryStatus; imageKey: string | null },
  ): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO products (sku, name, description, category_id, price, stock_quantity, reorder_threshold, status,
                             inventory_status, image_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        p.sku,
        p.name,
        p.description,
        p.categoryId,
        p.price,
        p.stockQuantity,
        p.reorderThreshold,
        p.status,
        p.inventoryStatus,
        p.imageKey,
      ],
    );
    return rows[0]!.id;
  },

  async update(
    db: Queryable,
    id: string,
    p: ProductWrite & { inventoryStatus: InventoryStatus },
  ): Promise<void> {
    await db.query(
      `UPDATE products SET sku = $2, name = $3, description = $4, category_id = $5, price = $6,
              reorder_threshold = $7, status = $8, inventory_status = $9, updated_at = now()
       WHERE id = $1`,
      [
        id,
        p.sku,
        p.name,
        p.description,
        p.categoryId,
        p.price,
        p.reorderThreshold,
        p.status,
        p.inventoryStatus,
      ],
    );
  },

  async setImage(db: Queryable, id: string, imageKey: string | null, mime: string | null): Promise<void> {
    await db.query(`UPDATE products SET image_key = $2, image_mime = $3, updated_at = now() WHERE id = $1`, [
      id,
      imageKey,
      mime,
    ]);
  },

  async setStock(db: Queryable, id: string, quantity: number, status: InventoryStatus): Promise<void> {
    await db.query(
      `UPDATE products SET stock_quantity = $2, inventory_status = $3, updated_at = now() WHERE id = $1`,
      [id, quantity, status],
    );
  },

  async delete(db: Queryable, id: string): Promise<void> {
    await db.query(`DELETE FROM products WHERE id = $1`, [id]);
  },

  async insertMovement(
    db: Queryable,
    m: {
      productId: string;
      actorId: string | null;
      type: MovementType;
      delta: number;
      previousQuantity: number;
      newQuantity: number;
      reason: string | null;
    },
  ): Promise<number> {
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO inventory_movements (product_id, actor_id, movement_type, quantity_delta, previous_quantity, new_quantity, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [m.productId, m.actorId, m.type, m.delta, m.previousQuantity, m.newQuantity, m.reason],
    );
    return rows[0]!.id;
  },

  async movements(db: Queryable, productId: string, limit = 20): Promise<MovementRecord[]> {
    const { rows } = await db.query<MovementRecord>(
      `${SELECT_MOVEMENT} WHERE m.product_id = $1 ORDER BY m.created_at DESC, m.id DESC LIMIT $2`,
      [productId, limit],
    );
    return rows;
  },

  async movementById(db: Queryable, id: number): Promise<MovementRecord | null> {
    const { rows } = await db.query<MovementRecord>(`${SELECT_MOVEMENT} WHERE m.id = $1`, [id]);
    return rows[0] ?? null;
  },

  async recentMovements(db: Queryable, limit = 10): Promise<MovementRecord[]> {
    const { rows } = await db.query<MovementRecord>(
      `${SELECT_MOVEMENT} ORDER BY m.created_at DESC, m.id DESC LIMIT $1`,
      [limit],
    );
    return rows;
  },

  async movementsAfter(db: Queryable, afterId: number, limit = 10): Promise<MovementRecord[]> {
    const { rows } = await db.query<MovementRecord>(
      `${SELECT_MOVEMENT} WHERE m.id > $1 ORDER BY m.id DESC LIMIT $2`,
      [afterId, limit],
    );
    return rows;
  },

  async attention(db: Queryable, limit = 12): Promise<ProductRecord[]> {
    const { rows } = await db.query<ProductRecord>(
      `${SELECT} WHERE p.inventory_status <> 'IN_STOCK' AND p.status = 'ACTIVE'
       ORDER BY (p.inventory_status = 'OUT_OF_STOCK') DESC, p.stock_quantity::float / GREATEST(p.reorder_threshold, 1), p.name
       LIMIT $1`,
      [limit],
    );
    return rows;
  },

  async inventoryCounts(
    db: Queryable,
  ): Promise<{ total: number; inStock: number; lowStock: number; outOfStock: number; stockValue: number }> {
    const { rows } = await db.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE inventory_status = 'IN_STOCK' AND status = 'ACTIVE')::int AS "inStock",
              count(*) FILTER (WHERE inventory_status = 'LOW_STOCK' AND status = 'ACTIVE')::int AS "lowStock",
              count(*) FILTER (WHERE inventory_status = 'OUT_OF_STOCK' AND status = 'ACTIVE')::int AS "outOfStock",
              COALESCE(sum(price * stock_quantity), 0)::float AS "stockValue"
       FROM products`,
    );
    return rows[0];
  },
};
