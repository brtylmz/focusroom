import { describe, expect, it } from 'vitest';
import { ENVIRONMENTS, validateEnvironment } from './environments/index.js';
import { buildWalkMap, findStandSpot, isWalkable, resolveMove, facingVector } from './geometry.js';
import { maskBlockedWords, sanitizeChatText, sanitizeNickname, isSpam, isSessionId } from './validation.js';

describe('environment data', () => {
  it('loads all four environments without validation errors', () => {
    expect(ENVIRONMENTS.map((e) => e.id)).toEqual(['library', 'cafe', 'park', 'office']);
    for (const env of ENVIRONMENTS) {
      expect(validateEnvironment(env)).toEqual([]);
    }
  });

  it('matches the capacities required by the specification', () => {
    const capacity = Object.fromEntries(ENVIRONMENTS.map((e) => [e.id, e.capacity]));
    expect(capacity).toEqual({ library: 20, cafe: 16, park: 16, office: 20 });
  });

  it('reports seats outside bounds and duplicate ids', () => {
    const env = structuredClone(ENVIRONMENTS[0]!);
    env.seats[1] = { ...env.seats[1]!, id: env.seats[0]!.id, pozisyon: { x: 99, y: 0, z: 0 } };
    const errors = validateEnvironment(env);
    expect(errors.some((e) => e.includes('duplicate seat'))).toBe(true);
    expect(errors.some((e) => e.includes('outside bounds'))).toBe(true);
  });
});

describe('geometry', () => {
  const library = ENVIRONMENTS[0]!;
  const map = buildWalkMap(library);

  it('blocks positions outside the bounds and inside obstacles', () => {
    expect(isWalkable(map, 0, 0)).toBe(true);
    expect(isWalkable(map, 100, 0)).toBe(false);
    expect(isWalkable(map, -5.0, -2.5)).toBe(false);
  });

  it('slides along a wall instead of stopping dead', () => {
    const from = { x: 0, z: 0 };
    const to = { x: 0.1, z: 100 };
    const moved = resolveMove(map, from, to);
    expect(moved.x).toBe(0.1);
    expect(moved.z).toBe(0);
  });

  it('finds a free spot behind a seat when standing up', () => {
    const seat = library.seats[0]!;
    const spot = findStandSpot(map, seat.pozisyon, seat.yön);
    expect(spot).not.toBeNull();
    expect(isWalkable(map, spot!.x, spot!.z)).toBe(true);
  });

  it('computes facing vectors with 0 degrees pointing to +Z', () => {
    const v = facingVector(0);
    expect(v.x).toBeCloseTo(0);
    expect(v.z).toBeCloseTo(1);
  });
});

describe('validation', () => {
  it('accepts Turkish nicknames and trims spaces', () => {
    expect(sanitizeNickname('  Çağla  ')).toEqual({ ok: true, value: 'Çağla' });
  });

  it('rejects nicknames that are too short, too long or contain markup or symbols', () => {
    expect(sanitizeNickname('a').ok).toBe(false);
    expect(sanitizeNickname('x'.repeat(17)).ok).toBe(false);
    expect(sanitizeNickname('<b>bold</b>').ok).toBe(true);
    expect(sanitizeNickname('<img src=x onerror=alert(1)>').ok).toBe(false);
    expect(sanitizeNickname('ab$%').ok).toBe(false);
  });

  it('strips HTML and control characters from chat messages', () => {
    expect(sanitizeChatText('<script>x</script>selam\u0007')).toEqual({ ok: true, value: 'x selam' });
    expect(sanitizeChatText('   ').ok).toBe(false);
    expect(sanitizeChatText('a'.repeat(201)).ok).toBe(false);
    expect(sanitizeChatText('a'.repeat(200)).ok).toBe(true);
  });

  it('masks blocked words without touching words that merely contain them', () => {
    expect(maskBlockedWords('bu kötü bir gün', ['kötü'])).toBe('bu **** bir gün');
    expect(maskBlockedWords('kötüye kullanım', ['kötü'])).toBe('kötüye kullanım');
  });

  it('detects repetitive spam', () => {
    expect(isSpam('aaaaaaaaaaaaaaa')).toBe(true);
    expect(isSpam('merhaba dünya')).toBe(false);
  });

  it('validates session ids', () => {
    expect(isSessionId('3f2a9c1e-1111-4aaa-8bbb-0123456789ab')).toBe(true);
    expect(isSessionId('short')).toBe(false);
    expect(isSessionId('bad id with spaces')).toBe(false);
  });
});
