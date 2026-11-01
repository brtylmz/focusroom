import type { CharacterId } from './types.js';

export interface CharacterDef {
  id: CharacterId;
  label: string;
  accent: string;
  model: string;
}

const CHARACTER_ACCENTS: readonly [CharacterId, string][] = [
  ['character-a', '#2a9d8f'],
  ['character-b', '#e76f51'],
  ['character-c', '#264653'],
  ['character-d', '#e9c46a'],
  ['character-e', '#8ab17d'],
  ['character-f', '#f4a261'],
  ['character-g', '#b56bd6'],
  ['character-h', '#6a4c93'],
  ['character-i', '#ff6b6b'],
  ['character-j', '#3d5a80'],
  ['character-k', '#1d3557'],
  ['character-l', '#90be6d'],
  ['character-m', '#c77dff'],
  ['character-n', '#457b9d'],
  ['character-o', '#ffb703'],
  ['character-p', '#2ec4b6'],
  ['character-q', '#8d99ae'],
  ['character-r', '#ef476f'],
];

export const CHARACTERS: readonly CharacterDef[] = CHARACTER_ACCENTS.map(([id, accent], index) => ({
  id,
  label: `Karakter ${index + 1}`,
  accent,
  model: `/models/characters/${id}.glb`,
}));

export function isCharacterId(value: unknown): value is CharacterId {
  return CHARACTERS.some((c) => c.id === value);
}

export function getCharacter(id: CharacterId): CharacterDef {
  const found = CHARACTERS.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown character: ${id}`);
  return found;
}
