import type { Queryable } from '../db/pool.js';
import { auditRepository, type AuditEntry, type AuditFilters } from '../repositories/auditRepository.js';
import { userRepository } from '../repositories/userRepository.js';
import type { Actor, ServiceDeps } from './types.js';
import { forbidden } from '../utils/errors.js';

/**
 * Audit logs are written by backend services inside the same transaction as the change they
 * describe — if the change rolls back, so does its audit record.
 */
export class AuditService {
  constructor(private readonly deps: ServiceDeps) {}

  static record(tx: Queryable, entry: AuditEntry): Promise<void> {
    return auditRepository.insert(tx, entry);
  }

  async search(actor: Actor, filters: AuditFilters, page: number) {
    if (!actor.permissions.has('audit:read')) throw forbidden();
    const [results, actions, entityTypes, users] = await Promise.all([
      auditRepository.list(this.deps.db, filters, page, 25),
      auditRepository.distinctActions(this.deps.db),
      auditRepository.distinctEntityTypes(this.deps.db),
      userRepository.list(this.deps.db, { page: 1, pageSize: 200 }),
    ]);
    return { results, actions, entityTypes, users: users.items };
  }
}
