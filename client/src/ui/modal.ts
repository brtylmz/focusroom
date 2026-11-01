import { tr } from '@focusroom/shared';
import { el } from './dom.js';

/** Opens a centred dialog. Closes on Escape, backdrop click, or the close button. Returns the close function. */
export function openModal(title: string, content: HTMLElement[]): () => void {
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const close = (): void => {
    if (!backdrop.isConnected) return;
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    previous?.focus();
  };

  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') close();
  };

  const dialog = el(
    'div',
    { class: 'panel modal', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': title } },
    [
      el('div', { class: 'modal-head' }, [
        el('h2', { text: title }),
        el('button', { class: 'ghost small', text: tr.app.close, on: { click: close } }),
      ]),
      ...content,
    ],
  );

  const backdrop = el('div', {
    class: 'modal-backdrop',
    on: {
      click: (event) => {
        if (event.target === backdrop) close();
      },
    },
  }, [dialog]);

  document.body.append(backdrop);
  document.addEventListener('keydown', onKey);
  dialog.querySelector<HTMLElement>('input, select, button')?.focus();
  return close;
}
