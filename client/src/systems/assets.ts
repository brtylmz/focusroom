import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map<string, Promise<GLTF>>();

/** Shared, cached GLTF loads. Each URL is fetched once per page. */
export function loadGltf(url: string): Promise<GLTF> {
  let pending = cache.get(url);
  if (!pending) {
    pending = loader.loadAsync(url);
    cache.set(url, pending);
    pending.catch(() => cache.delete(url));
  }
  return pending;
}

/** Unprefixed names are Kenney furniture; "folder/name" names load from that folder (e.g. "office/desk"). */
export function furnitureUrl(name: string): string {
  const slash = name.indexOf('/');
  if (slash > 0) return `/models/${name.slice(0, slash)}/${name.slice(slash + 1)}.glb`;
  return `/models/furniture/${name}.glb`;
}
