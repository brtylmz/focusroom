import {
  isSpam,
  maskBlockedWords,
  normalizeForCompare,
  sanitizeChatText,
  type ErrorCode,
} from '@focusroom/shared';

export const DUPLICATE_WINDOW_MS = 15_000;

export interface PreviousMessage {
  text: string;
  at: number;
}

export type ModerationResult = { ok: true; text: string } | { ok: false; error: ErrorCode };

export function moderateChat(
  raw: unknown,
  previous: PreviousMessage | null,
  now: number,
  blocklist: readonly string[],
): ModerationResult {
  const sanitized = sanitizeChatText(raw);
  if (!sanitized.ok) return { ok: false, error: 'message-invalid' };
  const text = sanitized.value;
  if (isSpam(text)) return { ok: false, error: 'message-spam' };
  if (
    previous &&
    now - previous.at < DUPLICATE_WINDOW_MS &&
    normalizeForCompare(previous.text) === normalizeForCompare(text)
  ) {
    return { ok: false, error: 'message-duplicate' };
  }
  return { ok: true, text: maskBlockedWords(text, blocklist) };
}
