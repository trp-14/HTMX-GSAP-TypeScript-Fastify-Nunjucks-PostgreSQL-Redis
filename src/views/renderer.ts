import path from 'node:path';
import nunjucks from 'nunjucks';
import { MAIN_PATH, STATUS_META, type RequestStatus } from '../workflow/definition.js';
import { formatBytes } from '../utils/files.js';
import { workflowSteps } from '../workflow/presentation.js';
import { activityView } from './activity.js';

const STATUS_LOOKUP = STATUS_META as Record<string, { label: string; tone: string; step: number }>;

const INVENTORY_META: Record<string, { label: string; tone: string }> = {
  IN_STOCK: { label: 'In stock', tone: 'good' },
  LOW_STOCK: { label: 'Low stock', tone: 'warn' },
  OUT_OF_STOCK: { label: 'Out of stock', tone: 'bad' },
};

const PRIORITY_META: Record<string, { label: string; tone: string }> = {
  LOW: { label: 'Low', tone: 'muted' },
  MEDIUM: { label: 'Medium', tone: 'info' },
  HIGH: { label: 'High', tone: 'warn' },
  URGENT: { label: 'Urgent', tone: 'bad' },
};

const PRODUCT_STATUS_META: Record<string, { label: string; tone: string }> = {
  ACTIVE: { label: 'Active', tone: 'good' },
  INACTIVE: { label: 'Inactive', tone: 'muted' },
  DISCONTINUED: { label: 'Discontinued', tone: 'bad' },
};

const TZ = 'Asia/Jakarta';
const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ });
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: TZ,
});
const moneyFmt = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const numberFmt = new Intl.NumberFormat('en-US');

function toDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function timeAgo(v: unknown, now = Date.now()): string {
  const d = toDate(v);
  if (!d) return '';
  const s = Math.round((now - d.getTime()) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days} d ago`;
  return dateFmt.format(d);
}

/** Configures Nunjucks with autoescaping and presentation-only filters. No business logic lives here. */
export function createViewEnvironment(opts: { root: string; watch: boolean; assetVersion: string }) {
  const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(path.resolve(opts.root), { noCache: opts.watch, watch: false }), {
    autoescape: true,
    throwOnUndefined: false,
    trimBlocks: true,
    lstripBlocks: true,
  });

  env.addFilter('date', (v: unknown) => {
    const d = toDate(v);
    return d ? dateFmt.format(d) : '—';
  });
  env.addFilter('datetime', (v: unknown) => {
    const d = toDate(v);
    return d ? dateTimeFmt.format(d) : '—';
  });
  env.addFilter('iso', (v: unknown) => toDate(v)?.toISOString() ?? '');
  env.addFilter('ago', (v: unknown) => timeAgo(v));
  env.addFilter('money', (v: unknown) => moneyFmt.format(Number(v ?? 0)));
  env.addFilter('num', (v: unknown) => numberFmt.format(Number(v ?? 0)));
  env.addFilter('bytes', (v: unknown) => formatBytes(Number(v ?? 0)));
  env.addFilter('initials', (name: unknown) =>
    String(name ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join(''),
  );
  env.addFilter('statusMeta', (s: unknown) => STATUS_LOOKUP[String(s)] ?? { label: String(s), tone: 'muted', step: 0 });
  env.addFilter('inventoryMeta', (s: unknown) => INVENTORY_META[String(s)] ?? { label: String(s), tone: 'muted' });
  env.addFilter('priorityMeta', (s: unknown) => PRIORITY_META[String(s)] ?? { label: String(s), tone: 'muted' });
  env.addFilter('productStatusMeta', (s: unknown) => PRODUCT_STATUS_META[String(s)] ?? { label: String(s), tone: 'muted' });
  env.addFilter('humanize', (s: unknown) =>
    String(s ?? '')
      .replace(/[._]/g, ' ')
      .toLowerCase()
      .replace(/^\w/, (c) => c.toUpperCase()),
  );
  env.addFilter('pct', (part: unknown, whole: unknown) => {
    const w = Number(whole);
    return w > 0 ? Math.max(0, Math.min(100, Math.round((Number(part) / w) * 100))) : 0;
  });
  /** Builds a query string from the current filters, overriding some keys; empty values are dropped. */
  env.addFilter('qs', (base: Record<string, unknown> | undefined, overrides: Record<string, unknown> = {}) => {
    const merged = { ...(base ?? {}), ...overrides };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
    }
    const s = params.toString();
    return s ? `?${s}` : '';
  });
  /** Maps records to {value, label} options for the select() form macro. */
  env.addFilter('options', (items: Record<string, unknown>[] | undefined, valueKey: string, labelKey: string) =>
    (items ?? []).map((i) => ({ value: i[valueKey], label: i[labelKey] })),
  );
  /** Null-safe loose equality for form state (query strings are strings, ids are numbers). */
  env.addFilter('same', (a: unknown, b: unknown) => a !== undefined && a !== null && b !== undefined && b !== null && String(a) === String(b));
  env.addFilter('max', (values: unknown[]) => Math.max(...values.map(Number)));
  env.addFilter('json', (v: unknown) => JSON.stringify(v ?? null));
  env.addFilter('isOverdue', (due: unknown, status: unknown) => {
    const d = toDate(due);
    return !!d && d.getTime() < Date.now() - 86_400_000 && !['COMPLETED', 'REJECTED', 'DRAFT'].includes(String(status));
  });

  env.addGlobal('assetVersion', opts.assetVersion);
  env.addGlobal('MAIN_PATH', MAIN_PATH);
  env.addGlobal('STATUS_META', STATUS_META);
  env.addGlobal('workflowSteps', workflowSteps);
  env.addGlobal('activityView', activityView);
  env.addGlobal('stepOf', (s: RequestStatus) => STATUS_META[s]?.step ?? 0);
  return env;
}
