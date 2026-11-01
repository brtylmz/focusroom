export const serverConfig = {
  port: readNumber('PORT', 3001),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  graceMs: readNumber('RECONNECT_GRACE_MS', 15_000),
  maxInstancesPerEnvironment: readNumber('MAX_INSTANCES_PER_ENVIRONMENT', 5),
  limits: {
    move: { max: 30, windowMs: 1_000 },
    mode: { max: 10, windowMs: 1_000 },
    seat: { max: 10, windowMs: 5_000 },
    join: { max: 10, windowMs: 10_000 },
    chat: { max: 5, windowMs: 10_000 },
    report: { max: 5, windowMs: 60_000 },
  },
} as const;

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
