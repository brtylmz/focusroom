import type { EnvironmentDef, EnvironmentId } from '../types.js';
import libraryData from './library.json' with { type: 'json' };
import cafeData from './cafe.json' with { type: 'json' };
import parkData from './park.json' with { type: 'json' };
import officeData from './office.json' with { type: 'json' };

export function validateEnvironment(env: EnvironmentDef): string[] {
  const errors: string[] = [];
  const seatIds = new Set<string>();
  for (const seat of env.seats) {
    if (seatIds.has(seat.id)) errors.push(`${env.id}: duplicate seat id ${seat.id}`);
    seatIds.add(seat.id);
    const b = env.bounds;
    const p = seat.pozisyon;
    if (p.x < b.minX || p.x > b.maxX || p.z < b.minZ || p.z > b.maxZ) {
      errors.push(`${env.id}: seat ${seat.id} is outside bounds`);
    }
  }
  if (env.seats.length < env.capacity) {
    errors.push(`${env.id}: seat count ${env.seats.length} is below capacity ${env.capacity}`);
  }
  const { minX, maxX, minZ, maxZ } = env.bounds;
  if (!(minX < maxX && minZ < maxZ)) errors.push(`${env.id}: invalid bounds`);
  if (env.spawn.x < minX || env.spawn.x > maxX || env.spawn.z < minZ || env.spawn.z > maxZ) {
    errors.push(`${env.id}: spawn is outside bounds`);
  }
  return errors;
}

const RAW: unknown[] = [libraryData, cafeData, parkData, officeData];

function loadAll(): EnvironmentDef[] {
  const envs = RAW.map((raw) => raw as EnvironmentDef);
  const problems = envs.flatMap(validateEnvironment);
  if (problems.length > 0) throw new Error(`Invalid environment data:\n${problems.join('\n')}`);
  return envs;
}

export const ENVIRONMENTS: readonly EnvironmentDef[] = loadAll();

export function getEnvironment(id: EnvironmentId): EnvironmentDef {
  const env = ENVIRONMENTS.find((e) => e.id === id);
  if (!env) throw new Error(`Unknown environment: ${id}`);
  return env;
}
