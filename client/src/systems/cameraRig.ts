import * as THREE from 'three';
import type { BoundsDef } from '@focusroom/shared';

const EYE_HEIGHT = 0.7;
const WALL_MARGIN = 0.15;

/** Third-person orbit camera. The default yaw places the camera behind an avatar that faces +Z. */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  yaw = Math.PI;
  pitch = 0.42;
  lookPitch = 0;
  distance = 3.2;
  firstPerson = false;
  private readonly look = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private initialised = false;
  private enclosure: { bounds: BoundsDef; ceiling: number } | null = null;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 200);
  }

  orbit(dx: number, dy: number): void {
    this.yaw -= dx * 0.005;
    if (this.firstPerson) {
      this.lookPitch = clamp(this.lookPitch - dy * 0.004, -1.2, 1.2);
      return;
    }
    this.pitch = clamp(this.pitch + dy * 0.004, 0.15, 1.2);
  }

  setFirstPerson(on: boolean): void {
    this.firstPerson = on;
    this.lookPitch = 0;
    this.initialised = false;
  }

  zoom(delta: number): void {
    this.distance = clamp(this.distance + delta * 0.003, 1.6, 7);
  }

  /** Keeps the third-person camera inside the room; pass null for open rooms. */
  setEnclosure(bounds: BoundsDef, ceiling: number | null): void {
    this.enclosure = ceiling === null ? null : { bounds, ceiling };
  }

  update(dt: number, focus: THREE.Vector3Like, smooth: boolean): void {
    if (this.firstPerson) {
      this.updateFirstPerson(focus);
      return;
    }
    const k = smooth && this.initialised ? 1 - Math.exp(-dt * 10) : 1;
    this.initialised = true;
    this.desired.set(focus.x, focus.y + 0.6, focus.z);
    this.look.lerp(this.desired, k);

    const horizontal = this.distance * Math.cos(this.pitch);
    const vertical = this.distance * Math.sin(this.pitch);
    this.desired.set(
      this.look.x + Math.sin(this.yaw) * horizontal,
      this.look.y + vertical,
      this.look.z + Math.cos(this.yaw) * horizontal,
    );
    if (this.enclosure) keepInside(this.desired, this.enclosure);
    this.camera.position.lerp(this.desired, k);
    this.camera.lookAt(this.look);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  private updateFirstPerson(focus: THREE.Vector3Like): void {
    const eyeY = focus.y + EYE_HEIGHT;
    const cp = Math.cos(this.lookPitch);
    this.camera.position.set(focus.x, eyeY, focus.z);
    this.camera.lookAt(
      focus.x - Math.sin(this.yaw) * cp,
      eyeY + Math.sin(this.lookPitch),
      focus.z - Math.cos(this.yaw) * cp,
    );
    this.initialised = false;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function keepInside(p: THREE.Vector3, { bounds, ceiling }: { bounds: BoundsDef; ceiling: number }): void {
  p.x = clamp(p.x, bounds.minX + WALL_MARGIN, bounds.maxX - WALL_MARGIN);
  p.z = clamp(p.z, bounds.minZ + WALL_MARGIN, bounds.maxZ - WALL_MARGIN);
  p.y = Math.min(p.y, ceiling - WALL_MARGIN);
}
