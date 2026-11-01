export interface Sample {
  t: number;
  x: number;
  z: number;
  yaw: number;
  moving: boolean;
}

export function lerpAngle(a: number, b: number, k: number): number {
  const delta = wrapAngle(b - a);
  return a + delta * k;
}

export function wrapAngle(angle: number): number {
  const twoPi = Math.PI * 2;
  return ((((angle + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
}

/**
 * Returns the pose at time `t` by blending the two samples around it.
 * Samples must be sorted by time. Holds the first/last sample outside the range.
 */
export function interpolateSamples(samples: readonly Sample[], t: number): Sample | null {
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (!first || !last) return null;
  if (t <= first.t) return first;
  if (t >= last.t) return last;
  for (let i = samples.length - 2; i >= 0; i--) {
    const a = samples[i]!;
    const b = samples[i + 1]!;
    if (a.t <= t) {
      const span = b.t - a.t;
      const k = span > 0 ? (t - a.t) / span : 1;
      return {
        t,
        x: a.x + (b.x - a.x) * k,
        z: a.z + (b.z - a.z) * k,
        yaw: lerpAngle(a.yaw, b.yaw, k),
        moving: b.moving,
      };
    }
  }
  return first;
}

/** Drops samples that can no longer be needed, keeping one sample before `cutoff` as the lower bound. */
export function pruneSamples(samples: Sample[], cutoff: number): void {
  while (samples.length > 2 && samples[1]!.t < cutoff) samples.shift();
}
