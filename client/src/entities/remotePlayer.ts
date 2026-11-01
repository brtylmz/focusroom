import { WORLD, type PlayerPublic, type Vec3 } from '@focusroom/shared';
import type { Avatar } from './avatar.js';
import { interpolateSamples, pruneSamples, type Sample } from './interpolation.js';

interface SeatPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/** Remote player driven by server snapshots, rendered a little in the past for smooth motion. */
export class RemotePlayer {
  private samples: Sample[] = [];
  private seated: SeatPose | null = null;

  constructor(
    readonly id: string,
    readonly avatar: Avatar,
  ) {}

  applyPlayer(player: PlayerPublic, now: number): void {
    if (player.seatId) this.setSeated(player.position, player.yaw);
    else this.setStanding(player.position, player.yaw, now);
    this.avatar.setAway(!player.connected);
  }

  pushMove(move: { x: number; z: number; yaw: number; moving: boolean }, now: number): void {
    if (this.seated) return;
    this.samples.push({ t: now, x: move.x, z: move.z, yaw: move.yaw, moving: move.moving });
    pruneSamples(this.samples, now - 1_000);
  }

  setSeated(position: Vec3, yaw: number): void {
    this.seated = { x: position.x, y: position.y, z: position.z, yaw };
    this.samples = [];
    this.avatar.placeSeated(position.x, position.y, position.z, yaw);
    this.avatar.setState('sit');
  }

  setStanding(position: Vec3, yaw: number, now: number): void {
    this.seated = null;
    this.samples = [{ t: now, x: position.x, z: position.z, yaw, moving: false }];
    this.avatar.placeStanding(position.x, position.z, yaw);
    this.avatar.setState('idle');
  }

  update(dt: number, now: number): void {
    if (!this.seated) {
      const pose = interpolateSamples(this.samples, now - WORLD.interpDelayMs);
      if (pose) {
        this.avatar.placeStanding(pose.x, pose.z, pose.yaw);
        this.avatar.setState(pose.moving ? 'walk' : 'idle');
      }
    }
    this.avatar.update(dt);
  }
}
