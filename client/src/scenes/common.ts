import * as THREE from 'three';
import { degToRad, type DecorDef, type EnvironmentDef, type EnvironmentId } from '@focusroom/shared';
import { SeatMarkers } from '../entities/seatMarkers.js';
import { furnitureUrl, loadGltf } from '../systems/assets.js';

export type Quality = 'low' | 'medium' | 'high';

const WALL_HEIGHT: Record<EnvironmentId, number> = { library: 1.3, cafe: 1.3, office: 1.3, park: 0.45 };
const MAX_POINT_LIGHTS = 4;

export interface SceneContext {
  env: EnvironmentDef;
  scene: THREE.Scene;
  root: THREE.Group;
  quality: Quality;
  /** Hanging lamp with a glowing shade and a warm point light. */
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
  const ctx: SceneContext = {
    env,
    scene,
    root,
    quality,
    addPendantLamp(x, z, height, color) {
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, height, 6), material('#222', 0.6));
      cord.position.set(x, height / 2 + wallHeight, z);
      const shade = new THREE.Mesh(
        new THREE.ConeGeometry(0.22, 0.2, 16, 1, true),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, side: THREE.DoubleSide }),
      );
      shade.position.set(x, wallHeight + height, z);
      root.add(cord, shade);
      if (pointLights < MAX_POINT_LIGHTS) {
        pointLights += 1;
        const light = new THREE.PointLight(color, 1.2, 7, 1.6);
        light.position.set(x, wallHeight + height - 0.25, z);
        root.add(light);
      }
    },
  };

  const decorations: Promise<unknown>[] = [];
  for (const decor of env.decor) decorations.push(placeDecor(decor, root, quality));
  for (const seat of env.seats) {
    if (seat.model) decorations.push(placeFurniture(seat.model, seat.pozisyon.x, seat.pozisyon.z, seat.yön, root, quality));
  }
  await Promise.all(decorations);
  await module.decorate(ctx);

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
  return placeFurniture(decor.model, decor.x, decor.z, decor.yaw, root, quality);
}

/** Loads a Kenney model and centres its footprint on (x, z) with its base on the floor. */
async function placeFurniture(
  name: string,
  x: number,
  z: number,
  yawDeg: number,
  root: THREE.Group,
  quality: Quality,
): Promise<void> {
  const gltf = await loadGltf(furnitureUrl(name));
  const model = gltf.scene.clone(true);
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -box.min.y, -center.z);
  const holder = new THREE.Group();
  holder.add(model);
  holder.position.set(x, 0, z);
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

  switch (kind) {
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
