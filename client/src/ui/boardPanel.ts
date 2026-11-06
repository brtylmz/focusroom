import { CHARACTERS, tr, type ActivityStatus, type StudyBoard, type StudyRow } from '@focusroom/shared';
import { el } from './dom.js';
import { thumbnailFor } from './thumbnails.js';

type SortMode = 'study' | 'name';

const STATUS_CLASS: Record<ActivityStatus, string> = {
  focus: 'focus',
  break: 'break',
  idle: '',
  standing: '',
};

const ACCENT = new Map(CHARACTERS.map((c) => [c.id, c.accent]));

export class BoardPanel {
  readonly element: HTMLElement;
  private readonly total: HTMLElement;
  private readonly tbody: HTMLElement;
  private readonly sortButtons: Record<SortMode, HTMLButtonElement>;
  private board: StudyBoard | null = null;
  private sort: SortMode = 'study';

  constructor(
    private readonly selfId: string,
    private readonly mutes: Set<string>,
    private readonly onMutesChanged: () => void,
    private readonly onToggle: (open: boolean) => void,
  ) {
    this.total = el('div', { class: 'room-today' });
    this.tbody = el('tbody');
    this.sortButtons = {
      study: el('button', { class: 'small', text: tr.board.sortStudy, on: { click: () => this.setSort('study') } }),
      name: el('button', { class: 'small', text: tr.board.sortName, on: { click: () => this.setSort('name') } }),
    };
    const table = el('table', { class: 'board-table' }, [
      el('thead', {}, [
        el('tr', {}, [
          el('th', { text: tr.board.colName }),
          el('th', { text: tr.board.colVisit }),
          el('th', { text: tr.board.colToday }),
          el('th', { text: tr.board.colStatus }),
        ]),
      ]),
      this.tbody,
    ]);
    const body = el('div', { class: 'collapsible-body' }, [
      this.total,
      el('div', { class: 'row-buttons' }, [this.sortButtons.study, this.sortButtons.name]),
      el('div', { class: 'board-scroll' }, [table]),
    ]);
    const header = el('div', { class: 'collapsible-head' }, [
      el('h2', { text: tr.board.heading }),
      el('button', {
        class: 'ghost small',
        text: '−',
        attrs: { 'aria-label': tr.board.heading },
        on: {
          click: (e) => {
            const btn = e.currentTarget as HTMLButtonElement;
            const open = body.hidden;
            body.hidden = !open;
            btn.textContent = open ? '−' : '+';
            this.onToggle(open);
          },
        },
      }),
    ]);
    this.element = el('div', { class: 'panel' }, [header, body]);
    this.refreshSortButtons();
  }

  update(board: StudyBoard): void {
    this.board = board;
    this.render();
  }

  refreshMutes(): void {
    this.render();
  }

  private setSort(mode: SortMode): void {
    this.sort = mode;
    this.refreshSortButtons();
    this.render();
  }

  private refreshSortButtons(): void {
    for (const mode of ['study', 'name'] as const) {
      this.sortButtons[mode].setAttribute('aria-pressed', String(this.sort === mode));
    }
  }

  private render(): void {
    if (!this.board) return;
    const h = Math.floor(this.board.roomTodayMinutes / 60);
    const m = this.board.roomTodayMinutes % 60;
    this.total.textContent = tr.board.roomToday(h, m);

    const rows = [...this.board.rows];
    if (this.sort === 'name') rows.sort((a, b) => a.nickname.localeCompare(b.nickname, 'tr'));
    this.tbody.replaceChildren();
    if (rows.length === 0) {
      this.tbody.append(el('tr', {}, [el('td', { attrs: { colspan: '4' }, text: tr.board.empty })]));
      return;
    }
    for (const row of rows) this.tbody.append(this.renderRow(row));
  }

  private renderRow(row: StudyRow): HTMLElement {
    const mine = row.playerId === this.selfId;
    const cls = [mine ? 'me' : '', row.connected ? '' : 'away'].filter(Boolean).join(' ');
    const avatar = thumbnailFor(row.characterId);
    const chip = el('span', { class: 'thumb-sm' });
    if (avatar) {
      chip.style.backgroundImage = `url(${avatar})`;
      chip.style.backgroundSize = 'cover';
    } else {
      chip.style.background = ACCENT.get(row.characterId) ?? '#888';
    }
    const name = el('span', { class: 'board-name', attrs: { title: row.nickname } }, [
      chip,
      el('span', { text: mine ? `${row.nickname} ${tr.board.you}` : row.nickname }),
    ]);
    const statusKey = row.connected ? row.status : 'standing';
    const statusText = row.connected ? tr.pomodoro.status[statusKey === 'standing' ? 'standing' : statusKey] : tr.board.away;
    const pill = el('span', { class: `status-pill ${STATUS_CLASS[row.status]}`, text: statusText });
    const personContent = [name];
    if (!mine) {
      const muted = this.mutes.has(row.playerId);
      const label = muted ? tr.chat.unmute : tr.chat.mute;
      personContent.push(
        el('button', {
          class: 'ghost small board-mute',
          text: label,
          attrs: { title: label, 'aria-label': `${label}: ${row.nickname}` },
          on: { click: () => this.toggleMute(row.playerId) },
        }),
      );
    }
    return el('tr', { class: cls }, [
      el('td', {}, [el('div', { class: 'board-person' }, personContent)]),
      el('td', { attrs: { 'data-label': tr.board.colVisit }, text: tr.board.minutes(row.visitMinutes) }),
      el('td', { attrs: { 'data-label': tr.board.colToday }, text: tr.board.minutes(row.todayMinutes) }),
      el('td', { attrs: { 'data-label': tr.board.colStatus } }, [pill]),
    ]);
  }

  private toggleMute(playerId: string): void {
    if (this.mutes.has(playerId)) this.mutes.delete(playerId);
    else this.mutes.add(playerId);
    this.onMutesChanged();
    this.render();
  }
}
