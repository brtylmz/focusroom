import { WORLD } from './config.js';
import type { BoundsDef, BoxDef, EnvironmentDef } from './types.js';

export const SEAT_BOX = { w: 0.42, d: 0.42 } as const;
export const STAND_CANDIDATES_DEG = [180, 90, -90, 0] as const;

export interface WalkMap {
  bounds: BoundsDef;
  boxes: BoxDef[];
}

export interface Point2D {
  x: number;
  z: number;
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function normalizeDeg(deg: number): number {
  const wrapped = ((deg % 360) + 360) % 360;
  return wrapped;
}

export function isQuarterTurn(deg: number): boolean {
  const n = normalizeDeg(deg);
  return n === 90 || n === 270;
}

/** Facing direction for a yaw in degrees (0 = +Z). */
export function facingVector(yawDeg: number): Point2D {
  const r = degToRad(yawDeg);
  return { x: Math.sin(r), z: Math.cos(r) };
}

export function buildWalkMap(env: EnvironmentDef): WalkMap {
  const boxes: BoxDef[] = [...env.obstacles];
  for (const decor of env.decor) {
    if (!decor.box) continue;
    const swap = isQuarterTurn(decor.yaw);
    boxes.push({
      x: decor.x,
      z: decor.z,
      w: swap ? decor.box.d : decor.box.w,
      d: swap ? decor.box.w : decor.box.d,
    });
  }
  for (const seat of env.seats) {
    boxes.push({ x: seat.pozisyon.x, z: seat.pozisyon.z, w: SEAT_BOX.w, d: SEAT_BOX.d });
  }
  return { bounds: env.bounds, boxes };
}

export function isWalkable(map: WalkMap, x: number, z: number, radius: number = WORLD.playerRadius): boolean {
  const b = map.bounds;
  if (x < b.minX + radius || x > b.maxX - radius) return false;
  if (z < b.minZ + radius || z > b.maxZ - radius) return false;
  for (const box of map.boxes) {
    if (Math.abs(x - box.x) < box.w / 2 + radius && Math.abs(z - box.z) < box.d / 2 + radius) {
      return false;
    }
  }
  return true;
}

/** Moves from `from` toward `to`, sliding along a single axis when the diagonal is blocked. */
export function resolveMove(map: WalkMap, from: Point2D, to: Point2D, radius: number = WORLD.playerRadius): Point2D {
  if (isWalkable(map, to.x, to.z, radius)) return to;
  const alongX = { x: to.x, z: from.z };
  if (isWalkable(map, alongX.x, alongX.z, radius)) return alongX;
  const alongZ = { x: from.x, z: to.z };
  if (isWalkable(map, alongZ.x, alongZ.z, radius)) return alongZ;
  return from;
}

/** Finds a free spot just outside a seat, preferring the space behind the chair. */
export function findStandSpot(map: WalkMap, seat: Point2D, seatYawDeg: number): Point2D | null {
  const facing = facingVector(seatYawDeg);
  for (const offsetDeg of STAND_CANDIDATES_DEG) {
    const dir = facingVector(seatYawDeg + offsetDeg);
    const candidate = {
      x: seat.x + dir.x * WORLD.standDistance,
      z: seat.z + dir.z * WORLD.standDistance,
    };
    if (isWalkable(map, candidate.x, candidate.z)) return candidate;
  }
  const fallback = { x: seat.x - facing.x * WORLD.standDistance, z: seat.z - facing.z * WORLD.standDistance };
  return isWalkable(map, fallback.x, fallback.z, 0) ? fallback : null;
}

export function distance2D(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
