import * as THREE from 'three';
import type { SceneContext, SceneModule } from './common.js';

/** Builds a closed wooden door flush against the south wall, opening toward the room. */
function addDoor(ctx: SceneContext): void {
  const { maxZ } = ctx.env.bounds;
  const wood = new THREE.MeshStandardMaterial({ color: '#7a4e2d', roughness: 0.7 });
  const trim = new THREE.MeshStandardMaterial({ color: '#4a2e18', roughness: 0.6 });
  const group = new THREE.Group();
  const z = maxZ - 0.09;
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, zz: number) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, zz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  add(new THREE.BoxGeometry(0.9, 2.1, 0.05), wood, 0, 1.05, z);
  add(new THREE.BoxGeometry(1.1, 0.08, 0.06), trim, 0, 2.14, z);
  add(new THREE.BoxGeometry(0.08, 2.1, 0.06), trim, -0.54, 1.05, z);
  add(new THREE.BoxGeometry(0.08, 2.1, 0.06), trim, 0.54, 1.05, z);
  add(new THREE.SphereGeometry(0.03, 12, 8), trim, 0.35, 1.0, z - 0.04);
  ctx.root.add(group);
}

export default {
  decorate(ctx) {
    addDoor(ctx);
    ctx.addPendantLamp(-3.6, -1.6, -0.1, '#ffd27a');
    ctx.addPendantLamp(3.6, -1.6, -0.1, '#ffd27a');
    ctx.addPendantLamp(5.4, 3.0, -0.1, '#ffc46b');
  },
} satisfies SceneModule;
