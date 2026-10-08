import { productRepository } from '../repositories/productRepository.js';
import { requestRepository } from '../repositories/requestRepository.js';
import { statsRepository } from '../repositories/statsRepository.js';
import { knowledgeRepository } from '../repositories/knowledgeRepository.js';
import type { Presence } from '../redis/presence.js';
import { forbidden } from '../utils/errors.js';
import type { RequestStatus } from '../workflow/definition.js';
import type { Actor, ServiceDeps } from './types.js';

export const MONITOR_LANES: { status: RequestStatus; title: string; hint: string }[] = [
  { status: 'SUBMITTED', title: 'Submitted', hint: 'Waiting for a reviewer' },
  { status: 'UNDER_REVIEW', title: 'Under review', hint: 'Pending approval' },
  { status: 'APPROVED', title: 'Approved', hint: 'Ready for operations' },
  { status: 'PROCESSING', title: 'Processing', hint: 'Operations at work' },
  { status: 'COMPLETED', title: 'Completed', hint: 'Recently closed' },
];

/** Read models for the Overview and the real-time Monitor. */
export class DashboardService {
  constructor(
    private readonly deps: ServiceDeps,
    private readonly presence: Presence,
  ) {}

  private scope(actor: Actor): string | undefined {
    return actor.permissions.has('request:read:all') ? undefined : actor.id;
  }

  async overview(actor: Actor) {
    const scope = this.scope(actor);
    const db = this.deps.db;
    const [counters, distribution, inventory, activity, recent, volume, cycle, attention, articles] =
      await Promise.all([
        statsRepository.requestCounters(db, scope),
        statsRepository.statusDistribution(db, scope),
        productRepository.inventoryCounts(db),
        statsRepository.recentActivity(db, 8, scope ? ['product'] : undefined),
        requestRepository.list(db, { visibleToUserId: scope }, 'updated', 'desc', 1, 6),
        statsRepository.dailyVolume(db, 14),
        statsRepository.averageCycleHours(db),
        productRepository.attention(db, 5),
        knowledgeRepository.latest(db, 3),
      ]);
    return {
      counters,
      distribution,
      inventory,
      activity,
      recent: recent.items,
      volume,
      cycleHours: cycle,
      attention,
      articles,
    };
  }

  async monitor(actor: Actor) {
    if (!actor.permissions.has('monitor:view')) throw forbidden();
    const scope = this.scope(actor);
    const db = this.deps.db;
    const distribution = await statsRepository.statusDistribution(db, scope);
    const lanes = await Promise.all(
      MONITOR_LANES.map(async (lane) => ({
        ...lane,
        requests: (
          await requestRepository.list(
            db,
            { status: lane.status, visibleToUserId: scope },
            'updated',
            'desc',
            1,
            6,
          )
        ).items,
        total: distribution[lane.status] ?? 0,
      })),
    );
    const [counters, inventory, attention, movements, activity, viewers] = await Promise.all([
      statsRepository.requestCounters(db, scope),
      productRepository.inventoryCounts(db),
      productRepository.attention(db, 10),
      productRepository.recentMovements(db, 8),
      statsRepository.recentActivity(db, 14, scope ? ['product'] : undefined),
      this.presence.count('online'),
    ]);
    return { counters, inventory, lanes, attention, movements, activity, viewers };
  }

  /** A single request as a monitor card, if the actor may see it and it belongs on the board. */
  async laneCard(actor: Actor, requestId: string) {
    const r = await requestRepository.findById(this.deps.db, requestId);
    if (!r) return null;
    const visible =
      actor.permissions.has('request:read:all') || r.requesterId === actor.id || r.assigneeId === actor.id;
    return visible ? r : null;
  }

  async watchItem(productId: string) {
    return productRepository.findById(this.deps.db, productId);
  }

  activitySince(actor: Actor, afterId: number) {
    return statsRepository.activityAfter(
      this.deps.db,
      afterId,
      10,
      this.scope(actor) ? ['product'] : undefined,
    );
  }

  movementsSince(afterId: number) {
    return productRepository.movementsAfter(this.deps.db, afterId, 10);
  }

  /** Aggregate, non-sensitive figures for the public landing page (cached briefly in Redis). */
  publicStats() {
    return this.deps.cache.getOrSet('landing-stats', 60, async () => {
      const { rows } = await this.deps.db.query<{
        requests: number;
        products: number;
        events: number;
        users: number;
        completed: number;
      }>(
        `SELECT (SELECT count(*)::int FROM requests) AS requests,
                (SELECT count(*)::int FROM products) AS products,
                (SELECT count(*)::int FROM audit_logs) AS events,
                (SELECT count(*)::int FROM users WHERE is_active) AS users,
                (SELECT count(*)::int FROM requests WHERE status = 'COMPLETED') AS completed`,
      );
      return rows[0]!;
    });
  }

  counters(actor: Actor) {
    return statsRepository.requestCounters(this.deps.db, this.scope(actor));
  }
}
