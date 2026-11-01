import { describe, expect, it } from 'vitest';
import { interpolateSamples, lerpAngle, pruneSamples, wrapAngle, type Sample } from './interpolation.js';

const s = (t: number, x: number, yaw = 0, moving = true): Sample => ({ t, x, z: 0, yaw, moving });

describe('interpolateSamples', () => {
  it('returns null without samples', () => {
    expect(interpolateSamples([], 0)).toBeNull();
  });

  it('blends linearly between the two surrounding samples', () => {
    const samples = [s(0, 0), s(100, 10)];
    expect(interpolateSamples(samples, 50)?.x).toBeCloseTo(5);
    expect(interpolateSamples(samples, 25)?.x).toBeCloseTo(2.5);
  });

  it('holds the first and last pose outside the sampled range', () => {
    const samples = [s(100, 1), s(200, 2)];
    expect(interpolateSamples(samples, 0)?.x).toBe(1);
    expect(interpolateSamples(samples, 999)?.x).toBe(2);
  });

  it('takes the shortest way around when blending angles', () => {
    const samples = [s(0, 0, Math.PI - 0.1), s(100, 0, -Math.PI + 0.1)];
    const mid = interpolateSamples(samples, 50)!;
    expect(Math.abs(Math.abs(mid.yaw) - Math.PI)).toBeLessThan(0.01);
  });
});

describe('angle helpers', () => {
  it('wraps angles into [-PI, PI)', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(-Math.PI);
    expect(wrapAngle(-0.5)).toBeCloseTo(-0.5);
  });

  it('lerps angles along the short arc', () => {
    expect(lerpAngle(0, Math.PI / 2, 0.5)).toBeCloseTo(Math.PI / 4);
  });
});

describe('pruneSamples', () => {
  it('keeps the bracketing sample before the cutoff and drops older ones', () => {
    const samples = [s(0, 0), s(100, 1), s(200, 2), s(300, 3)];
    pruneSamples(samples, 250);
    expect(samples.map((x) => x.t)).toEqual([200, 300]);
  });
});
