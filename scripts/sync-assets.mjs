import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicModels = join(root, 'client', 'public', 'models');
const envDir = join(root, 'shared', 'src', 'environments');
const characterSource = join(root, 'assets', 'models', 'characters');
const furnitureSource = join(root, 'assets', 'models', 'furniture');
const CHARACTERS = Array.from({ length: 18 }, (_, i) => `character-${String.fromCharCode(97 + i)}`);

// Models loaded by code rather than referenced from environment JSON.
const CODE_FURNITURE = ['lightCeiling'];

function collectFurnitureModels() {
  const names = new Set(CODE_FURNITURE);
  for (const file of readdirSync(envDir).filter((f) => f.endsWith('.json'))) {
    const data = JSON.parse(readFileSync(join(envDir, file), 'utf8'));
    for (const d of data.decor ?? []) names.add(d.model);
    for (const s of data.seats ?? []) if (s.model) names.add(s.model);
  }
  return [...names].filter((n) => !n.startsWith('proc:'));
}

function copyIfNeeded(from, to) {
  if (!existsSync(from)) return 'missing';
  if (existsSync(to) && statSync(to).mtimeMs >= statSync(from).mtimeMs) return 'fresh';
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  return 'copied';
}

let copied = 0;
let missing = [];
for (const id of CHARACTERS) {
  const result = copyIfNeeded(join(characterSource, `${id}.glb`), join(publicModels, 'characters', `${id}.glb`));
  if (result === 'missing') missing.push(`characters/${id}.glb`);
  if (result === 'copied') copied += 1;
  // The GLB references its skin as an external PNG relative to itself.
  const texture = `${id.replace('character-', 'texture-')}.png`;
  const textureResult = copyIfNeeded(
    join(characterSource, 'Textures', texture),
    join(publicModels, 'characters', 'Textures', texture),
  );
  if (textureResult === 'missing') missing.push(`characters/Textures/${texture}`);
  if (textureResult === 'copied') copied += 1;
}
for (const name of collectFurnitureModels()) {
  const result = copyIfNeeded(join(furnitureSource, `${name}.glb`), join(publicModels, 'furniture', `${name}.glb`));
  if (result === 'missing') missing.push(`furniture/${name}.glb`);
  if (result === 'copied') copied += 1;
}

if (missing.length > 0 && !existsSync(publicModels)) {
  console.error(`[assets] Missing source models: ${missing.join(', ')}`);
  process.exit(1);
}
if (missing.length > 0) console.warn(`[assets] Using existing copies; sources missing: ${missing.join(', ')}`);
console.log(`[assets] ${copied} model file(s) updated in client/public/models`);
