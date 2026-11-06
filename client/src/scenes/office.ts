import * as THREE from 'three';
import type { SceneModule } from './common.js';

export default {
  decorate(ctx) {
    const rug = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 2.4),
      new THREE.MeshStandardMaterial({ color: '#9fb8d6', roughness: 1 }),
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(-3.4, 0.008, -0.9);
    rug.receiveShadow = ctx.quality !== 'low';
    ctx.root.add(rug);
    ctx.addPendantLamp(0, 0, 1.0, '#eaf2ff');
  },
} satisfies SceneModule;
