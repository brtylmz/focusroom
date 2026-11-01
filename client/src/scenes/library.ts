import type { SceneModule } from './common.js';

export default {
  decorate(ctx) {
    ctx.addPendantLamp(-3.6, -1.6, 1.0, '#ffd27a');
    ctx.addPendantLamp(3.6, -1.6, 1.0, '#ffd27a');
    ctx.addPendantLamp(5.4, 3.0, 1.0, '#ffc46b');
  },
} satisfies SceneModule;
