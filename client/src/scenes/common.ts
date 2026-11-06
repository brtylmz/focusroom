import * as THREE from 'three';
import { degToRad, type DecorDef, type EnvironmentDef, type EnvironmentId } from '@focusroom/shared';
import { SeatMarkers } from '../entities/seatMarkers.js';
import { furnitureUrl, loadGltf } from '../systems/assets.js';

export type Quality = 'low' | 'medium' | 'high';

/** Height of the ceiling for rooms that have one, or null for open-top rooms. */
export function enclosedHeight(id: EnvironmentId): number | null {
  return ENCLOSED[id] ? WALL_HEIGHT[id] : null;
}

const ENCLOSED: Partial<Record<EnvironmentId, true>> = { library: true };
const WALL_HEIGHT: Record<EnvironmentId, number> = { library: 3.0, cafe: 1.3, office: 2.4, park: 0.45 };
const MAX_POINT_LIGHTS = 4;
const CEILING_LAMP_SCALE = 0.55;

export interface SceneContext {
  env: EnvironmentDef;
  scene: THREE.Scene;
  root: THREE.Group;
  quality: Quality;
  /** Hanging chandelier with a warm point light. */
  addPendantLamp(x: number, z: number, height: number, color: string): void;
}

export interface SceneModule {
  decorate(ctx: SceneContext): void | Promise<void>;
}

export interface BuiltEnvironment {
  scene: THREE.Scene;
  root: THREE.Group;
  seats: SeatMarkers;
  dispose(): void;
}

const materialCache = new Map<string, THREE.MeshStandardMaterial>();

function material(color: string, roughness = 0.85): THREE.MeshStandardMaterial {
  const key = `${color}|${roughness}`;
  let m = materialCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness });
    materialCache.set(key, m);
  }
  return m;
}

export async function buildEnvironment(
  env: EnvironmentDef,
  quality: Quality,
  module: SceneModule,
): Promise<BuiltEnvironment> {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  scene.add(root);
  const { theme, bounds } = env;
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const shadows = quality !== 'low';

  scene.background = new THREE.Color(theme.sky);
  scene.fog = new THREE.Fog(theme.fog, theme.fogNear, theme.fogFar);

  const outerGround = '#' + new THREE.Color(theme.ground).multiplyScalar(0.78).getHexString();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), material(outerGround));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = shadows;
  root.add(ground);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material(theme.ground));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0.005, cz);
  floor.receiveShadow = shadows;
  root.add(floor);

  const wallHeight = WALL_HEIGHT[env.id];
  const thickness = 0.12;
  const wallMaterial = material(theme.wall, 0.9);
  const walls: [number, number, number, number][] = [
    [cx, bounds.minZ, width + thickness, thickness],
    [cx, bounds.maxZ, width + thickness, thickness],
    [bounds.minX, cz, thickness, depth + thickness],
    [bounds.maxX, cz, thickness, depth + thickness],
  ];
  for (const [x, z, w, d] of walls) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, wallHeight, d), wallMaterial);
    wall.position.set(x, wallHeight / 2, z);
    wall.castShadow = shadows;
    wall.receiveShadow = shadows;
    root.add(wall);
  }
  if (ENCLOSED[env.id]) {
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material(theme.wall, 0.95));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(cx, wallHeight, cz);
    ceiling.receiveShadow = shadows;
    root.add(ceiling);
  }

  const hemi = new THREE.HemisphereLight(theme.sky, theme.ground, 0.55);
  const ambient = new THREE.AmbientLight(theme.ambient, theme.ambientIntensity);
  const sun = new THREE.DirectionalLight(theme.sun, theme.sunIntensity);
  sun.position.set(cx + 5, 12, cz + 9);
  sun.target.position.set(cx, 0, cz);
  root.add(hemi, ambient, sun, sun.target);
  if (shadows) {
    const half = Math.max(width, depth) / 2 + 2;
    sun.castShadow = true;
    sun.shadow.mapSize.setScalar(quality === 'high' ? 2048 : 1024);
    sun.shadow.camera.left = -half;
    sun.shadow.camera.right = half;
    sun.shadow.camera.top = half;
    sun.shadow.camera.bottom = -half;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 40;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
  }

  let pointLights = 0;
  const lampLoads: Promise<unknown>[] = [];
  const ctx: SceneContext = {
    env,
    scene,
    root,
    quality,
    addPendantLamp(x, z, height, color) {
      const anchorY = wallHeight + height;
      lampLoads.push(placeCeilingLamp(x, anchorY, z, root));
      if (pointLights < MAX_POINT_LIGHTS) {
        pointLights += 1;
        const light = new THREE.PointLight(color, 1.2, 7, 1.6);
        light.position.set(x, anchorY - 0.3, z);
        root.add(light);
      }
    },
  };

  const decorations: Promise<unknown>[] = [];
  for (const decor of env.decor) decorations.push(placeDecor(decor, root, quality));
  for (const seat of env.seats) {
    if (seat.model) {
      decorations.push(
        placeFurniture(seat.model, seat.pozisyon.x, seat.pozisyon.z, seat.yön, root, quality, {
          scale: seat.scale,
          tint: seat.tint,
        }),
      );
    }
  }
  await Promise.all(decorations);
  await module.decorate(ctx);
  await Promise.all(lampLoads);

  const seats = new SeatMarkers(env);
  root.add(seats.group);

  return {
    scene,
    root,
    seats,
    dispose() {
      seats.dispose();
      root.removeFromParent();
    },
  };
}

function placeDecor(decor: DecorDef, root: THREE.Group, quality: Quality): Promise<unknown> {
  if (decor.model.startsWith('proc:')) {
    const group = buildProcedural(decor.model.slice(5), decor, quality);
    group.position.set(decor.x, 0, decor.z);
    group.rotation.y = degToRad(decor.yaw);
    root.add(group);
    return Promise.resolve();
  }
  return placeFurniture(decor.model, decor.x, decor.z, decor.yaw, root, quality, decor);
}

interface FurnitureOptions {
  scale?: number;
  y?: number;
  tint?: string;
}

/** Places a chandelier whose origin is its attachment point, so it hangs below y. */
async function placeCeilingLamp(x: number, y: number, z: number, root: THREE.Group): Promise<void> {
  const gltf = await loadGltf(furnitureUrl('lightCeiling'));
  const model = gltf.scene.clone(true);
  model.scale.setScalar(CEILING_LAMP_SCALE);
  model.position.set(x, y, z);
  root.add(model);
}

/** Loads a furniture model and centres its footprint on (x, z) with its base on the floor. */
/** Loads a model and centres its footprint on (x, z) with its base at height y (default: floor). */
async function placeFurniture(
  name: string,
  x: number,
  z: number,
  yawDeg: number,
  root: THREE.Group,
  quality: Quality,
  options: FurnitureOptions = {},
  scale = 1,
): Promise<void> {
  const gltf = await loadGltf(furnitureUrl(name));
  const model = gltf.scene.clone(true);
  model.scale.setScalar(options.scale ?? 1);
  if (options.tint) tintModel(model, options.tint);
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -box.min.y, -center.z);
  const holder = new THREE.Group();
  holder.add(model);
  holder.position.set(x, options.y ?? 0, z);
  holder.rotation.y = degToRad(yawDeg);
  if (quality !== 'low') {
    holder.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }
  root.add(holder);
}

/** Replaces the colour of every mesh in a model (cloned materials, so cached models are untouched). */
function tintModel(model: THREE.Object3D, color: string): void {
  const apply = (m: THREE.Material): THREE.Material => {
    const copy = m.clone();
    if (copy instanceof THREE.MeshStandardMaterial) copy.color.set(color);
    return copy;
  };
  model.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.material = Array.isArray(o.material) ? o.material.map(apply) : apply(o.material);
    }
  });
}

function buildProcedural(kind: string, decor: DecorDef, quality: Quality): THREE.Group {
  const group = new THREE.Group();
  const shadows = quality !== 'low';
  const add = (geometry: THREE.BufferGeometry, color: string, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geometry, material(color));
    mesh.position.set(x, y, z);
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    group.add(mesh);
  };
  const w = decor.box?.w ?? 1;
  const d = decor.box?.d ?? 1;
  const tint = decor.tint;

  switch (kind) {
    case 'counter': {
      add(new THREE.BoxGeometry(w, 1.0, d), tint ?? '#8c929a', 0, 0.5, 0);
      add(new THREE.BoxGeometry(w + 0.06, 0.05, d + 0.06), '#2b2f36', 0, 1.025, 0);
      break;
    }
    case 'panel':
      add(new THREE.BoxGeometry(w, 2.2, d), tint ?? '#2d4f7c', 0, 1.1, 0);
      break;
    case 'bean': {
      const bean = new THREE.SphereGeometry(0.5, 16, 12);
      bean.scale(1, 0.55, 1);
      add(bean, tint ?? '#b8413a', 0, 0.27, 0);
      break;
    }
    case 'picnic': {
      const topDepth = d * 0.6;
      add(new THREE.BoxGeometry(w, 0.05, topDepth), '#9b6b3f', 0, 0.37, 0);
      const legX = w / 2 - 0.2;
      const legZ = topDepth / 2 - 0.1;
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          add(new THREE.BoxGeometry(0.07, 0.37, 0.07), '#5c3d22', sx * legX, 0.185, sz * legZ);
        }
      }
      break;
    }
    case 'desk': {
      const topY = 0.37;
      add(new THREE.BoxGeometry(w, 0.04, d), '#9b6b3f', 0, topY, 0);
      const legX = w / 2 - 0.06;
      const legZ = d / 2 - 0.06;
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          add(new THREE.BoxGeometry(0.05, topY, 0.05), '#5c3d22', sx * legX, topY / 2, sz * legZ);
        }
      }
      break;
    }
    case 'tree': {
      const palette = ['#3f8f4a', '#4f9d55', '#2f7a3d'];
      const pick = Math.abs(Math.round(decor.x * 7 + decor.z * 13)) % palette.length;
      add(new THREE.CylinderGeometry(0.07, 0.09, 0.9, 8), '#7a5030', 0, 0.45, 0);
      add(new THREE.IcosahedronGeometry(0.55, 1), palette[pick]!, 0, 1.15, 0);
      break;
    }
    case 'bush':
      add(new THREE.IcosahedronGeometry(0.28, 0), '#2d6b3a', 0, 0.2, 0);
      break;
    default:
      throw new Error(`Unknown procedural model: ${kind}`);
  }
  return group;
}
