import { toastIn, toastOut } from '../animations/notification';

export type ToastInput = {
  type?: 'success' | 'error' | 'info' | 'warning';
  message: string;
  title?: string;
  href?: string;
};

const TONES = {
  success: 'var(--good)',
  error: 'var(--bad)',
  info: 'var(--ice)',
  warning: 'var(--warn)',
} as const;

/** Glass toast. Content is set via textContent — never innerHTML — so server text cannot inject markup. */
export function toast(input: ToastInput): void {
  const region = document.getElementById('toasts');
  if (!region || !input.message) return;
  const el = document.createElement('div');
  el.className = 'toast glass';
  el.setAttribute('role', input.type === 'error' ? 'alert' : 'status');
  el.style.setProperty('--tone', TONES[input.type ?? 'success']);

  const dot = document.createElement('span');
  dot.className = 't-dot';
  const body = document.createElement('div');
  body.className = 't-body';
  if (input.title) {
    const strong = document.createElement('strong');
    strong.textContent = input.title;
    body.append(strong);
  }
  if (input.href && input.href.startsWith('/')) {
    const a = document.createElement('a');
    a.href = input.href;
    a.textContent = input.message;
    body.append(a);
  } else {
    body.append(document.createTextNode(input.message));
  }
  const close = document.createElement('button');
  close.className = 't-close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Dismiss');
  close.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  el.append(dot, body, close);
  region.append(el);
  toastIn(el);

  let removed = false;
  const remove = async () => {
    if (removed) return;
    removed = true;
    await toastOut(el);
    el.remove();
  };
  close.addEventListener('click', remove);
  window.setTimeout(remove, input.type === 'error' ? 8000 : 5000);
  // Keep at most four toasts on screen.
  while (region.children.length > 4) region.firstElementChild?.remove();
}
