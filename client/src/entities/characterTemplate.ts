import * as THREE from 'three';
import { CHARACTERS, getCharacter, type CharacterId } from '@focusroom/shared';
import { loadGltf } from '../systems/assets.js';

/** Character height in scene units (one unit is about two metres, so this is about 1.75 m). */
export const AVATAR_HEIGHT = 0.875;

export type AvatarState = 'idle' | 'walk' | 'sit';

export interface CharacterTemplate {
  id: CharacterId;
  model: THREE.Group;
  clips: Record<AvatarState, THREE.AnimationClip>;
  /** Hip height while seated, in scene units. Anchor y = seat height minus this value. */
  sitHeight: number;
}

const templates = new Map<CharacterId, Promise<CharacterTemplate>>();

export function loadCharacterTemplate(id: CharacterId): Promise<CharacterTemplate> {
  let pending = templates.get(id);
  if (!pending) {
    pending = buildTemplate(id);
    templates.set(id, pending);
  }
  return pending;
}

export function loadAllCharacterTemplates(): Promise<CharacterTemplate[]> {
  return Promise.all(CHARACTERS.map((c) => loadCharacterTemplate(c.id)));
}

async function buildTemplate(id: CharacterId): Promise<CharacterTemplate> {
  const gltf = await loadGltf(getCharacter(id).model);
  const source = gltf.scene;
  source.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(source);
  const scale = AVATAR_HEIGHT / box.getSize(new THREE.Vector3()).y;

  const leg = source.getObjectByName('leg-left');
  if (!leg) throw new Error(`Character ${id} has no leg-left node`);
  const hipLocal = new THREE.Vector3();
  leg.getWorldPosition(hipLocal);

  const clip = (name: AvatarState): THREE.AnimationClip => {
    const found = gltf.animations.find((a) => a.name === name);
    if (!found) throw new Error(`Character ${id} has no "${name}" animation`);
    return found;
  };
  const clips = { idle: clip('idle'), walk: clip('walk'), sit: clip('sit') };
  const sitDrop = clips.sit.tracks.find((t) => t.name === 'root.position')?.values[1] ?? 0;

  source.scale.setScalar(scale);
  source.position.y = -box.min.y * scale;
  const model = new THREE.Group();
  model.add(source);
  model.updateMatrixWorld(true);

  const sitHeight = (hipLocal.y + sitDrop) * scale + source.position.y;
  return { id, model, clips, sitHeight };
}
