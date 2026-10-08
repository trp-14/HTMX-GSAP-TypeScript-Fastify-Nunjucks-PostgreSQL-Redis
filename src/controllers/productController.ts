import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Container } from '../container.js';
import { actorOf } from '../auth/plugin.js';
import { redirect, toast, trigger, wantsFragment } from '../middleware/htmx.js';
import { INVENTORY_STATUSES, MOVEMENT_TYPES, PRODUCT_STATUSES } from '../inventory/rules.js';
import { ProductListQuerySchema } from '../services/productService.js';
import { AppError } from '../utils/errors.js';

type IdParams = { Params: { id: string } };
type Body = { Body: Record<string, unknown> };

const label = (s: string) =>
  s
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
const STATUS_OPTIONS = PRODUCT_STATUSES.map((s) => ({ value: s, label: label(s) }));
const STOCK_OPTIONS = INVENTORY_STATUSES.map((s) => ({ value: s, label: label(s) }));
const MOVEMENT_OPTIONS = MOVEMENT_TYPES.map((m) => ({
  value: m,
  label: { RECEIPT: 'Receipt (+)', ISSUE: 'Issue (−)', RETURN: 'Return (+)', ADJUSTMENT: 'Stock count (=)' }[
    m
  ],
}));

export function productController(c: Container) {
  const { products } = c.services;

  async function formOptions() {
    const categories = await products.categories();
    return {
      categoryOptions: categories.map((x) => ({ value: x.id, label: x.name })),
      statusOptions: STATUS_OPTIONS,
    };
  }

  async function stockFragment(
    req: FastifyRequest,
    reply: FastifyReply,
    id: string,
    extra: Record<string, unknown> = {},
  ) {
    const actor = actorOf(req);
    const { product, movements } = await products.detail(actor, id);
    return reply.render('partials/products/stock-refresh.njk', {
      product,
      movements,
      movementOptions: MOVEMENT_OPTIONS,
      ...extra,
    });
  }

  return {
    async list(req: FastifyRequest<{ Querystring: Record<string, string> }>, reply: FastifyReply) {
      const actor = actorOf(req);
      const query = ProductListQuerySchema.parse(req.query);
      const page = await products.list(actor, query);
      const ctx = {
        page,
        view: query.view ?? 'grid',
        query: { ...req.query, sort: query.sort, dir: query.dir ?? 'asc' },
      };
      if (wantsFragment(req, 'product-results')) return reply.render('partials/products/results.njk', ctx);
      const categories = await products.categories();
      return reply.render('pages/products/index.njk', {
        ...ctx,
        categoryOptions: categories.map((x) => ({ value: x.id, label: x.name })),
        statusOptions: STATUS_OPTIONS,
        stockOptions: STOCK_OPTIONS,
      });
    },

    async show(req: FastifyRequest<IdParams>, reply: FastifyReply) {
      const actor = actorOf(req);
      const { product, movements } = await products.detail(actor, req.params.id);
      return reply.render('pages/products/show.njk', {
        product,
        movements,
        movementOptions: MOVEMENT_OPTIONS,
      });
    },

    async stock(req: FastifyRequest<IdParams>, reply: FastifyReply) {
      return stockFragment(req, reply, req.params.id);
    },

    async newForm(_req: FastifyRequest, reply: FastifyReply) {
      return reply.render('pages/products/new.njk', {
        values: { status: 'ACTIVE', reorderThreshold: 10, stockQuantity: 0 },
        ...(await formOptions()),
      });
    },

    async create(req: FastifyRequest<Body>, reply: FastifyReply) {
      try {
        const p = await products.create(actorOf(req), req.body ?? {});
        await c.deps.sessions.setFlash(req.session!.id, { type: 'success', message: `${p.name} created.` });
        return redirect(req, reply, `/products/${p.id}`);
      } catch (err) {
        if (err instanceof AppError && err.statusCode === 422) {
          return reply.code(422).render('pages/products/new.njk', {
            values: req.body,
            errors: err.fields,
            ...(await formOptions()),
          });
        }
        throw err;
      }
    },

    async editForm(req: FastifyRequest<IdParams>, reply: FastifyReply) {
      const p = await products.get(actorOf(req), req.params.id);
      return reply.render('pages/products/edit.njk', { product: p, values: p, ...(await formOptions()) });
    },

    async update(req: FastifyRequest<IdParams & Body>, reply: FastifyReply) {
      const actor = actorOf(req);
      try {
        const p = await products.update(actor, req.params.id, req.body ?? {});
        await c.deps.sessions.setFlash(req.session!.id, { type: 'success', message: `${p.name} updated.` });
        return redirect(req, reply, `/products/${p.id}`);
      } catch (err) {
        if (err instanceof AppError && err.statusCode === 422) {
          const p = await products.get(actor, req.params.id);
          return reply.code(422).render('pages/products/edit.njk', {
            product: p,
            values: { ...p, ...req.body },
            errors: err.fields,
            ...(await formOptions()),
          });
        }
        throw err;
      }
    },

    async remove(req: FastifyRequest<IdParams>, reply: FastifyReply) {
      const actor = actorOf(req);
      const p = await products.get(actor, req.params.id);
      await products.remove(actor, req.params.id);
      await c.deps.sessions.setFlash(req.session!.id, { type: 'success', message: `${p.name} deleted.` });
      return redirect(req, reply, '/products');
    },

    async adjust(req: FastifyRequest<IdParams & Body>, reply: FastifyReply) {
      const actor = actorOf(req);
      try {
        const { product, change } = await products.adjustStock(actor, req.params.id, req.body ?? {});
        const alert =
          change.alert === 'OUT_OF_STOCK'
            ? { type: 'error' as const, message: `${product.name} is now out of stock.` }
            : change.alert === 'LOW_STOCK'
              ? {
                  type: 'warning' as const,
                  message: `${product.name} dropped to ${change.newQuantity} — below its reorder threshold.`,
                }
              : {
                  type: 'success' as const,
                  message: `Stock updated: ${change.previousQuantity} → ${change.newQuantity}.`,
                };
        toast(reply, alert);
        trigger(reply, { 'fd:stock-adjusted': { productId: product.id } });
        return stockFragment(req, reply, product.id);
      } catch (err) {
        if (err instanceof AppError && err.statusCode === 422) {
          const { product, movements } = await products.detail(actor, req.params.id);
          return reply.code(422).render('partials/products/stock-refresh.njk', {
            product,
            movements,
            movementOptions: MOVEMENT_OPTIONS,
            errors: err.fields,
            values: req.body,
          });
        }
        throw err;
      }
    },

    async image(req: FastifyRequest<IdParams>, reply: FastifyReply) {
      const { stream, size, mime } = await products.openImage(actorOf(req), req.params.id);
      return reply
        .header('Content-Length', size)
        .header('Cache-Control', 'private, max-age=300')
        .header('X-Content-Type-Options', 'nosniff')
        .type(mime)
        .send(stream);
    },

    async uploadImage(req: FastifyRequest<IdParams>, reply: FastifyReply) {
      const file = await req.file();
      try {
        const p = await products.setImage(
          actorOf(req),
          req.params.id,
          file ? { filename: file.filename, stream: file.file } : null,
        );
        toast(reply, { type: 'success', message: 'Product image updated.' });
        return reply.render('partials/products/image.njk', { product: p });
      } catch (err) {
        if (file) file.file.resume();
        if (err instanceof AppError && err.statusCode === 422) {
          reply.header('X-Error-Message', encodeURIComponent(err.fields?.file ?? err.message));
          return reply.code(400).send('');
        }
        throw err;
      }
    },
  };
}
