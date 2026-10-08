import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Container } from '../container.js';
import { actorOf } from '../auth/plugin.js';
import { redirect, toast, trigger, wantsFragment } from '../middleware/htmx.js';
import { PRIORITIES } from '../repositories/requestRepository.js';
import { RequestListQuerySchema } from '../services/requestService.js';
import { AppError, notFound } from '../utils/errors.js';
import { ACCEPT_ATTRIBUTE, contentDisposition } from '../utils/files.js';
import { REQUEST_STATUSES, STATUS_META, TRANSITION_RULES } from '../workflow/definition.js';

type NumberParams = { Params: { number: string } };
type Body = { Body: Record<string, unknown> };

function requestNumber(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 99_999_999) throw notFound('Request');
  return n;
}

const PRIORITY_OPTIONS = PRIORITIES.map((p) => ({ value: p, label: p[0] + p.slice(1).toLowerCase() }));
const STATUS_OPTIONS = REQUEST_STATUSES.map((s) => ({ value: s, label: STATUS_META[s].label }));

export function requestController(c: Container) {
  const { requests, attachments, users } = c.services;

  async function formOptions() {
    const types = await requests.types();
    return {
      typeOptions: types.map((t) => ({ value: t.id, label: t.name })),
      types,
      priorityOptions: PRIORITY_OPTIONS,
    };
  }

  async function renderDetail(
    req: FastifyRequest,
    reply: FastifyReply,
    n: number,
    template: string,
    extra: Record<string, unknown> = {},
  ) {
    const actor = actorOf(req);
    const detail = await requests.detail(actor, n);
    return reply.render(template, { ...detail, acceptTypes: ACCEPT_ATTRIBUTE, ...extra });
  }

  return {
    async list(req: FastifyRequest<{ Querystring: Record<string, string> }>, reply: FastifyReply) {
      const actor = actorOf(req);
      const query = RequestListQuerySchema.parse(req.query);
      const page = await requests.list(actor, query);
      const ctx = { page, query: { ...req.query, sort: query.sort, dir: query.dir ?? 'desc' } };
      if (wantsFragment(req, 'request-results')) return reply.render('partials/requests/results.njk', ctx);
      const [types, departments] = await Promise.all([requests.types(), users.departments()]);
      return reply.render('pages/requests/index.njk', {
        ...ctx,
        typeOptions: types.map((t) => ({ value: t.id, label: t.name })),
        departmentOptions: departments.map((d) => ({ value: d.id, label: d.name })),
        statusOptions: STATUS_OPTIONS,
        priorityOptions: PRIORITY_OPTIONS,
      });
    },

    async newForm(req: FastifyRequest, reply: FastifyReply) {
      return reply.render('pages/requests/new.njk', {
        values: { priority: 'MEDIUM' },
        ...(await formOptions()),
      });
    },

    async create(req: FastifyRequest<Body>, reply: FastifyReply) {
      const actor = actorOf(req);
      const body = req.body ?? {};
      try {
        const r = await requests.create(actor, body, { submit: body.intent === 'submit' });
        await c.deps.sessions.setFlash(req.session!.id, {
          type: 'success',
          message:
            body.intent === 'submit'
              ? `Request #${r.requestNumber} submitted for review.`
              : `Draft #${r.requestNumber} saved.`,
        });
        return redirect(req, reply, `/requests/${r.requestNumber}`);
      } catch (err) {
        if (err instanceof AppError && err.statusCode === 422) {
          return reply
            .code(422)
            .render('pages/requests/new.njk', { values: body, errors: err.fields, ...(await formOptions()) });
        }
        throw err;
      }
    },

    async show(req: FastifyRequest<NumberParams>, reply: FastifyReply) {
      return renderDetail(req, reply, requestNumber(req.params.number), 'pages/requests/show.njk');
    },

    /** Re-renders the workflow panel (plus out-of-band status/timeline) — used after live updates. */
    async workflowFragment(req: FastifyRequest<NumberParams>, reply: FastifyReply) {
      return renderDetail(req, reply, requestNumber(req.params.number), 'partials/workflow/refresh.njk');
    },

    async editForm(req: FastifyRequest<NumberParams>, reply: FastifyReply) {
      const actor = actorOf(req);
      const r = await requests.getVisible(actor, requestNumber(req.params.number));
      if (!requests.canEdit(actor, r))
        throw new AppError(403, 'FORBIDDEN', 'This request can no longer be edited.');
      return reply.render('pages/requests/edit.njk', { request: r, values: r, ...(await formOptions()) });
    },

    async update(req: FastifyRequest<NumberParams & Body>, reply: FastifyReply) {
      const actor = actorOf(req);
      const n = requestNumber(req.params.number);
      try {
        await requests.update(actor, n, req.body ?? {});
        await c.deps.sessions.setFlash(req.session!.id, {
          type: 'success',
          message: `Request #${n} updated.`,
        });
        return redirect(req, reply, `/requests/${n}`);
      } catch (err) {
        if (err instanceof AppError && err.statusCode === 422) {
          const r = await requests.getVisible(actor, n);
          return reply.code(422).render('pages/requests/edit.njk', {
            request: r,
            values: req.body,
            errors: err.fields,
            ...(await formOptions()),
          });
        }
        throw err;
      }
    },

    async remove(
      req: FastifyRequest<NumberParams & { Querystring: { from?: string } }>,
      reply: FastifyReply,
    ) {
      const actor = actorOf(req);
      const n = requestNumber(req.params.number);
      const keys = await requests.remove(actor, n);
      await attachments.purgeFiles(keys);
      if (req.query.from === 'list') {
        toast(reply, { type: 'success', message: `Request #${n} deleted.` });
        return reply.code(200).send(''); // the row swaps itself out
      }
      await c.deps.sessions.setFlash(req.session!.id, { type: 'success', message: `Request #${n} deleted.` });
      return redirect(req, reply, '/requests');
    },

    async transitionModal(
      req: FastifyRequest<{ Params: { number: string; action: string } }>,
      reply: FastifyReply,
    ) {
      const actor = actorOf(req);
      const r = await requests.getVisible(actor, requestNumber(req.params.number));
      const rule = TRANSITION_RULES.find((t) => t.action === req.params.action && t.from === r.status);
      if (!rule) throw new AppError(409, 'CONFLICT', 'That action is no longer available for this request.');
      return reply.render('partials/workflow/transition-modal.njk', { request: r, rule });
    },

    async transition(
      req: FastifyRequest<{ Params: { number: string; action: string } } & Body>,
      reply: FastifyReply,
    ) {
      const actor = actorOf(req);
      const n = requestNumber(req.params.number);
      try {
        const r = await requests.transition(actor, n, req.params.action, req.body ?? {});
        toast(reply, {
          type: 'success',
          message: `#${n} is now ${STATUS_META[r.status].label.toLowerCase()}.`,
        });
        trigger(reply, {
          'fd:close-modal': true,
          'fd:workflow-changed': { requestNumber: n, status: r.status },
        });
        return renderDetail(req, reply, n, 'partials/workflow/refresh.njk');
      } catch (err) {
        if (err instanceof AppError && err.statusCode === 422 && err.fields?.note) {
          const r = await requests.getVisible(actor, n);
          const rule = TRANSITION_RULES.find((t) => t.action === req.params.action && t.from === r.status);
          if (rule) {
            reply.header('HX-Retarget', '#modal-root').header('HX-Reswap', 'innerHTML');
            return reply.code(422).render('partials/workflow/transition-modal.njk', {
              request: r,
              rule,
              errors: err.fields,
              values: req.body,
            });
          }
        }
        throw err;
      }
    },

    async assign(req: FastifyRequest<NumberParams & Body>, reply: FastifyReply) {
      const actor = actorOf(req);
      const n = requestNumber(req.params.number);
      const r = await requests.assign(actor, n, (req.body ?? {}).assigneeId);
      toast(reply, {
        type: 'success',
        message: r.assigneeName ? `Assigned to ${r.assigneeName}.` : 'Assignment cleared.',
      });
      return renderDetail(req, reply, n, 'partials/requests/assignment.njk');
    },

    async comment(req: FastifyRequest<NumberParams & Body>, reply: FastifyReply) {
      const actor = actorOf(req);
      const n = requestNumber(req.params.number);
      try {
        const comment = await requests.comment(actor, n, req.body ?? {});
        trigger(reply, { 'fd:comment-added': true });
        return reply.render('partials/requests/comment.njk', { comment, isNew: true });
      } catch (err) {
        if (err instanceof AppError && err.statusCode === 422) {
          reply.header('X-Error-Message', encodeURIComponent(err.fields?.body ?? err.message));
          return reply.code(400).send('');
        }
        throw err;
      }
    },

    async upload(req: FastifyRequest<NumberParams>, reply: FastifyReply) {
      const actor = actorOf(req);
      const n = requestNumber(req.params.number);
      const file = await req.file();
      try {
        await attachments.upload(actor, n, file ? { filename: file.filename, stream: file.file } : null);
        toast(reply, { type: 'success', message: `${file?.filename ?? 'File'} uploaded.` });
        return renderDetail(req, reply, n, 'partials/requests/attachments.njk');
      } catch (err) {
        if (file) file.file.resume(); // drain so the connection can be reused
        if (err instanceof AppError && err.statusCode === 422) {
          reply.header('X-Error-Message', encodeURIComponent(err.fields?.file ?? err.message));
          return reply.code(400).send('');
        }
        throw err;
      }
    },

    async download(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
      const actor = actorOf(req);
      const { attachment, stream, size } = await attachments.open(actor, req.params.id);
      const inline = attachment.mimeType === 'application/pdf' || attachment.mimeType.startsWith('image/');
      return reply
        .header('Content-Type', attachment.mimeType)
        .header('Content-Length', size)
        .header(
          'Content-Disposition',
          contentDisposition(inline ? 'inline' : 'attachment', attachment.originalName),
        )
        .header('X-Content-Type-Options', 'nosniff')
        .header(
          'Content-Security-Policy',
          "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
        )
        .header('Cache-Control', 'private, no-store')
        .send(stream);
    },

    async removeAttachment(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
      const actor = actorOf(req);
      const { requestNumber: n } = await attachments.remove(actor, req.params.id);
      toast(reply, { type: 'success', message: 'Document removed.' });
      return renderDetail(req, reply, n, 'partials/requests/attachments.njk');
    },
  };
}
