import { z } from 'zod';
import { withTransaction } from '../db/transaction.js';
import { settingsRepository } from '../repositories/settingsRepository.js';
import { parse } from '../schemas/validate.js';
import { forbidden } from '../utils/errors.js';
import { AuditService } from './auditService.js';
import type { Actor, ServiceDeps } from './types.js';

const checkbox = z.preprocess((v) => v === 'on' || v === 'true' || v === true, z.boolean());

export const SettingsSchema = z.object({
  organizationName: z.string().trim().min(2, 'Enter the organisation name.').max(80),
  supportEmail: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  defaultDueDays: z.coerce.number().int().min(1, 'At least 1 day.').max(90, 'At most 90 days.'),
  lowStockNotifications: checkbox,
  allowSelfRegistration: checkbox,
  maintenanceBanner: z.string().trim().max(200, 'Keep the banner under 200 characters.'),
});
export type Settings = z.output<typeof SettingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  organizationName: 'Arunika Group',
  supportEmail: 'ops-desk@arunika.co.id',
  defaultDueDays: 5,
  lowStockNotifications: true,
  allowSelfRegistration: true,
  maintenanceBanner: '',
};

const CACHE_KEY = 'system-settings';

/** System configuration: persisted in PostgreSQL, read through a Redis cache. */
export class SettingsService {
  constructor(private readonly deps: ServiceDeps) {}

  async get(): Promise<Settings> {
    const stored = await this.deps.cache.getOrSet(CACHE_KEY, 300, () => settingsRepository.all(this.deps.db));
    return { ...DEFAULT_SETTINGS, ...(stored as Partial<Settings>) };
  }

  async update(actor: Actor, input: unknown): Promise<Settings> {
    if (!actor.permissions.has('settings:manage')) throw forbidden();
    const next = parse(SettingsSchema, input);
    const previous = await this.get();
    await withTransaction(this.deps.db, async (tx) => {
      for (const [key, value] of Object.entries(next))
        await settingsRepository.upsert(tx, key, value, actor.id);
      const changed = Object.keys(next).filter(
        (k) => previous[k as keyof Settings] !== next[k as keyof Settings],
      );
      await AuditService.record(tx, {
        actorId: actor.id,
        action: 'SETTINGS_UPDATED',
        entityType: 'settings',
        entityId: 'system',
        previousState: Object.fromEntries(changed.map((k) => [k, previous[k as keyof Settings]])),
        newState: Object.fromEntries(changed.map((k) => [k, next[k as keyof Settings]])),
        ip: actor.ip,
      });
    });
    await this.deps.cache.invalidate(CACHE_KEY);
    return next;
  }
}
