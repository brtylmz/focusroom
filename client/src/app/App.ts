import {
  CHARACTERS,
  ENVIRONMENTS,
  sanitizeNickname,
  tr,
  type CharacterId,
  type EnvironmentId,
  type EnvironmentSummary,
} from '@focusroom/shared';
import { fetchEnvironments } from '../network/api.js';
import { CharacterPreview } from '../ui/characterPreview.js';
import { el } from '../ui/dom.js';
import { openSettingsPanel } from '../ui/settingsPanel.js';
import { openStatsPanel } from '../ui/statsPanel.js';
import { showToast } from '../ui/toast.js';
import { ensureThumbnails, thumbnailFor } from '../ui/thumbnails.js';
import { RoomScreen } from './RoomScreen.js';
import { browserStatsStore, type StatsStore } from './stats.js';
import {
  loadMutes,
  loadProfile,
  loadSettings,
  saveProfile,
  saveSettings,
  type Profile,
  type Settings,
} from './storage.js';

const LOBBY_POLL_MS = 10_000;

interface Screen {
  readonly element: HTMLElement;
  dispose(): void;
}

/** Top-level router: login, lobby, and room. Only one screen is mounted at a time. */
export class App {
  private settings: Settings = loadSettings();
  private profile: Profile | null = loadProfile();
  private readonly stats: StatsStore = browserStatsStore();
  private readonly mutes: Set<string> = loadMutes();
  private screen: Screen | null = null;
  private room: RoomScreen | null = null;

  constructor(private readonly root: HTMLElement) {}

  start(): void {
    this.applyBodyClasses();
    if (this.profile) this.showLobby();
    else this.showLogin();
  }

  private show(screen: Screen): void {
    this.screen?.dispose();
    this.screen = screen;
    this.room = screen instanceof RoomScreen ? screen : null;
    this.root.replaceChildren(screen.element);
  }

  private showLogin(): void {
    let selected: CharacterId = this.profile?.characterId ?? CHARACTERS[0]?.id ?? 'character-a';
    let preview: CharacterPreview | null = null;

    const nickname = el('input', {
      attrs: { maxlength: '16', autocomplete: 'off', value: this.profile?.nickname ?? '' },
    });
    const errorText = el('p', { class: 'error-text', attrs: { role: 'alert' } });
    errorText.hidden = true;
    const caption = el('div', { class: 'preview-caption' });
    const canvas = el('canvas', { class: 'preview-canvas', attrs: { 'aria-label': tr.login.character } });

    const cards = CHARACTERS.map((character) => {
      const thumb = el('span', { class: 'thumb' });
      const swatch = el('span', { class: 'swatch' });
      swatch.style.background = character.accent;
      const card = el(
        'button',
        {
          class: 'card',
          attrs: { type: 'button', 'aria-pressed': 'false' },
          on: { click: () => choose(character.id) },
        },
        [thumb, el('span', { class: 'card-title' }, [swatch, character.label])],
      );
      return { id: character.id, label: character.label, card, thumb };
    });

    const choose = (id: CharacterId): void => {
      selected = id;
      for (const item of cards) item.card.setAttribute('aria-pressed', String(item.id === id));
      caption.textContent = cards.find((item) => item.id === id)?.label ?? '';
      if (preview) preview.show(id).catch(() => showToast(tr.errors['server-error'], 'error'));
    };

    const submit = (): void => {
      const result = sanitizeNickname(nickname.value);
      if (!result.ok) {
        errorText.textContent = tr.login.invalidNickname;
        errorText.hidden = false;
        return;
      }
      const next: Profile = { nickname: result.value, characterId: selected };
      this.profile = next;
      saveProfile(next);
      this.showLobby();
    };

    const form = el(
      'form',
      {
        class: 'panel login-form-card',
        on: {
          submit: (event) => {
            event.preventDefault();
            submit();
          },
        },
      },
      [
        el('h2', { text: tr.login.heading }),
        el('label', { class: 'field' }, [tr.login.nickname, nickname]),
        el('p', { class: 'hint', text: tr.login.nicknameHint }),
        errorText,
        el('button', { class: 'primary', text: tr.login.enter, attrs: { type: 'submit' } }),
      ],
    );

    const previewBlock = el('div', { class: 'preview-wrap panel' }, [canvas, caption]);
    const picker = el('section', { class: 'panel' }, [
      el('h2', { text: tr.login.character }),
      el(
        'div',
        { class: 'character-grid' },
        cards.map((item) => item.card),
      ),
    ]);

    this.show({
      element: el('div', { class: 'screen' }, [
        el('div', { class: 'screen-head' }, [el('h1', { text: tr.app.title })]),
        el('div', { class: 'login' }, [el('div', { class: 'login-form' }, [previewBlock, form]), picker]),
      ]),
      dispose: () => preview?.dispose(),
    });

    preview = new CharacterPreview(canvas);
    choose(selected);

    const paint = (): void => {
      for (const item of cards) {
        const url = thumbnailFor(item.id);
        if (!url) continue;
        item.thumb.style.backgroundImage = `url("${url}")`;
        item.thumb.style.backgroundSize = 'contain';
        item.thumb.style.backgroundRepeat = 'no-repeat';
        item.thumb.style.backgroundPosition = 'center';
      }
    };
    ensureThumbnails().then(paint).catch(() => undefined);
  }

  private showLobby(): void {
    const profile = this.profile;
    if (!profile) {
      this.showLogin();
      return;
    }

    const status = el('p', { class: 'hint', attrs: { role: 'status' } });
    const grid = el('div', { class: 'lobby-grid' });

    const load = (): void => {
      fetchEnvironments()
        .then((list) => {
          grid.replaceChildren(...list.map((summary) => this.environmentCard(summary)));
          status.textContent = '';
        })
        .catch(() => {
          status.textContent = tr.lobby.loadError;
        });
    };
    load();
    const timer = window.setInterval(load, LOBBY_POLL_MS);

    this.show({
      element: el('div', { class: 'screen' }, [
        el('div', { class: 'screen-head' }, [
          el('div', {}, [el('h1', { text: tr.app.title }), el('p', { class: 'hint', text: profile.nickname })]),
          el('div', { class: 'row-buttons' }, [
            el('button', { text: tr.room.stats, on: { click: () => openStatsPanel(this.stats) } }),
            el('button', { text: tr.room.settings, on: { click: () => this.openSettings() } }),
            el('button', { text: tr.app.logout, on: { click: () => this.showLogin() } }),
          ]),
        ]),
        el('h2', { text: tr.lobby.heading }),
        status,
        grid,
      ]),
      dispose: () => window.clearInterval(timer),
    });
  }

  private environmentCard(summary: EnvironmentSummary): HTMLElement {
    const theme = ENVIRONMENTS.find((env) => env.id === summary.id)?.theme;
    const art = el('div', { class: 'env-art' });
    if (theme) art.style.background = `linear-gradient(180deg, ${theme.sky}, ${theme.ground})`;

    const fill = el('span');
    const ratio = summary.capacity > 0 ? summary.openInstancePlayers / summary.capacity : 0;
    fill.style.width = `${Math.min(100, ratio * 100)}%`;
    const bar = el(
      'div',
      {
        class: 'capacity-bar',
        attrs: {
          role: 'progressbar',
          'aria-valuemin': '0',
          'aria-valuemax': String(summary.capacity),
          'aria-valuenow': String(summary.openInstancePlayers),
        },
      },
      [fill],
    );

    const fullInstance = summary.openInstancePlayers >= summary.capacity;
    return el(
      'button',
      {
        class: 'panel env-card',
        attrs: { type: 'button' },
        on: { click: () => this.enterRoom(summary.id) },
      },
      [
        art,
        el('div', { class: 'env-body' }, [
          el('strong', { text: summary.name }),
          el('p', { class: 'hint', text: summary.description }),
          bar,
          el('div', { class: 'env-meta' }, [
            el('span', { text: tr.lobby.open(summary.openInstancePlayers, summary.capacity) }),
            el('span', { text: tr.lobby.capacity(summary.capacity) }),
          ]),
          el('div', { class: 'env-meta' }, [
            el('span', { text: tr.lobby.total(summary.totalPlayers) }),
            fullInstance ? el('span', { text: tr.lobby.newInstance }) : null,
          ]),
        ]),
      ],
    );
  }

  private enterRoom(environmentId: EnvironmentId): void {
    const profile = this.profile;
    if (!profile) {
      this.showLogin();
      return;
    }
    const room = new RoomScreen({
      environmentId,
      profile,
      settings: this.settings,
      stats: this.stats,
      mutes: this.mutes,
      onLeave: () => this.showLobby(),
      openSettings: () => this.openSettings(),
      openStats: () => openStatsPanel(this.stats),
    });
    this.show(room);
    void room.start();
  }

  private openSettings(): void {
    openSettingsPanel(this.settings, () => this.onSettingsChanged());
  }

  private onSettingsChanged(): void {
    saveSettings(this.settings);
    this.applyBodyClasses();
    this.room?.applySettings();
  }

  private applyBodyClasses(): void {
    const body = document.body;
    body.classList.toggle('theme-dark', this.settings.theme !== 'light');
    body.classList.toggle('theme-light', this.settings.theme === 'light');
    body.classList.toggle('reduced-motion', this.settings.reducedMotion);
  }
}
