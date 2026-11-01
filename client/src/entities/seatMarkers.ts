import * as THREE from 'three';
import type { EnvironmentDef } from '@focusroom/shared';

const FREE_COLOR = 0x3fb950;
const OCCUPIED_COLOR = 0xe5484d;

/** Floor rings and invisible click targets for every seat of an environment. */
export class SeatMarkers {
  readonly group = new THREE.Group();
  readonly hitTargets: THREE.Object3D[] = [];
  private readonly rings = new Map<string, THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>>();
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];

  constructor(env: EnvironmentDef) {
    const ringGeometry = new THREE.RingGeometry(0.26, 0.4, 32);
    ringGeometry.rotateX(-Math.PI / 2);
    const hitGeometry = new THREE.CircleGeometry(0.6, 16);
    hitGeometry.rotateX(-Math.PI / 2);
    this.geometries.push(ringGeometry, hitGeometry);

    const hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    this.materials.push(hitMaterial);

    for (const seat of env.seats) {
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: FREE_COLOR,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      });
      this.materials.push(ringMaterial);
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.position.set(seat.pozisyon.x, 0.02, seat.pozisyon.z);
      ring.renderOrder = 1;

      const hit = new THREE.Mesh(hitGeometry, hitMaterial);
      hit.position.set(seat.pozisyon.x, 0.03, seat.pozisyon.z);
      hit.userData.seatId = seat.id;

      this.group.add(ring, hit);
      this.rings.set(seat.id, ring);
      this.hitTargets.push(hit);
    }
  }

  setOccupied(seatId: string, occupied: boolean): void {
    this.rings.get(seatId)?.material.color.setHex(occupied ? OCCUPIED_COLOR : FREE_COLOR);
  }

  seatIdOf(object: THREE.Object3D): string | null {
    const id = object.userData.seatId;
    return typeof id === 'string' ? id : null;
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
