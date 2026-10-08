/** Minimal typing for the htmx global (loaded from /assets/vendor/htmx.min.js). */
interface HtmxAjaxOptions {
  target?: Element | string;
  swap?: string;
  source?: Element | string;
  values?: Record<string, unknown>;
  headers?: Record<string, string>;
}
interface Htmx {
  ajax(method: string, url: string, options?: HtmxAjaxOptions): Promise<void>;
  trigger(elt: Element | string, name: string, detail?: unknown): void;
  process(elt: Element): void;
  find(selector: string): Element | null;
  config: Record<string, unknown>;
}
interface HtmxRequestDetail {
  elt: Element;
  target: Element;
  xhr: XMLHttpRequest;
  successful?: boolean;
  failed?: boolean;
  boosted?: boolean;
  requestConfig?: { verb: string; path: string; elt: Element };
  pathInfo?: { requestPath: string };
  shouldSwap?: boolean;
  isError?: boolean;
  issueRequest?: (skipConfirm?: boolean) => void;
  question?: string | null;
}
declare const htmx: Htmx;
interface Window {
  htmx?: Htmx;
}
