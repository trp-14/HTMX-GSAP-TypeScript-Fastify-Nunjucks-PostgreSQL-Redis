import type { Readable } from 'node:stream';
import { z } from 'zod';
import type { Queryable } from '../db/pool.js';
import { withTransaction } from '../db/transaction.js';
import { createEvent, type FlowDeskEvent } from '../events/types.js';
import {
  applyMovement,
  INVENTORY_STATUSES,
  inventoryStatusFor,
  InventoryError,
  MOVEMENT_TYPES,
  PRODUCT_STATUSES,
  type InventoryStatus,
  type StockChange,
} from '../inventory/rules.js';
import { NotificationService } from '../notifications/notificationService.js';
import { RATE_LIMITS } from '../redis/rateLimiter.js';
import {
  PRODUCT_SORTS,
  productRepository,
  type ProductRecord,
  type ProductSort,
} from '../repositories/productRepository.js';
import { userRepository } from '../repositories/userRepository.js';
import { parse } from '../schemas/validate.js';
import { conflict, forbidden, notFound, tooManyRequests, validationError } from '../utils/errors.js';
import { IMAGE_KINDS, sanitizeFilename } from '../utils/files.js';
import { AuditService } from './auditService.js';
import type { FileStorage } from './fileStorage.js';
import type { SettingsService } from './settingsService.js';
import type { Actor, ServiceDeps } from './types.js';

const ProductSchema = z.object({
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9-]{2,31}$/, 'Use 3–32 letters, digits or dashes (e.g. IT-LAP-014).'),
  name: z.string().trim().min(2, 'Enter a product name.').max(120),
  description: z.string().trim().max(4000).default(''),
  categoryId: z.coerce
    .number({ invalid_type_error: 'Choose a category.' })
    .int()
    .positive('Choose a category.'),
  price: z.coerce
    .number({ invalid_type_error: 'Enter a price.' })
    .min(0, 'Price cannot be negative.')
    .max(999_999_999_999, 'Price is too large.')
    .transform((v) => Math.round(v * 100) / 100),
  reorderThreshold: z.coerce
    .number({ invalid_type_error: 'Enter a threshold.' })
    .int('Use a whole number.')
    .min(0, 'Cannot be negative.')
    .max(100_000),
  status: z.enum(PRODUCT_STATUSES, { errorMap: () => ({ message: 'Choose a status.' }) }),
});

const CreateProductSchema = ProductSchema.extend({
  stockQuantity: z.coerce
    .number({ invalid_type_error: 'Enter the opening stock.' })
    .int('Use a whole number.')
    .min(0, 'Stock cannot be negative.')
    .max(1_000_000),
});

export const MovementSchema = z.object({
  type: z.enum(MOVEMENT_TYPES, { errorMap: () => ({ message: 'Choose a movement type.' }) }),
  quantity: z.coerce
    .number({ invalid_type_error: 'Enter a quantity.' })
    .int('Use a whole number.')
    .min(0, 'Quantity cannot be negative.'),
  reason: z
    .string()
    .trim()
    .max(240, 'Keep the reason under 240 characters.')
    .optional()
    .transform((v) => v || null),
});

export const ProductListQuerySchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  category: z.coerce.number().int().positive().optional().catch(undefined),
  status: z.enum(PRODUCT_STATUSES).optional().catch(undefined),
  stock: z.enum(INVENTORY_STATUSES).optional().catch(undefined),
  sort: z
    .string()
    .optional()
    .transform((v): ProductSort => (v && v in PRODUCT_SORTS ? (v as ProductSort) : 'name')),
  dir: z.enum(['asc', 'desc']).optional().catch(undefined),
  page: z.coerce.number().int().min(1).optional().catch(undefined),
  view: z.enum(['grid', 'table']).optional().catch(undefined),
});
export type ProductListQuery = z.output<typeof ProductListQuerySchema>;

const uuid = z.string().uuid();

function snapshot(p: ProductRecord) {
  return {
    sku: p.sku,
    name: p.name,
    categoryId: p.categoryId,
    price: p.price,
    reorderThreshold: p.reorderThreshold,
    status: p.status,
    stockQuantity: p.stockQuantity,
    inventoryStatus: p.inventoryStatus,
  };
}

const productRef = (p: ProductRecord) => ({ productId: p.id, sku: p.sku, name: p.name });

/**
 * Products and inventory. Stock only ever changes through `adjustStock`, which locks the row,
 * applies the inventory rules, records the movement, audits, notifies and publishes events.
 */
export class ProductService {
  constructor(
    private readonly deps: ServiceDeps,
    private readonly settings: SettingsService,
    private readonly storage: FileStorage,
  ) {}

  categories() {
    return this.deps.cache.getOrSet('product-categories', 3600, () =>
      productRepository.categories(this.deps.db),
    );
  }

  list(actor: Actor, query: ProductListQuery) {
    if (!actor.permissions.has('product:read')) throw forbidden();
    return productRepository.list(
      this.deps.db,
      { q: query.q, categoryId: query.category, status: query.status, inventoryStatus: query.stock },
      query.sort,
      query.dir ?? (query.sort === 'updated' ? 'desc' : 'asc'),
      query.page ?? 1,
      query.view === 'table' ? 15 : 12,
    );
  }

  async get(actor: Actor, id: string): Promise<ProductRecord> {
    if (!actor.permissions.has('product:read')) throw forbidden();
    const p = uuid.safeParse(id).success ? await productRepository.findById(this.deps.db, id) : null;
    if (!p) throw notFound('Product');
    return p;
  }

  async detail(actor: Actor, id: string) {
    const product = await this.get(actor, id);
    const movements = await productRepository.movements(this.deps.db, id, 15);
    return { product, movements };
  }

  movements(id: string, limit = 15) {
    return productRepository.movements(this.deps.db, id, limit);
  }

  async create(actor: Actor, input: unknown): Promise<ProductRecord> {
    if (!actor.permissions.has('product:manage')) throw forbidden();
    const data = parse(CreateProductSchema, input);
    await this.assertCategory(data.categoryId);
    const events: FlowDeskEvent[] = [];
    const product = await withTransaction(this.deps.db, async (tx) => {
      if (await productRepository.skuTaken(tx, data.sku))
        throw validationError({ sku: 'This SKU is already in use.' });
      const inventoryStatus = inventoryStatusFor(data.stockQuantity, data.reorderThreshold);
      const id = await productRepository.insert(tx, { ...data, inventoryStatus, imageKey: null });
      if (data.stockQuantity > 0) {
        await productRepository.insertMovement(tx, {
          productId: id,
          actorId: actor.id,
          type: 'INITIAL',
          delta: data.stockQuantity,
          previousQuantity: 0,
          newQuantity: data.stockQuantity,
          reason: 'Opening stock',
        });
      }
      const p = (await productRepository.findById(tx, id))!;
      await AuditService.record(tx, {
        actorId: actor.id,
        action: 'PRODUCT_CREATED',
        entityType: 'product',
        entityId: p.sku,
        newState: snapshot(p),
        ip: actor.ip,
      });
      const recipients = await userRepository.idsWithRoles(tx, ['OPERATIONS', 'ADMIN']);
      events.push(
        createEvent({
          type: 'product.created',
          entityId: p.id,
          actorId: actor.id,
          audience: { kind: 'all' },
          ...productRef(p),
        }),
        ...(await NotificationService.create(
          tx,
          recipients.map((userId) => ({
            userId,
            type: 'product.created',
            title: `New product: ${p.name}`,
            body: `${actor.fullName} added ${p.sku} to ${p.categoryName} with ${p.stockQuantity} in stock.`,
            link: `/products/${p.id}`,
            entityType: 'product',
            entityId: p.sku,
          })),
          actor.id,
        )),
      );
      return p;
    });
    await this.deps.publisher.publishAll(events);
    this.deps.log.info({ sku: product.sku, actorId: actor.id }, 'product created');
    return product;
  }

  async update(actor: Actor, id: string, input: unknown): Promise<ProductRecord> {
    if (!actor.permissions.has('product:manage')) throw forbidden();
    const data = parse(ProductSchema, input);
    await this.assertCategory(data.categoryId);
    const events: FlowDeskEvent[] = [];
    const product = await withTransaction(this.deps.db, async (tx) => {
      const before = uuid.safeParse(id).success ? await productRepository.lockById(tx, id) : null;
      if (!before) throw notFound('Product');
      if (await productRepository.skuTaken(tx, data.sku, id))
        throw validationError({ sku: 'This SKU is already in use.' });
      // Changing the reorder threshold can move the product between inventory bands.
      const inventoryStatus = inventoryStatusFor(before.stockQuantity, data.reorderThreshold);
      await productRepository.update(tx, id, { ...data, inventoryStatus });
      const after = (await productRepository.findById(tx, id))!;
      await AuditService.record(tx, {
        actorId: actor.id,
        action: 'PRODUCT_UPDATED',
        entityType: 'product',
        entityId: after.sku,
        previousState: snapshot(before),
        newState: snapshot(after),
        ip: actor.ip,
      });
      const recipients = await userRepository.idsWithRoles(tx, ['OPERATIONS']);
      events.push(
        createEvent({
          type: 'product.updated',
          entityId: after.id,
          actorId: actor.id,
          audience: { kind: 'all' },
          ...productRef(after),
        }),
        ...(await NotificationService.create(
          tx,
          recipients.map((userId) => ({
            userId,
            type: 'product.updated',
            title: `${after.name} was updated`,
            body: `${actor.fullName} updated the product details for ${after.sku}.`,
            link: `/products/${after.id}`,
            entityType: 'product',
            entityId: after.sku,
          })),
          actor.id,
        )),
      );
      if (before.inventoryStatus !== after.inventoryStatus) {
        events.push(
          ...(await this.stockEvents(
            tx,
            actor,
            after,
            before.inventoryStatus,
            before.stockQuantity,
            'ADJUSTMENT',
          )),
        );
      }
      return after;
    });
    await this.deps.publisher.publishAll(events);
    return product;
  }

  async remove(actor: Actor, id: string): Promise<void> {
    if (!actor.permissions.has('product:manage')) throw forbidden();
    const events: FlowDeskEvent[] = [];
    const imageKey = await withTransaction(this.deps.db, async (tx) => {
      const p = uuid.safeParse(id).success ? await productRepository.lockById(tx, id) : null;
      if (!p) throw notFound('Product');
      const history = await productRepository.movements(tx, id, 50);
      if (history.some((m) => m.movementType !== 'INITIAL')) {
        throw conflict('This product has inventory history. Mark it as discontinued instead of deleting it.');
      }
      await productRepository.delete(tx, id);
      await AuditService.record(tx, {
        actorId: actor.id,
        action: 'PRODUCT_DELETED',
        entityType: 'product',
        entityId: p.sku,
        previousState: snapshot(p),
        ip: actor.ip,
      });
      events.push(
        createEvent({
          type: 'product.deleted',
          entityId: p.id,
          actorId: actor.id,
          audience: { kind: 'all' },
          ...productRef(p),
        }),
      );
      return p.imageKey;
    });
    if (imageKey) await this.storage.remove('products', imageKey);
    await this.deps.publisher.publishAll(events);
  }

  async setImage(
    actor: Actor,
    id: string,
    file: { filename: string; stream: Readable & { truncated?: boolean } } | null,
  ) {
    if (!actor.permissions.has('product:manage')) throw forbidden();
    const before = await this.get(actor, id);
    if (!file?.filename) throw validationError({ file: 'Choose an image.' });
    const stored = await this.storage.save(
      'products',
      sanitizeFilename(file.filename),
      file.stream,
      IMAGE_KINDS,
      3 * 1024 * 1024,
    );
    await withTransaction(this.deps.db, async (tx) => {
      await productRepository.setImage(tx, id, stored.storageKey, stored.mime);
      await AuditService.record(tx, {
        actorId: actor.id,
        action: 'PRODUCT_UPDATED',
        entityType: 'product',
        entityId: before.sku,
        metadata: { field: 'image', size: stored.sizeBytes },
        ip: actor.ip,
      });
    });
    if (before.imageKey) await this.storage.remove('products', before.imageKey);
    const after = await this.get(actor, id);
    await this.deps.publisher.publish(
      createEvent({
        type: 'product.updated',
        entityId: after.id,
        actorId: actor.id,
        audience: { kind: 'all' },
        ...productRef(after),
      }),
    );
    return after;
  }

  async openImage(actor: Actor, id: string) {
    const p = await this.get(actor, id);
    if (!p.imageKey || !p.imageMime) throw notFound('Image');
    return { ...(await this.storage.open('products', p.imageKey)), mime: p.imageMime };
  }

  /**
   * Records an inventory movement:
   *   validate → lock row → apply rules (never negative) → update stock + status → movement row
   *   → audit → notifications → commit → publish inventory.changed (+ inventory.low / inventory.out).
   */
  async adjustStock(
    actor: Actor,
    id: string,
    input: unknown,
  ): Promise<{ product: ProductRecord; change: StockChange; movementId: number }> {
    if (!actor.permissions.has('inventory:adjust')) throw forbidden();
    const limit = await this.deps.rateLimiter.hit(RATE_LIMITS.inventory, actor.id);
    if (!limit.allowed) throw tooManyRequests(limit.retryAfterSeconds);
    const movement = parse(MovementSchema, input);
    if (movement.type === 'ADJUSTMENT' && !movement.reason) {
      throw validationError({ reason: 'Stock-count adjustments need a reason.' });
    }

    const events: FlowDeskEvent[] = [];
    const result = await withTransaction(this.deps.db, async (tx) => {
      const before = uuid.safeParse(id).success ? await productRepository.lockById(tx, id) : null;
      if (!before) throw notFound('Product');
      if (before.status === 'DISCONTINUED' && movement.type === 'RECEIPT') {
        throw conflict('Discontinued products cannot receive new stock.');
      }
      let change: StockChange;
      try {
        change = applyMovement(
          { quantity: before.stockQuantity, reorderThreshold: before.reorderThreshold },
          movement,
        );
      } catch (err) {
        if (err instanceof InventoryError) throw validationError({ quantity: err.message }, err.message);
        throw err;
      }
      await productRepository.setStock(tx, id, change.newQuantity, change.newStatus);
      const movementId = await productRepository.insertMovement(tx, {
        productId: id,
        actorId: actor.id,
        type: movement.type,
        delta: change.delta,
        previousQuantity: change.previousQuantity,
        newQuantity: change.newQuantity,
        reason: movement.reason,
      });
      const after = (await productRepository.findById(tx, id))!;
      await AuditService.record(tx, {
        actorId: actor.id,
        action: 'INVENTORY_CHANGED',
        entityType: 'product',
        entityId: after.sku,
        previousState: { stockQuantity: change.previousQuantity, inventoryStatus: change.previousStatus },
        newState: { stockQuantity: change.newQuantity, inventoryStatus: change.newStatus },
        metadata: {
          movementType: movement.type,
          delta: change.delta,
          reason: movement.reason,
          name: after.name,
        },
        ip: actor.ip,
      });
      events.push(
        ...(await this.stockEvents(
          tx,
          actor,
          after,
          change.previousStatus,
          change.previousQuantity,
          movement.type,
        )),
      );
      return { product: after, change, movementId };
    });
    await this.deps.publisher.publishAll(events);
    this.deps.log.info(
      {
        sku: result.product.sku,
        from: result.change.previousQuantity,
        to: result.change.newQuantity,
        status: result.change.newStatus,
      },
      'inventory changed',
    );
    return result;
  }

  /** Builds inventory events plus threshold notifications for a committed stock/status change. */
  private async stockEvents(
    tx: Queryable,
    actor: Actor,
    p: ProductRecord,
    previousStatus: InventoryStatus,
    previousQuantity: number,
    movementType: (typeof MOVEMENT_TYPES)[number],
  ): Promise<FlowDeskEvent[]> {
    const payload = {
      entityId: p.id,
      actorId: actor.id,
      audience: { kind: 'all' } as const,
      ...productRef(p),
      movementType,
      previousQuantity,
      newQuantity: p.stockQuantity,
      reorderThreshold: p.reorderThreshold,
      previousStatus,
      newStatus: p.inventoryStatus,
    };
    const events: FlowDeskEvent[] = [createEvent({ type: 'inventory.changed', ...payload })];
    const severity = { IN_STOCK: 0, LOW_STOCK: 1, OUT_OF_STOCK: 2 } as const;
    if (severity[p.inventoryStatus] > severity[previousStatus]) {
      const out = p.inventoryStatus === 'OUT_OF_STOCK';
      events.push(createEvent({ type: out ? 'inventory.out' : 'inventory.low', ...payload }));
      const settings = await this.settings.get();
      if (settings.lowStockNotifications) {
        const recipients = await userRepository.idsWithRoles(tx, ['OPERATIONS', 'ADMIN']);
        events.push(
          ...(await NotificationService.create(
            tx,
            recipients.map((userId) => ({
              userId,
              type: out ? 'inventory.out' : 'inventory.low',
              title: out ? `${p.name} is out of stock` : `${p.name} is running low`,
              body: out
                ? `${p.sku} has no units left. Reorder threshold is ${p.reorderThreshold}.`
                : `${p.sku} is down to ${p.stockQuantity} unit(s) — at or below the reorder threshold of ${p.reorderThreshold}.`,
              link: `/products/${p.id}`,
              entityType: 'product',
              entityId: p.sku,
            })),
            null,
          )),
        );
      }
    }
    return events;
  }

  private async assertCategory(categoryId: number) {
    const categories = await this.categories();
    if (!categories.some((c) => c.id === categoryId))
      throw validationError({ categoryId: 'Choose a category.' });
  }
}
