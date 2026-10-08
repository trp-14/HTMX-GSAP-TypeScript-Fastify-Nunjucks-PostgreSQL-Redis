import { z } from 'zod';
import { withTransaction } from '../db/transaction.js';
import type { Queryable } from '../db/pool.js';
import { createEvent, requestAudience, STATUS_EVENT, type FlowDeskEvent } from '../events/types.js';
import { NotificationService } from '../notifications/notificationService.js';
import type { NotificationInput } from '../repositories/notificationRepository.js';
import {
  PRIORITIES,
  REQUEST_SORTS,
  requestRepository,
  type RequestFilters,
  type RequestRecord,
  type RequestSort,
} from '../repositories/requestRepository.js';
import { attachmentRepository } from '../repositories/attachmentRepository.js';
import { userRepository } from '../repositories/userRepository.js';
import { parse } from '../schemas/validate.js';
import { badRequest, conflict, forbidden, notFound, validationError } from '../utils/errors.js';
import { availableTransitions, evaluateTransition } from '../workflow/engine.js';
import {
  isRequestStatus,
  STATUS_META,
  TERMINAL_STATUSES,
  type RequestStatus,
} from '../workflow/definition.js';
import { AuditService } from './auditService.js';
import type { Actor, ServiceDeps } from './types.js';
import type { SettingsService } from './settingsService.js';

export const RequestInputSchema = z.object({
  title: z.string().trim().min(4, 'Title must be at least 4 characters.').max(160, 'Title is too long.'),
  description: z
    .string()
    .trim()
    .min(10, 'Describe the request in at least 10 characters.')
    .max(8000, 'Description is too long.'),
  typeId: z.coerce
    .number({ invalid_type_error: 'Choose a request type.' })
    .int()
    .positive('Choose a request type.'),
  priority: z.enum(PRIORITIES, { errorMap: () => ({ message: 'Choose a priority.' }) }),
  dueDate: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use a valid date.'),
});
export type RequestInput = z.input<typeof RequestInputSchema>;

export const RequestListQuerySchema = z.object({
  q: z.string().trim().max(120).optional().catch(undefined),
  status: z
    .string()
    .optional()
    .transform((v) => (isRequestStatus(v) ? v : undefined)),
  priority: z.enum(PRIORITIES).optional().catch(undefined),
  type: z.coerce.number().int().positive().optional().catch(undefined),
  department: z.coerce.number().int().positive().optional().catch(undefined),
  scope: z.enum(['all', 'mine', 'assigned', 'overdue']).optional().catch(undefined),
  sort: z
    .string()
    .optional()
    .transform((v): RequestSort => (v && v in REQUEST_SORTS ? (v as RequestSort) : 'created')),
  dir: z.enum(['asc', 'desc']).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined),
});
export type RequestListQuery = z.output<typeof RequestListQuerySchema>;

const CommentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Write a comment first.')
    .max(4000, 'Comments are limited to 4,000 characters.'),
});

const TransitionSchema = z.object({
  note: z
    .string()
    .trim()
    .max(2000, 'Notes are limited to 2,000 characters.')
    .optional()
    .transform((v) => v || null),
});

const NOTIFICATION_COPY: Partial<
  Record<RequestStatus, (r: RequestRecord) => { title: string; type: string }>
> = {
  UNDER_REVIEW: (r) => ({ type: 'request.review_started', title: `#${r.requestNumber} is now under review` }),
  APPROVED: (r) => ({ type: 'request.approved', title: `#${r.requestNumber} was approved` }),
  REJECTED: (r) => ({ type: 'request.rejected', title: `#${r.requestNumber} was rejected` }),
  CHANGES_REQUESTED: (r) => ({
    type: 'request.changes_requested',
    title: `Changes requested on #${r.requestNumber}`,
  }),
  PROCESSING: (r) => ({
    type: 'request.processing_started',
    title: `#${r.requestNumber} is being processed`,
  }),
  COMPLETED: (r) => ({ type: 'request.completed', title: `#${r.requestNumber} has been completed` }),
};

const AUDIT_ACTION: Record<string, string> = {
  submit: 'REQUEST_SUBMITTED',
  resubmit: 'REQUEST_RESUBMITTED',
  'start-review': 'REQUEST_REVIEW_STARTED',
  approve: 'REQUEST_APPROVED',
  reject: 'REQUEST_REJECTED',
  'request-changes': 'REQUEST_CHANGES_REQUESTED',
  'start-processing': 'REQUEST_PROCESSING_STARTED',
  complete: 'REQUEST_COMPLETED',
};

function ref(r: RequestRecord) {
  return {
    requestId: r.id,
    requestNumber: r.requestNumber,
    title: r.title,
    priority: r.priority,
    requesterId: r.requesterId,
    assigneeId: r.assigneeId,
  };
}

function snapshot(r: RequestRecord) {
  return {
    status: r.status,
    title: r.title,
    priority: r.priority,
    typeId: r.typeId,
    assigneeId: r.assigneeId,
    dueDate: r.dueDate,
  };
}

/**
 * Request management and the workflow engine's persistence side. Every mutation:
 *   validate → authorize → PostgreSQL transaction (row + transition + audit + notifications)
 *   → commit → publish Redis events.
 */
export class RequestService {
  constructor(
    private readonly deps: ServiceDeps,
    private readonly settings: SettingsService,
  ) {}

  // ---------------------------------------------------------------- visibility

  canView(actor: Actor, r: Pick<RequestRecord, 'requesterId' | 'assigneeId'>): boolean {
    return (
      actor.permissions.has('request:read:all') || r.requesterId === actor.id || r.assigneeId === actor.id
    );
  }

  canEdit(actor: Actor, r: Pick<RequestRecord, 'requesterId' | 'status'>): boolean {
    return r.requesterId === actor.id && (r.status === 'DRAFT' || r.status === 'CHANGES_REQUESTED');
  }

  canDelete(actor: Actor, r: Pick<RequestRecord, 'requesterId' | 'status'>): boolean {
    return (
      actor.permissions.has('request:delete:any') || (r.requesterId === actor.id && r.status === 'DRAFT')
    );
  }

  canAssign(actor: Actor, r: Pick<RequestRecord, 'status'>): boolean {
    return (
      actor.permissions.has('request:assign') && !TERMINAL_STATUSES.includes(r.status) && r.status !== 'DRAFT'
    );
  }

  /** Loads a request the actor may see. Invisible requests look exactly like missing ones. */
  async getVisible(
    actor: Actor,
    requestNumber: number,
    db: Queryable = this.deps.db,
  ): Promise<RequestRecord> {
    const r = await requestRepository.findByNumber(db, requestNumber);
    if (!r || !this.canView(actor, r)) throw notFound('Request');
    return r;
  }

  // ---------------------------------------------------------------- queries

  async list(actor: Actor, query: RequestListQuery) {
    const filters: RequestFilters = {
      q: query.q || undefined,
      status: query.status,
      priority: query.priority,
      typeId: query.type,
      departmentId: query.department,
    };
    if (!actor.permissions.has('request:read:all')) filters.visibleToUserId = actor.id;
    if (query.scope === 'mine') filters.requesterId = actor.id;
    if (query.scope === 'assigned') filters.assigneeId = actor.id;
    if (query.scope === 'overdue') filters.overdue = true;
    return requestRepository.list(
      this.deps.db,
      filters,
      query.sort,
      query.dir ?? 'desc',
      query.page ?? 1,
      12,
    );
  }

  async detail(actor: Actor, requestNumber: number) {
    const request = await this.getVisible(actor, requestNumber);
    const [comments, attachments, transitions, assignable] = await Promise.all([
      requestRepository.comments(this.deps.db, request.id),
      attachmentRepository.listForRequest(this.deps.db, request.id),
      requestRepository.transitions(this.deps.db, request.id),
      this.canAssign(actor, request) ? userRepository.assignable(this.deps.db) : Promise.resolve([]),
    ]);
    return {
      request,
      comments,
      attachments,
      transitions,
      assignable,
      actions: availableTransitions(request, actor),
      permissions: {
        edit: this.canEdit(actor, request),
        delete: this.canDelete(actor, request),
        assign: this.canAssign(actor, request),
        comment: actor.permissions.has('request:comment'),
        attach: actor.permissions.has('request:attach') && !TERMINAL_STATUSES.includes(request.status),
      },
    };
  }

  types() {
    return this.deps.cache.getOrSet('request-types', 3600, () => requestRepository.types(this.deps.db));
  }

  // ---------------------------------------------------------------- commands

  async create(actor: Actor, input: unknown, opts: { submit: boolean }): Promise<RequestRecord> {
    if (!actor.permissions.has('request:create')) throw forbidden();
    const data = parse(RequestInputSchema, input);
    if (!actor.departmentId)
      throw validationError({ _form: 'Your profile has no department. Update it on the Account page.' });
    const type = await requestRepository.typeById(this.deps.db, data.typeId);
    if (!type) throw validationError({ typeId: 'Choose a request type.' });
    const dueDate = data.dueDate ?? (await this.defaultDueDate(type.slaDays));

    const events: FlowDeskEvent[] = [];
    const created = await withTransaction(this.deps.db, async (tx) => {
      const { id } = await requestRepository.insert(tx, {
        ...data,
        dueDate,
        requesterId: actor.id,
        departmentId: actor.departmentId!,
      });
      await requestRepository.insertTransition(tx, {
        requestId: id,
        from: null,
        to: 'DRAFT',
        actorId: actor.id,
        note: null,
      });
      let r = (await requestRepository.findById(tx, id))!;
      await AuditService.record(tx, {
        actorId: actor.id,
        action: 'REQUEST_CREATED',
        entityType: 'request',
        entityId: String(r.requestNumber),
        newState: snapshot(r),
        metadata: { title: r.title, type: type.name },
        ip: actor.ip,
      });
      events.push(
        createEvent({
          type: 'request.created',
          entityId: r.id,
          actorId: actor.id,
          audience: requestAudience(r),
          ...ref(r),
          status: r.status,
        }),
      );
      if (opts.submit) {
        events.push(...(await this.applyTransition(tx, actor, r, 'submit', null)));
        r = (await requestRepository.findById(tx, id))!;
      }
      return r;
    });
    await this.deps.publisher.publishAll(events);
    return created;
  }

  async update(actor: Actor, requestNumber: number, input: unknown): Promise<RequestRecord> {
    const data = parse(RequestInputSchema, input);
    const events: FlowDeskEvent[] = [];
    const updated = await withTransaction(this.deps.db, async (tx) => {
      const before = await this.getVisible(actor, requestNumber, tx);
      await requestRepository.lockById(tx, before.id);
      if (!this.canEdit(actor, before)) {
        throw forbidden(
          'Only the requester can edit a request, and only while it is a draft or awaiting changes.',
        );
      }
      if (!(await requestRepository.typeById(tx, data.typeId)))
        throw validationError({ typeId: 'Choose a request type.' });
      await requestRepository.updateDetails(tx, before.id, {
        ...data,
        dueDate: data.dueDate ?? before.dueDate,
      });
      const after = (await requestRepository.findById(tx, before.id))!;
      await AuditService.record(tx, {
        actorId: actor.id,
        action: 'REQUEST_UPDATED',
        entityType: 'request',
        entityId: String(after.requestNumber),
        previousState: snapshot(before),
        newState: snapshot(after),
        ip: actor.ip,
      });
      events.push(
        createEvent({
          type: 'request.updated',
          entityId: after.id,
          actorId: actor.id,
          audience: requestAudience(after),
          ...ref(after),
          status: after.status,
        }),
      );
      return after;
    });
    await this.deps.publisher.publishAll(events);
    return updated;
  }

  async remove(actor: Actor, requestNumber: number): Promise<string[]> {
    const events: FlowDeskEvent[] = [];
    const storageKeys = await withTransaction(this.deps.db, async (tx) => {
      const r = await this.getVisible(actor, requestNumber, tx);
      await requestRepository.lockById(tx, r.id);
      if (!this.canDelete(actor, r))
        throw forbidden('Only draft requests can be deleted by their requester.');
      const keys = await attachmentRepository.storageKeysForRequest(tx, r.id);
      await requestRepository.delete(tx, r.id);
      await AuditService.record(tx, {
        actorId: actor.id,
        action: 'REQUEST_DELETED',
        entityType: 'request',
        entityId: String(r.requestNumber),
        previousState: snapshot(r),
        metadata: { title: r.title },
        ip: actor.ip,
      });
      events.push(
        createEvent({
          type: 'request.deleted',
          entityId: r.id,
          actorId: actor.id,
          audience: requestAudience(r),
          ...ref(r),
          status: r.status,
        }),
      );
      return keys;
    });
    await this.deps.publisher.publishAll(events);
    return storageKeys;
  }

  /**
   * Performs a workflow action. The browser only names the action; the engine decides whether it
   * is legal from the *current* persisted status (read under a row lock) and the actor's permissions.
   */
  async transition(
    actor: Actor,
    requestNumber: number,
    action: string,
    input: unknown,
  ): Promise<RequestRecord> {
    const { note } = parse(TransitionSchema, input);
    const events: FlowDeskEvent[] = [];
    const result = await withTransaction(this.deps.db, async (tx) => {
      const visible = await this.getVisible(actor, requestNumber, tx);
      await requestRepository.lockById(tx, visible.id);
      const current = (await requestRepository.findById(tx, visible.id))!;
      events.push(...(await this.applyTransition(tx, actor, current, action, note)));
      return (await requestRepository.findById(tx, current.id))!;
    });
    await this.deps.publisher.publishAll(events);
    this.deps.log.info(
      { requestNumber, action, status: result.status, actorId: actor.id },
      'workflow transition',
    );
    return result;
  }

  private async applyTransition(
    tx: Queryable,
    actor: Actor,
    r: RequestRecord,
    action: string,
    note: string | null,
  ): Promise<FlowDeskEvent[]> {
    const check = evaluateTransition(r, action, actor, note);
    if (!check.ok) {
      if (check.reason === 'FORBIDDEN') throw forbidden(check.message);
      if (check.reason === 'NOTE_REQUIRED') throw validationError({ note: check.message }, check.message);
      throw conflict(check.message);
    }
    const { rule } = check;
    await requestRepository.updateStatus(tx, r.id, rule.to);
    await requestRepository.insertTransition(tx, {
      requestId: r.id,
      from: r.status,
      to: rule.to,
      actorId: actor.id,
      note,
    });
    if (rule.to === 'APPROVED' || rule.to === 'REJECTED' || rule.to === 'CHANGES_REQUESTED') {
      await requestRepository.insertApproval(tx, {
        requestId: r.id,
        approverId: actor.id,
        decision: rule.to,
        comment: note,
      });
    }
    await AuditService.record(tx, {
      actorId: actor.id,
      action: AUDIT_ACTION[rule.action] ?? 'REQUEST_TRANSITIONED',
      entityType: 'request',
      entityId: String(r.requestNumber),
      previousState: { status: r.status },
      newState: { status: rule.to },
      metadata: { title: r.title, note },
      ip: actor.ip,
    });

    const notifications = await this.transitionNotifications(tx, r, rule.to, note, actor);
    const notificationEvents = await NotificationService.create(tx, notifications, actor.id);
    const statusEvent = createEvent({
      type: STATUS_EVENT[rule.to as Exclude<RequestStatus, 'DRAFT'>],
      entityId: r.id,
      actorId: actor.id,
      audience: requestAudience(r),
      ...ref(r),
      fromStatus: r.status,
      toStatus: rule.to,
      note,
    });
    return [statusEvent, ...notificationEvents];
  }

  private async transitionNotifications(
    tx: Queryable,
    r: RequestRecord,
    to: RequestStatus,
    note: string | null,
    actor: Actor,
  ): Promise<NotificationInput[]> {
    const link = `/requests/${r.requestNumber}`;
    const base = { link, entityType: 'request', entityId: String(r.requestNumber) };
    if (to === 'SUBMITTED') {
      const managers = await userRepository.idsWithRoles(tx, ['MANAGER']);
      return managers.map((userId) => ({
        ...base,
        userId,
        type: 'request.submitted',
        title: `#${r.requestNumber} is waiting for review`,
        body: `${r.requesterName} submitted “${r.title}”.`,
      }));
    }
    const copy = NOTIFICATION_COPY[to]?.(r);
    const out: NotificationInput[] = [];
    if (copy) {
      out.push({
        ...base,
        userId: r.requesterId,
        type: copy.type,
        title: copy.title,
        body: note
          ? `${actor.fullName}: “${note}”`
          : `${actor.fullName} moved “${r.title}” to ${STATUS_META[to].label.toLowerCase()}.`,
      });
    }
    if (to === 'APPROVED') {
      const recipients = r.assigneeId
        ? [r.assigneeId]
        : await userRepository.idsWithRoles(tx, ['OPERATIONS']);
      for (const userId of recipients) {
        out.push({
          ...base,
          userId,
          type: 'request.ready_for_processing',
          title: `#${r.requestNumber} is approved and ready to process`,
          body: `“${r.title}” was approved by ${actor.fullName}.`,
        });
      }
    }
    return out;
  }

  async assign(actor: Actor, requestNumber: number, assigneeIdInput: unknown): Promise<RequestRecord> {
    if (!actor.permissions.has('request:assign')) throw forbidden();
    const assigneeId = typeof assigneeIdInput === 'string' && assigneeIdInput ? assigneeIdInput : null;
    const events: FlowDeskEvent[] = [];
    const result = await withTransaction(this.deps.db, async (tx) => {
      const before = await this.getVisible(actor, requestNumber, tx);
      await requestRepository.lockById(tx, before.id);
      if (!this.canAssign(actor, before))
        throw conflict('Draft, rejected and completed requests cannot be reassigned.');
      let assigneeName: string | null = null;
      if (assigneeId) {
        const candidates = await userRepository.assignable(tx);
        const match = candidates.find((u) => u.id === assigneeId);
        if (!match) throw badRequest('That person cannot be assigned to requests.');
        assigneeName = match.fullName;
      }
      if (before.assigneeId === assigneeId) return before;
      await requestRepository.setAssignee(tx, before.id, assigneeId);
      const after = (await requestRepository.findById(tx, before.id))!;
      await AuditService.record(tx, {
        actorId: actor.id,
        action: 'REQUEST_ASSIGNED',
        entityType: 'request',
        entityId: String(after.requestNumber),
        previousState: { assigneeId: before.assigneeId, assignee: before.assigneeName },
        newState: { assigneeId, assignee: assigneeName },
        metadata: { title: after.title },
        ip: actor.ip,
      });
      if (assigneeId) {
        events.push(
          ...(await NotificationService.create(
            tx,
            [
              {
                userId: assigneeId,
                type: 'request.assigned',
                title: `You were assigned #${after.requestNumber}`,
                body: `${actor.fullName} assigned “${after.title}” to you.`,
                link: `/requests/${after.requestNumber}`,
                entityType: 'request',
                entityId: String(after.requestNumber),
              },
            ],
            actor.id,
          )),
        );
      }
      events.unshift(
        createEvent({
          type: 'request.assigned',
          entityId: after.id,
          actorId: actor.id,
          audience: requestAudience(after, before.assigneeId),
          ...ref(after),
          previousAssigneeId: before.assigneeId,
          assigneeName,
          status: after.status,
        }),
      );
      return after;
    });
    await this.deps.publisher.publishAll(events);
    return result;
  }

  async comment(actor: Actor, requestNumber: number, input: unknown) {
    if (!actor.permissions.has('request:comment')) throw forbidden();
    const { body } = parse(CommentSchema, input);
    const events: FlowDeskEvent[] = [];
    const commentId = await withTransaction(this.deps.db, async (tx) => {
      const r = await this.getVisible(actor, requestNumber, tx);
      const id = await requestRepository.insertComment(tx, { requestId: r.id, authorId: actor.id, body });
      await requestRepository.touch(tx, r.id);
      await AuditService.record(tx, {
        actorId: actor.id,
        action: 'REQUEST_COMMENTED',
        entityType: 'request',
        entityId: String(r.requestNumber),
        metadata: { commentId: id, excerpt: body.slice(0, 120) },
        ip: actor.ip,
      });
      const recipients = new Set([
        r.requesterId,
        ...(r.assigneeId ? [r.assigneeId] : []),
        ...(await requestRepository.commenterIds(tx, r.id)),
      ]);
      events.push(
        createEvent({
          type: 'request.commented',
          entityId: r.id,
          actorId: actor.id,
          audience: requestAudience(r),
          ...ref(r),
          commentId: id,
          status: r.status,
        }),
        ...(await NotificationService.create(
          tx,
          [...recipients].map((userId) => ({
            userId,
            type: 'request.commented',
            title: `${actor.fullName} commented on #${r.requestNumber}`,
            body: body.length > 140 ? body.slice(0, 137) + '…' : body,
            link: `/requests/${r.requestNumber}#comments`,
            entityType: 'request',
            entityId: String(r.requestNumber),
          })),
          actor.id,
        )),
      );
      return id;
    });
    await this.deps.publisher.publishAll(events);
    const r = await this.getVisible(actor, requestNumber);
    const comments = await requestRepository.comments(this.deps.db, r.id);
    return comments.find((c) => c.id === commentId)!;
  }

  private async defaultDueDate(slaDays: number): Promise<string> {
    const settings = await this.settings.get();
    const days = Math.max(slaDays, 1) || settings.defaultDueDays;
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }
}
