import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Flip } from 'gsap/Flip';

gsap.registerPlugin(ScrollTrigger, Flip);
gsap.defaults({ ease: 'power3.out', duration: 0.6 });

/** Users who ask for reduced motion get final states immediately. */
export const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export { gsap, ScrollTrigger, Flip };

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector<T>(sel);
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll<T>(sel));

/** Id of the signed-in user (rendered on #app-root by the app layout), or undefined on public pages. */
export const currentUser = (): string | undefined =>
  document.querySelector<HTMLElement>('#app-root[data-user]')?.dataset.user || undefined;
