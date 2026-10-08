import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { withTransaction } from '../db/transaction.js';
import { hashPassword } from '../auth/password.js';
import { ROLES, type Role } from '../auth/permissions.js';
import { userRepository } from '../repositories/userRepository.js';
import { parse } from '../schemas/validate.js';
import { badRequest, forbidden, notFound, validationError } from '../utils/errors.js';
import { AuditService } from './auditService.js';
import type { Actor, ServiceDeps } from './types.js';

const rolesField = z
  .union([z.enum(ROLES), z.array(z.enum(ROLES))])
  .optional()
  .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]))
  .refine((v) => v.length > 0, 'Select at least one role.');

const CreateUserSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter a full name.').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email.').max(254),
  jobTitle: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => v || null),
  departmentId: z.coerce.number().int().positive('Choose a department.'),
  roles: rolesField,
});

const UpdateUserSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter a full name.').max(120),
  jobTitle: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => v || null),
  departmentId: z.coerce.number().int().positive('Choose a department.'),
  roles: rolesField,
});

export const UserListQuerySchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  role: z.enum(ROLES).optional().catch(undefined),
  department: z.coerce.number().int().positive().optional().catch(undefined),
  status: z.enum(['active', 'inactive']).optional().catch(undefined),
  page: z.coerce.number().int().min(1).optional().catch(undefined),
});

const sameRoles = (a: readonly Role[], b: readonly Role[]) =>
  a.length === b.length && a.every((r) => b.includes(r));

/** Administration of users and their roles. Role changes and deactivation revoke live sessions. */
export class UserService {
  constructor(private readonly deps: ServiceDeps) {}

  private assertAdmin(actor: Actor) {
    if (!actor.permissions.has('user:manage')) throw forbidden();
  }

  async list(actor: Actor, query: z.output<typeof UserListQuerySchema>) {
    this.assertAdmin(actor);
    return userRepository.list(this.deps.db, {
      q: query.q,
      role: query.role,
      departmentId: query.department,
      status: query.status,
      page: query.page ?? 1,
      pageSize: 15,
    });
  }

  async get(actor: Actor, id: string) {
    this.assertAdmin(actor);
    const u = z.string().uuid().safeParse(id).success
      ? await userRepository.findById(this.deps.db, id)
      : null;
    if (!u) throw notFound('User');
    return u;
  }

  /** Creates a user with a one-time temporary password, returned once so the admin can hand it over. */
  async create(actor: Actor, input: unknown): Promise<{ id: string; temporaryPassword: string }> {
    this.assertAdmin(actor);
    const data = parse(CreateUserSchema, input);
    if (!actor.permissions.has('role:manage') && !sameRoles(data.roles, ['EMPLOYEE'])) throw forbidden();
    const temporaryPassword = `Fd-${randomBytes(9).toString('base64url')}`;
    const passwordHash = await hashPassword(temporaryPassword);
    const id = await withTransaction(this.deps.db, async (tx) => {
      if (await userRepository.emailExists(tx, data.email))
        throw validationError({ email: 'This email is already in use.' });
      const userId = await userRepository.insert(tx, { ...data, passwordHash });
      await userRepository.setRoles(tx, userId, data.roles);
      await AuditService.record(tx, {
        actorId: actor.id,
        action: 'USER_CREATED',
        entityType: 'user',
        entityId: userId,
        newState: {
          email: data.email,
          fullName: data.fullName,
          roles: data.roles,
          departmentId: data.departmentId,
        },
        ip: actor.ip,
      });
      return userId;
    });
    return { id, temporaryPassword };
  }

  async update(actor: Actor, id: string, input: unknown) {
    this.assertAdmin(actor);
    const data = parse(UpdateUserSchema, input);
    const before = await this.get(actor, id);
    const rolesChanged = !sameRoles(before.roles, data.roles);
    if (rolesChanged && !actor.permissions.has('role:manage')) throw forbidden();
    if (id === actor.id && before.roles.includes('ADMIN') && !data.roles.includes('ADMIN')) {
      throw badRequest('You cannot remove your own administrator role.');
    }
    await withTransaction(this.deps.db, async (tx) => {
      await userRepository.updateProfile(tx, id, data);
      await AuditService.record(tx, {
        actorId: actor.id,
        action: 'USER_UPDATED',
        entityType: 'user',
        entityId: id,
        previousState: {
          fullName: before.fullName,
          jobTitle: before.jobTitle,
          departmentId: before.departmentId,
        },
        newState: { fullName: data.fullName, jobTitle: data.jobTitle, departmentId: data.departmentId },
        ip: actor.ip,
      });
      if (rolesChanged) {
        await userRepository.setRoles(tx, id, data.roles);
        await AuditService.record(tx, {
          actorId: actor.id,
          action: 'ROLE_CHANGED',
          entityType: 'user',
          entityId: id,
          previousState: { roles: before.roles },
          newState: { roles: data.roles },
          metadata: { user: before.email },
          ip: actor.ip,
        });
      }
    });
    // Permissions are re-read from PostgreSQL on every request, so sessions stay valid;
    // but a *demotion* should not leave an already-open page acting with stale UI.
    if (rolesChanged && id !== actor.id) await this.deps.sessions.destroyAllForUser(id);
    return this.get(actor, id);
  }

  async setActive(actor: Actor, id: string, active: boolean) {
    this.assertAdmin(actor);
    if (id === actor.id) throw badRequest('You cannot deactivate your own account.');
    const before = await this.get(actor, id);
    if (before.isActive === active) return before;
    await withTransaction(this.deps.db, async (tx) => {
      await userRepository.setActive(tx, id, active);
      await AuditService.record(tx, {
        actorId: actor.id,
        action: active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
        entityType: 'user',
        entityId: id,
        previousState: { isActive: before.isActive },
        newState: { isActive: active },
        metadata: { user: before.email },
        ip: actor.ip,
      });
    });
    if (!active) await this.deps.sessions.destroyAllForUser(id);
    return this.get(actor, id);
  }

  departments() {
    return this.deps.cache.getOrSet('departments', 3600, () => userRepository.departments(this.deps.db));
  }
}
