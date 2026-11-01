import { WORLD, resolveMove, type Point2D, type WalkMap } from '@focusroom/shared';
import { lerpAngle } from '../entities/interpolation.js';
import type { MoveAxis } from './input.js';

export interface WalkTarget extends Point2D {
  arriveRadius: number;
  onArrive?: () => void;
}

const STUCK_LIMIT_SEC = 1.5;

/** Client-side movement with collision. The server validates the same positions. */
export class LocalController {
  x: number;
  z: number;
  yaw = 0;
  moving = false;
  seatId: string | null = null;
  private target: WalkTarget | null = null;
  private stuckFor = 0;

  constructor(
    private readonly map: WalkMap,
    spawn: Point2D,
  ) {
    this.x = spawn.x;
    this.z = spawn.z;
  }

  get hasTarget(): boolean {
    return this.target !== null;
  }

  place(x: number, z: number, yaw: number): void {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.moving = false;
  }

  setTarget(target: WalkTarget | null): void {
    this.target = target;
    this.stuckFor = 0;
  }

  cancelTarget(): void {
    this.target = null;
  }

  /** Returns true when the position changed this frame. */
  update(dt: number, axis: MoveAxis, cameraYaw: number): boolean {
    if (this.seatId !== null) {
      this.moving = false;
      return false;
    }
    let dirX = 0;
    let dirZ = 0;
    const fx = -Math.sin(cameraYaw);
    const fz = -Math.cos(cameraYaw);
    const rx = -fz;
    const rz = fx;
    const manual = axis.forward !== 0 || axis.strafe !== 0;
    if (manual) {
      this.setTarget(null);
      dirX = fx * axis.forward + rx * axis.strafe;
      dirZ = fz * axis.forward + rz * axis.strafe;
    } else if (this.target) {
      const dx = this.target.x - this.x;
      const dz = this.target.z - this.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= this.target.arriveRadius) {
        const arrive = this.target.onArrive;
        this.setTarget(null);
        arrive?.();
        this.moving = false;
        return false;
      }
      dirX = dx / dist;
      dirZ = dz / dist;
    }

    const magnitude = Math.hypot(dirX, dirZ);
    if (magnitude < 1e-6) {
      this.moving = false;
      return false;
    }
    const step = (WORLD.walkSpeed * dt * Math.min(1, magnitude)) / magnitude;
    const from = { x: this.x, z: this.z };
    const to = { x: this.x + dirX * step, z: this.z + dirZ * step };
    const resolved = resolveMove(this.map, from, to);
    const movedX = resolved.x - this.x;
    const movedZ = resolved.z - this.z;
    const moved = Math.hypot(movedX, movedZ) > 1e-5;

    if (moved) {
      this.x = resolved.x;
      this.z = resolved.z;
      this.yaw = lerpAngle(this.yaw, Math.atan2(movedX, movedZ), 1 - Math.exp(-dt * 12));
      this.stuckFor = 0;
    } else if (this.target) {
      this.stuckFor += dt;
      if (this.stuckFor > STUCK_LIMIT_SEC) this.setTarget(null);
    }
    this.moving = moved;
    return moved;
  }
}
