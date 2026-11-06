export const WORLD = {
  /** Units per second. One unit is roughly two metres (about 1.4 m/s). */
  walkSpeed: 2.0,
  /** Upper bound the server accepts for movement, before tolerance. */
  maxSpeed: 2.0,
  speedTolerance: 0.25,
  playerRadius: 0.25,
  /** Client-side reach for pressing E or auto-sitting. */
  sitReach: 1.6,
  /** Server-side reach, slightly larger to absorb latency. */
  serverSitReach: 2.2,
  standDistance: 0.7,
  moveSendHz: 12,
  interpDelayMs: 110,
} as const;

export const LIMITS = {
  nicknameMin: 2,
  nicknameMax: 16,
  chatMaxLength: 200,
  chatHistory: 50,
} as const;

export const STUDY = {
  /** A focus report older than this no longer counts as active. */
  modeTtlMs: 30_000,
  milestonesMinutes: [60, 120, 180, 240, 300],
} as const;
