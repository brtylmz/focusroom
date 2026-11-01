import * as THREE from 'three';
import type { SceneModule } from './common.js';

export default {
  decorate(ctx) {
    const pathMaterial = new THREE.MeshStandardMaterial({ color: '#d8c39a', roughness: 0.95 });
    const strips: [number, number, number, number][] = [
      [0, 0, 1.2, 14],
      [0, -2, 14, 1.2],
    ];
    for (const [x, z, w, d] of strips) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(w, d), pathMaterial);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(x, 0.01, z);
      strip.receiveShadow = ctx.quality !== 'low';
      ctx.root.add(strip);
    }
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(1.6, 32), pathMaterial);
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(0, 0.012, -2);
    ctx.root.add(plaza);
  },
} satisfies SceneModule;
