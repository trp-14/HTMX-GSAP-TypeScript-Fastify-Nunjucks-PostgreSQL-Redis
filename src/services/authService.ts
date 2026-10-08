import { z } from 'zod';
import { withTransaction } from '../db/transaction.js';
import { DUMMY_HASH_PROMISE, hashPassword, verifyPassword } from '../auth/password.js';
import { permissionsFor } from '../auth/permissions.js';
import { RATE_LIMITS } from '../redis/rateLimiter.js';
import { userRepository } from '../repositories/userRepository.js';
import { parse } from '../schemas/validate.js';
import { AppError, forbidden, tooManyRequests, validationError } from '../utils/errors.js';
import { AuditService } from './auditService.js';
import type { SettingsService } from './settingsService.js';
import type { Actor, Principal, ServiceDeps } from './types.js';

export const PasswordSchema = z
  .string()
  .min(10, 'Use at least 10 characters.')
  .max(200, 'Password is too long.')
  .refine((p) => /[a-zA-Z]/.test(p) && /[0-9\W]/.test(p), 'Mix letters with numbers or symbols.');

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(254),
  password: z.string().min(1, 'Enter your password.').max(200),
});

export const RegisterSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Enter your full name.').max(120),
    email: z.string().trim().toLowerCase().email('Enter a valid work email.').max(254),
    departmentId: z.coerce
      .number({ invalid_type_error: 'Choose your department.' })
      .int()
      .positive('Choose your department.'),
    jobTitle: z
      .string()
      .trim()
      .max(120)
      .optional()
      .transform((v) => v || null),
    password: PasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  });

const ProfileSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name.').max(120),
  jobTitle: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => v || null),
  departmentId: z.coerce.number().int().positive('Choose your department.'),
});

const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: PasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match.',
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    path: ['newPassword'],
    message: 'Choose a different password.',
  });

const INVALID_LOGIN = 'That email and password combination is not recognised.';

export class AuthService {
  constructor(
    private readonly deps: ServiceDeps,
    private readonly settings: SettingsService,
  ) {}

  /** Loads the principal for a session. Inactive users get no principal (their sessions die). */
  async principal(userId: string): Promise<Principal | null> {
    const u = await userRepository.findById(this.deps.db, userId);
    if (!u || !u.isActive) return null;
    return {
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      jobTitle: u.jobTitle,
      departmentId: u.departmentId,
      departmentName: u.departmentName,
      roles: u.roles,
      permissions: permissionsFor(u.roles),
    };
  }

  /**
   * Verifies credentials, rate limited per IP and per email in Redis. Unknown emails still pay the
   * cost of a hash comparison so response timing does not reveal which accounts exist.
   */
  async login(
    input: unknown,
    meta: { ip: string; userAgent: string },
  ): Promise<{ sessionId: string; userId: string }> {
    const { email, password } = parse(LoginSchema, input);
    const [byIp, byEmail] = await Promise.all([
      this.deps.rateLimiter.hit(RATE_LIMITS.loginByIp, meta.ip),
      this.deps.rateLimiter.hit(RATE_LIMITS.loginByEmail, email),
    ]);
    if (!byIp.allowed || !byEmail.allowed) {
      this.deps.log.warn({ ip: meta.ip, reason: 'rate_limited' }, 'authentication failure');
      throw tooManyRequests(Math.max(byIp.retryAfterSeconds, byEmail.retryAfterSeconds));
    }

    const creds = await userRepository.findCredentialsByEmail(this.deps.db, email);
    const ok = await verifyPassword(password, creds?.passwordHash ?? (await DUMMY_HASH_PROMISE));
    if (!creds || !ok || !creds.isActive) {
      this.deps.log.warn(
        { ip: meta.ip, reason: !creds ? 'unknown_account' : !ok ? 'bad_password' : 'inactive_account' },
        'authentication failure',
      );
      if (creds && ok && !creds.isActive)
        throw new AppError(403, 'INACTIVE', 'This account has been deactivated.');
      throw new AppError(401, 'INVALID_CREDENTIALS', INVALID_LOGIN, { _form: INVALID_LOGIN });
    }

    await this.deps.rateLimiter.reset(RATE_LIMITS.loginByEmail, email);
    const session = await this.deps.sessions.create(creds.id, meta);
    await withTransaction(this.deps.db, async (tx) => {
      await userRepository.touchLogin(tx, creds.id);
      await AuditService.record(tx, {
        actorId: creds.id,
        action: 'USER_LOGGED_IN',
        entityType: 'user',
        entityId: creds.id,
        metadata: { userAgent: meta.userAgent.slice(0, 120) },
        ip: meta.ip,
      });
    });
    return { sessionId: session.id, userId: creds.id };
  }

  async logout(sessionId: string, actor: Actor | null): Promise<void> {
    await this.deps.sessions.destroy(sessionId);
    if (actor) {
      await AuditService.record(this.deps.db, {
        actorId: actor.id,
        action: 'USER_LOGGED_OUT',
        entityType: 'user',
        entityId: actor.id,
        ip: actor.ip,
      });
    }
  }

  async register(
    input: unknown,
    meta: { ip: string; userAgent: string },
  ): Promise<{ sessionId: string; userId: string }> {
    const settings = await this.settings.get();
    if (!settings.allowSelfRegistration)
      throw forbidden('Self-registration is disabled. Ask an administrator for an account.');
    const limit = await this.deps.rateLimiter.hit(RATE_LIMITS.register, meta.ip);
    if (!limit.allowed) throw tooManyRequests(limit.retryAfterSeconds);
    const data = parse(RegisterSchema, input);
    const departments = await userRepository.departments(this.deps.db);
    if (!departments.some((d) => d.id === data.departmentId))
      throw validationError({ departmentId: 'Choose your department.' });

    const passwordHash = await hashPassword(data.password);
    const userId = await withTransaction(this.deps.db, async (tx) => {
      if (await userRepository.emailExists(tx, data.email)) {
        throw validationError({ email: 'An account with this email already exists.' });
      }
      const id = await userRepository.insert(tx, { ...data, passwordHash });
      // Self-registered accounts always start with the least-privileged role.
      await userRepository.setRoles(tx, id, ['EMPLOYEE']);
      await AuditService.record(tx, {
        actorId: id,
        action: 'USER_CREATED',
        entityType: 'user',
        entityId: id,
        newState: { email: data.email, fullName: data.fullName, roles: ['EMPLOYEE'] },
        metadata: { via: 'self-registration' },
        ip: meta.ip,
      });
      return id;
    });
    const session = await this.deps.sessions.create(userId, meta);
    return { sessionId: session.id, userId };
  }

  async updateProfile(actor: Actor, input: unknown): Promise<void> {
    const data = parse(ProfileSchema, input);
    const departments = await userRepository.departments(this.deps.db);
    if (!departments.some((d) => d.id === data.departmentId))
      throw validationError({ departmentId: 'Choose your department.' });
    await withTransaction(this.deps.db, async (tx) => {
      await userRepository.updateProfile(tx, actor.id, data);
      await AuditService.record(tx, {
        actorId: actor.id,
        action: 'USER_UPDATED',
        entityType: 'user',
        entityId: actor.id,
        previousState: {
          fullName: actor.fullName,
          jobTitle: actor.jobTitle,
          departmentId: actor.departmentId,
        },
        newState: data,
        metadata: { via: 'profile' },
        ip: actor.ip,
      });
    });
  }

  /** Changes the password and signs out every *other* session of the user. */
  async changePassword(actor: Actor, currentSessionId: string, input: unknown): Promise<number> {
    const limit = await this.deps.rateLimiter.hit(RATE_LIMITS.passwordChange, actor.id);
    if (!limit.allowed) throw tooManyRequests(limit.retryAfterSeconds);
    const data = parse(ChangePasswordSchema, input);
    const stored = await userRepository.passwordHash(this.deps.db, actor.id);
    if (!stored || !(await verifyPassword(data.currentPassword, stored))) {
      this.deps.log.warn({ userId: actor.id, reason: 'bad_current_password' }, 'authentication failure');
      throw validationError({ currentPassword: 'Your current password is incorrect.' });
    }
    const hash = await hashPassword(data.newPassword);
    await withTransaction(this.deps.db, async (tx) => {
      await userRepository.setPassword(tx, actor.id, hash);
      await AuditService.record(tx, {
        actorId: actor.id,
        action: 'PASSWORD_CHANGED',
        entityType: 'user',
        entityId: actor.id,
        ip: actor.ip,
      });
    });
    return this.deps.sessions.destroyAllForUser(actor.id, currentSessionId);
  }
}
