import type { EnvironmentId } from '@focusroom/shared';
import type { SceneModule } from './common.js';

const modules: Record<EnvironmentId, () => Promise<{ default: SceneModule }>> = {
  library: () => import('./library.js'),
  cafe: () => import('./cafe.js'),
  park: () => import('./park.js'),
  office: () => import('./office.js'),
};

/** Each environment's extras live in their own module and are loaded on demand. */
export async function loadSceneModule(id: EnvironmentId): Promise<SceneModule> {
  const mod = await modules[id]();
  return mod.default;
}
