import * as THREE from 'three';
import { CHARACTERS, type CharacterId } from '@focusroom/shared';
import { loadCharacterTemplate } from '../entities/characterTemplate.js';

const thumbnails = new Map<CharacterId, string>();
let pending: Promise<void> | null = null;

export function thumbnailFor(id: CharacterId): string | undefined {
  return thumbnails.get(id);
}

/** Renders each character once to a small PNG data URL for lists and cards. */
export function ensureThumbnails(): Promise<void> {
  if (!pending) pending = renderAll();
  return pending;
}

async function renderAll(): Promise<void> {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(128, 128, false);
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(1.5, 2.5, 2);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0.9, 1.0, 3.2);
  camera.lookAt(0, 0.5, 0);
  try {
    for (const c of CHARACTERS) {
      const template = await loadCharacterTemplate(c.id);
      const model = template.model.clone(true);
      scene.add(model);
      renderer.render(scene, camera);
      thumbnails.set(c.id, renderer.domElement.toDataURL('image/png'));
      scene.remove(model);
    }
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
