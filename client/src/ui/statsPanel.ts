import { tr } from '@focusroom/shared';
import type { StatsStore } from '../app/stats.js';
import { el } from './dom.js';
import { openModal } from './modal.js';

interface StatCell {
  readonly box: HTMLElement;
  readonly value: HTMLElement;
}

function statCell(label: string): StatCell {
  const value = el('strong');
  const box = el('div', { class: 'stat' }, [value, el('span', { text: label })]);
  return { box, value };
}

function hoursAndMinutes(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  return tr.stats.hm(Math.floor(minutes / 60), minutes % 60);
}

/** Opens the personal statistics dialog. Values are read from the store on open and again after a reset. */
export function openStatsPanel(stats: StatsStore): void {
  const today = statCell(tr.stats.today);
  const week = statCell(tr.stats.week);
  const pomodoros = statCell(tr.stats.pomodoros);
  const streak = statCell(tr.stats.streak);

  const refresh = (): void => {
    const record = stats.today();
    today.value.textContent = hoursAndMinutes(record.focusMs);
    week.value.textContent = hoursAndMinutes(stats.weekFocusMs());
    pomodoros.value.textContent = String(record.pomodoros);
    streak.value.textContent = tr.stats.days(stats.streak());
  };
  refresh();

  const reset = el('button', {
    class: 'danger',
    text: tr.stats.reset,
    on: {
      click: () => {
        if (!window.confirm(tr.stats.resetConfirm)) return;
        stats.reset();
        refresh();
      },
    },
  });

  openModal(tr.stats.heading, [
    el('div', { class: 'stats-grid' }, [today.box, week.box, pomodoros.box, streak.box]),
    el('div', { class: 'row-buttons' }, [reset]),
  ]);
}
