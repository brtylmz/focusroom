import {
  DEFAULT_POMODORO,
  isCharacterId,
  sanitizeNickname,
  type CharacterId,
  type PomodoroSettings,
} from '@focusroom/shared';

const KEYS = {
  profile: 'focusroom.profile.v1',
  settings: 'focusroom.settings.v1',
  mutes: 'focusroom.mutes.v1',
  session: 'focusroom.session',
} as const;

export interface Profile {
  nickname: string;
  characterId: CharacterId;
}

export interface Settings {
  theme: 'dark' | 'light';
  quality: 'low' | 'medium' | 'high';
  reducedMotion: boolean;
  pomodoro: PomodoroSettings;
  autoPauseOnStand: boolean;
  chatSound: boolean;
  bubbles: boolean;
  /** Silences chat sounds and bubbles while the focus timer is running. */
  quietWhileFocusing: boolean;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function loadProfile(): Profile | null {
  const raw = readJson<Partial<Profile> | null>(KEYS.profile, null);
  if (!raw) return null;
  const nickname = sanitizeNickname(raw.nickname);
  if (!nickname.ok || !isCharacterId(raw.characterId)) return null;
  return { nickname: nickname.value, characterId: raw.characterId };
}

export function saveProfile(profile: Profile): void {
  localStorage.setItem(KEYS.profile, JSON.stringify(profile));
}

export function defaultSettings(): Settings {
  const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  return {
    theme: 'dark',
    quality: 'medium',
    reducedMotion: prefersReduced,
    pomodoro: { ...DEFAULT_POMODORO },
    autoPauseOnStand: true,
    chatSound: true,
    bubbles: true,
    quietWhileFocusing: true,
  };
}

export function loadSettings(): Settings {
  const base = defaultSettings();
  const stored = readJson<Partial<Settings>>(KEYS.settings, {});
  const pomodoro = { ...base.pomodoro, ...(stored.pomodoro ?? {}) };
  return {
    ...base,
    ...stored,
    pomodoro: {
      focusMinutes: clampInt(pomodoro.focusMinutes, 1, 120, DEFAULT_POMODORO.focusMinutes),
      shortBreakMinutes: clampInt(pomodoro.shortBreakMinutes, 1, 60, DEFAULT_POMODORO.shortBreakMinutes),
      longBreakMinutes: clampInt(pomodoro.longBreakMinutes, 1, 90, DEFAULT_POMODORO.longBreakMinutes),
      cyclesBeforeLongBreak: clampInt(pomodoro.cyclesBeforeLongBreak, 1, 10, DEFAULT_POMODORO.cyclesBeforeLongBreak),
    },
  };
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(KEYS.settings, JSON.stringify(settings));
}

export function loadMutes(): Set<string> {
  const list = readJson<string[]>(KEYS.mutes, []);
  return new Set(Array.isArray(list) ? list.filter((v) => typeof v === 'string') : []);
}

export function saveMutes(mutes: Set<string>): void {
  localStorage.setItem(KEYS.mutes, JSON.stringify([...mutes]));
}

/** Per-tab identity: each browser tab is a separate visitor so two tabs show two avatars. */
export function getSessionId(): string {
  const existing = sessionStorage.getItem(KEYS.session);
  if (existing) return existing;
  const id = newId();
  sessionStorage.setItem(KEYS.session, id);
  return id;
}

function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}
