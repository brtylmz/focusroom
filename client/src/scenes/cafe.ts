import type { SceneModule } from './common.js';

export default {
  decorate(ctx) {
    ctx.addPendantLamp(-1.0, -3.1, 1.0, '#ffb86b');
    ctx.addPendantLamp(0.5, -3.1, 1.0, '#ffb86b');
    ctx.addPendantLamp(-4.0, 0.0, 1.0, '#ffe2a8');
  },
} satisfies SceneModule;
