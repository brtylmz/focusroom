import * as THREE from 'three';
import type { SceneModule } from './common.js';

export default {
  decorate(ctx) {
    const rug = new THREE.Mesh(
      new THREE.PlaneGeometry(4.5, 1.6),
      new THREE.MeshStandardMaterial({ color: '#8fa3bf', roughness: 1 }),
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.008, 0.4);
    rug.receiveShadow = ctx.quality !== 'low';
    ctx.root.add(rug);
    ctx.addPendantLamp(0, 0, 1.0, '#eaf2ff');
  },
} satisfies SceneModule;
