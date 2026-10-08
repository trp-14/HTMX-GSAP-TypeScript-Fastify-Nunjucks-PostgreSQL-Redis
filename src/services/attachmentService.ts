import type { Readable } from 'node:stream';
import { z } from 'zod';
import { withTransaction } from '../db/transaction.js';
import { RATE_LIMITS } from '../redis/rateLimiter.js';
import { attachmentRepository } from '../repositories/attachmentRepository.js';
import { requestRepository } from '../repositories/requestRepository.js';
import { forbidden, notFound, tooManyRequests, validationError } from '../utils/errors.js';
import { sanitizeFilename } from '../utils/files.js';
import { TERMINAL_STATUSES } from '../workflow/definition.js';
import { AuditService } from './auditService.js';
import type { FileStorage } from './fileStorage.js';
import type { RequestService } from './requestService.js';
import type { Actor, ServiceDeps } from './types.js';

export class AttachmentService {
  constructor(
    private readonly deps: ServiceDeps,
    private readonly requests: RequestService,
    private readonly storage: FileStorage,
  ) {}

  async upload(
    actor: Actor,
    requestNumber: number,
    file: { filename: string; stream: Readable & { truncated?: boolean } } | null,
  ) {
    if (!actor.permissions.has('request:attach')) throw forbidden();
    const request = await this.requests.getVisible(actor, requestNumber);
    if (TERMINAL_STATUSES.includes(request.status))
      throw forbidden('Closed requests cannot receive new documents.');
    if (!file || !file.filename) throw validationError({ file: 'Choose a file to upload.' });
    const limit = await this.deps.rateLimiter.hit(RATE_LIMITS.upload, actor.id);
    if (!limit.allowed) throw tooManyRequests(limit.retryAfterSeconds);

    const originalName = sanitizeFilename(file.filename);
    const stored = await this.storage.save('attachments', originalName, file.stream);
    try {
      await withTransaction(this.deps.db, async (tx) => {
        const id = await attachmentRepository.insert(tx, {
          requestId: request.id,
          uploadedBy: actor.id,
          originalName,
          storageKey: stored.storageKey,
          mimeType: stored.mime,
          sizeBytes: stored.sizeBytes,
          checksum: stored.checksum,
        });
        await requestRepository.touch(tx, request.id);
        await AuditService.record(tx, {
          actorId: actor.id,
          action: 'ATTACHMENT_UPLOADED',
          entityType: 'request',
          entityId: String(request.requestNumber),
          newState: { attachmentId: id, name: originalName, size: stored.sizeBytes, sha256: stored.checksum },
          ip: actor.ip,
        });
      });
    } catch (err) {
      await this.storage.remove('attachments', stored.storageKey);
      throw err;
    }
    return attachmentRepository.listForRequest(this.deps.db, request.id);
  }

  /** Authorises a download: the attachment is only reachable through a request the actor can see. */
  private async find(actor: Actor, attachmentId: string) {
    if (!z.string().uuid().safeParse(attachmentId).success) throw notFound('Attachment');
    const attachment = await attachmentRepository.findById(this.deps.db, attachmentId);
    if (!attachment) throw notFound('Attachment');
    const request = await requestRepository.findById(this.deps.db, attachment.requestId);
    if (!request || !this.requests.canView(actor, request)) throw notFound('Attachment');
    return { attachment, request };
  }

  async open(actor: Actor, attachmentId: string) {
    const { attachment } = await this.find(actor, attachmentId);
    const file = await this.storage.open('attachments', attachment.storageKey);
    return { attachment, ...file };
  }

  async remove(actor: Actor, attachmentId: string) {
    const { attachment, request } = await this.find(actor, attachmentId);
    const allowed =
      actor.permissions.has('request:delete:any') ||
      (attachment.uploadedBy === actor.id && !TERMINAL_STATUSES.includes(request.status));
    if (!allowed) throw forbidden('Only the uploader can remove this document while the request is open.');
    await withTransaction(this.deps.db, async (tx) => {
      await attachmentRepository.delete(tx, attachment.id);
      await AuditService.record(tx, {
        actorId: actor.id,
        action: 'ATTACHMENT_DELETED',
        entityType: 'request',
        entityId: String(request.requestNumber),
        previousState: { attachmentId: attachment.id, name: attachment.originalName },
        ip: actor.ip,
      });
    });
    await this.storage.remove('attachments', attachment.storageKey);
    return { requestId: request.id, requestNumber: request.requestNumber };
  }

  /** Removes stored files after their rows were deleted (e.g. a whole request). Best effort. */
  async purgeFiles(storageKeys: string[]): Promise<void> {
    for (const key of storageKeys) {
      await this.storage
        .remove('attachments', key)
        .catch((err) => this.deps.log.warn({ err }, 'failed to remove attachment file'));
    }
  }

  list(requestId: string) {
    return attachmentRepository.listForRequest(this.deps.db, requestId);
  }
}
