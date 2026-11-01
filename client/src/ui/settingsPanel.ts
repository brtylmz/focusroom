import { tr } from '@focusroom/shared';
import type { Settings } from '../app/storage.js';
import { el } from './dom.js';
import { openModal } from './modal.js';

type Option = [value: string, label: string];

function field(label: string, control: HTMLElement): HTMLElement {
  return el('label', { class: 'field' }, [label, control]);
}

function check(label: string, checked: boolean, onValue: (value: boolean) => void): HTMLElement {
  const attrs: Record<string, string> = { type: 'checkbox' };
  if (checked) attrs.checked = '';
  const input = el('input', {
    attrs,
    on: { change: () => onValue(input.checked) },
  });
  return el('label', { class: 'check' }, [input, label]);
}

function select(label: string, current: string, options: Option[], onValue: (value: string) => void): HTMLElement {
  const node = el(
    'select',
    {
      attrs: { 'aria-label': label },
      on: { change: () => onValue(node.value) },
    },
    options.map(([value, text]) => el('option', { text, attrs: value === current ? { value, selected: '' } : { value } })),
  );
  return field(label, node);
}

function minutes(label: string, current: number, min: number, max: number, onValue: (value: number) => void): HTMLElement {
  const input = el('input', {
    attrs: { type: 'number', min: String(min), max: String(max), step: '1', value: String(current) },
    on: {
      change: () => {
        const parsed = Math.round(Number(input.value));
        const next = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : current;
        input.value = String(next);
        onValue(next);
      },
    },
  });
  return field(label, input);
}

/** Opens the settings dialog. Each change mutates `settings` in place and then calls `onChange`. */
export function openSettingsPanel(settings: Settings, onChange: () => void): void {
  const commit = (update: (next: Settings) => void): void => {
    update(settings);
    onChange();
  };

  const syncNotifications = (): void => {
    notifyButton.disabled = typeof Notification === 'undefined' || Notification.permission !== 'default';
  };

  const askNotifications = async (): Promise<void> => {
    if (typeof Notification === 'undefined') return;
    await Notification.requestPermission();
    syncNotifications();
  };

  const notifyButton = el('button', {
    text: tr.settings.notificationsAsk,
    on: { click: () => void askNotifications() },
  });
  syncNotifications();

  const pomodoro = settings.pomodoro;

  openModal(tr.settings.heading, [
    el('div', { class: 'form-grid' }, [
      select(
        tr.settings.theme,
        settings.theme,
        [
          ['dark', tr.settings.themeDark],
          ['light', tr.settings.themeLight],
        ],
        (value) => commit((next) => (next.theme = value === 'light' ? 'light' : 'dark')),
      ),
      select(
        tr.settings.quality,
        settings.quality,
        [
          ['low', tr.settings.qualityLow],
          ['medium', tr.settings.qualityMedium],
          ['high', tr.settings.qualityHigh],
        ],
        (value) =>
          commit((next) => {
            next.quality = value === 'low' ? 'low' : value === 'high' ? 'high' : 'medium';
          }),
      ),
      minutes(tr.settings.focus, pomodoro.focusMinutes, 1, 120, (value) =>
        commit((next) => (next.pomodoro.focusMinutes = value)),
      ),
      minutes(tr.settings.shortBreak, pomodoro.shortBreakMinutes, 1, 60, (value) =>
        commit((next) => (next.pomodoro.shortBreakMinutes = value)),
      ),
      minutes(tr.settings.longBreak, pomodoro.longBreakMinutes, 1, 90, (value) =>
        commit((next) => (next.pomodoro.longBreakMinutes = value)),
      ),
      minutes(tr.settings.cycles, pomodoro.cyclesBeforeLongBreak, 1, 12, (value) =>
        commit((next) => (next.pomodoro.cyclesBeforeLongBreak = value)),
      ),
    ]),
    check(tr.settings.reducedMotion, settings.reducedMotion, (value) => commit((next) => (next.reducedMotion = value))),
    check(tr.settings.autoPause, settings.autoPauseOnStand, (value) =>
      commit((next) => (next.autoPauseOnStand = value)),
    ),
    check(tr.settings.chatSound, settings.chatSound, (value) => commit((next) => (next.chatSound = value))),
    check(tr.settings.bubbles, settings.bubbles, (value) => commit((next) => (next.bubbles = value))),
    check(tr.settings.dnd, settings.quietWhileFocusing, (value) =>
      commit((next) => (next.quietWhileFocusing = value)),
    ),
    field(tr.settings.notifications, notifyButton),
  ]);
}
