import { modalIn, modalOut } from '../animations/modal';

let lastFocus: HTMLElement | null = null;

const focusables = (root: HTMLElement) =>
  Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([type=hidden]):not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  );

/** Called when HTMX swaps a modal into #modal-root. */
export function openModal(modal: HTMLElement): void {
  lastFocus = (document.activeElement as HTMLElement) ?? null;
  modalIn(modal);
  const target =
    modal.querySelector<HTMLElement>('[autofocus]') ?? focusables(modal)[1] ?? focusables(modal)[0];
  window.setTimeout(() => target?.focus(), 60);
}

export async function closeModal(): Promise<void> {
  const root = document.getElementById('modal-root');
  const modal = root?.querySelector<HTMLElement>('.modal');
  if (!root || !modal) return;
  await modalOut(modal);
  root.innerHTML = '';
  lastFocus?.focus();
}

/** Keeps Tab inside an open modal. */
export function trapFocus(e: KeyboardEvent): void {
  const modal = document.querySelector<HTMLElement>('#modal-root .modal, .modal.confirm');
  if (!modal || e.key !== 'Tab') return;
  const items = focusables(modal);
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) return;
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

/**
 * Styled replacement for window.confirm used by every [data-confirm] HTMX action.
 * Built with DOM APIs and textContent so the question can never inject markup.
 */
export function confirmDialog(question: string, confirmLabel = 'Confirm'): Promise<boolean> {
  return new Promise((resolve) => {
    const prev = document.activeElement as HTMLElement | null;
    const modal = document.createElement('div');
    modal.className = 'modal confirm';
    modal.setAttribute('role', 'alertdialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `<div class="modal-scrim"></div><div class="modal-card cream" style="width:min(440px,100%)"><span class="eyebrow">Please confirm</span><h2></h2><div class="form-actions"><button type="button" class="btn btn-cream" data-no>Cancel</button><button type="button" class="btn btn-danger-cream" data-yes></button></div></div>`;
    modal.querySelector('h2')!.textContent = question;
    modal.querySelector('[data-yes]')!.textContent = confirmLabel;
    document.body.append(modal);
    modalIn(modal);
    const yes = modal.querySelector<HTMLButtonElement>('[data-yes]')!;
    yes.focus();
    const done = async (result: boolean) => {
      document.removeEventListener('keydown', onKey);
      await modalOut(modal);
      modal.remove();
      prev?.focus();
      resolve(result);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void done(false);
    };
    document.addEventListener('keydown', onKey);
    yes.addEventListener('click', () => void done(true));
    modal.querySelector('[data-no]')!.addEventListener('click', () => void done(false));
    modal.querySelector('.modal-scrim')!.addEventListener('click', () => void done(false));
  });
}
