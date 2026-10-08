/**
 * Lifecycle for behaviour attached to server-rendered HTML. Elements opt in with
 * data-module="name". Modules are initialised once per element after every HTMX settle and
 * cleaned up when HTMX removes the element — so swaps never leak listeners, timers or
 * ScrollTriggers, and nothing is initialised twice.
 */
export type Cleanup = () => void;
export type ModuleInit = (root: HTMLElement) => Cleanup | void;

const modules = new Map<string, ModuleInit>();
const mounted = new Map<HTMLElement, Cleanup[]>();
const initialised = new WeakMap<HTMLElement, Set<string>>();

export function defineModule(name: string, init: ModuleInit): void {
  modules.set(name, init);
}

export function mountModules(scope: ParentNode = document): void {
  const candidates: HTMLElement[] = [];
  if (scope instanceof HTMLElement && scope.dataset.module) candidates.push(scope);
  candidates.push(...Array.from(scope.querySelectorAll<HTMLElement>('[data-module]')));
  for (const el of candidates) {
    const names = (el.dataset.module ?? '').split(/\s+/).filter(Boolean);
    const done = initialised.get(el) ?? new Set<string>();
    for (const name of names) {
      if (done.has(name)) continue;
      const init = modules.get(name);
      if (!init) continue;
      done.add(name);
      try {
        const cleanup = init(el);
        if (cleanup) mounted.set(el, [...(mounted.get(el) ?? []), cleanup]);
      } catch (err) {
        console.error(`module ${name} failed to initialise`, err);
      }
    }
    initialised.set(el, done);
  }
}

/** Runs cleanups for modules whose element left the document. */
export function sweepModules(): void {
  for (const [el, cleanups] of mounted) {
    if (el.isConnected) continue;
    for (const c of cleanups) {
      try {
        c();
      } catch (err) {
        console.error('module cleanup failed', err);
      }
    }
    mounted.delete(el);
  }
}
