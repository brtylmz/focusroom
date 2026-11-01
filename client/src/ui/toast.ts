import { el } from './dom.js';

type ToastKind = 'info' | 'success' | 'error';

let container: HTMLElement | null = null;

export function showToast(text: string, kind: ToastKind = 'info', durationMs = 4_000): void {
  if (!container) {
    container = el('div', { class: 'toast-stack', attrs: { role: 'status', 'aria-live': 'polite' } });
    document.body.append(container);
  }
  const toast = el('div', { class: `toast toast-${kind}`, text });
  container.append(toast);
  window.setTimeout(() => {
    toast.classList.add('toast-leave');
    window.setTimeout(() => toast.remove(), 300);
  }, durationMs);
}
