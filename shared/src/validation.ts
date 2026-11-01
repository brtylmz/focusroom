import { LIMITS } from './config.js';
import type { EnvironmentId, StudyMode } from './types.js';

export type ValidationResult = { ok: true; value: string } | { ok: false };

const NICKNAME_PATTERN = /^[\p{L}\p{N}_. -]+$/u;
const SESSION_PATTERN = /^[A-Za-z0-9-]{8,64}$/;
const MODES: readonly StudyMode[] = ['focus', 'break', 'idle'];
const ENVIRONMENT_IDS: readonly EnvironmentId[] = ['library', 'cafe', 'park', 'office'];

export function stripControlAndMarkup(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, ' ')
    // Control characters are stripped on purpose.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sanitizeNickname(raw: unknown): ValidationResult {
  if (typeof raw !== 'string' || raw.length > 100) return { ok: false };
  const value = stripControlAndMarkup(raw);
  const length = [...value].length;
  if (length < LIMITS.nicknameMin || length > LIMITS.nicknameMax) return { ok: false };
  if (!NICKNAME_PATTERN.test(value)) return { ok: false };
  return { ok: true, value };
}

export function sanitizeChatText(raw: unknown): ValidationResult {
  if (typeof raw !== 'string' || raw.length > 1000) return { ok: false };
  const value = stripControlAndMarkup(raw);
  const length = [...value].length;
  if (length < 1 || length > LIMITS.chatMaxLength) return { ok: false };
  return { ok: true, value };
}

export function isSpam(text: string): boolean {
  return /(.)\1{11,}/u.test(text);
}

export function normalizeForCompare(text: string): string {
  return text.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
}

export function maskBlockedWords(text: string, words: readonly string[]): string {
  let result = text;
  for (const word of words) {
    const trimmed = word.trim();
    if (!trimmed) continue;
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])(${escaped})(?=$|[^\\p{L}\\p{N}])`, 'giu');
    result = result.replace(pattern, (_m, lead: string, hit: string) => `${lead}${'*'.repeat([...hit].length)}`);
  }
  return result;
}

export function isSessionId(value: unknown): value is string {
  return typeof value === 'string' && SESSION_PATTERN.test(value);
}

export function isEnvironmentId(value: unknown): value is EnvironmentId {
  return ENVIRONMENT_IDS.some((id) => id === value);
}

export function isStudyMode(value: unknown): value is StudyMode {
  return MODES.some((m) => m === value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
