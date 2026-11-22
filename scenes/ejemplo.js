// ejemplo minimo de una escena nueva con el motor: un fractal de julia que respira y luciernagas que lo recorren.
import { fireflies } from '../engine/particles.js';
import { sstep } from '../engine/util.js';

export default {
  name: 'ejemplo',
  shots: [
    { id: 'fractal', dur: 14, camera: [{ t: 0, z: 1 }, { t: 14, z: 1.6 }],
      draw(S, env) {
        const { gl, view, camera } = env;
        gl.draw('julia', { uRes: [view.gw, view.gh], uT: S.ta, uC: [-0.79 + 0.09 * Math.cos(S.ta * 0.2), 0.15 + 0.06 * Math.sin(S.ta * 0.26)], uZoom: camera.z, uTint: [1, 0.62, 0.25] });
        env.glOp(sstep(0, 1.5, S.local));
      } },
    { id: 'luces', dur: 10,
      draw(S, env) {
        const { ctx } = env;
        ctx.fillStyle = '#0a0705'; ctx.fillRect(0, 0, S.w, S.h);
        fireflies(ctx, S.view, S.ta, { n: 24 });
      } },
  ],
  audio(a) {
    a.layer('tono', (ac, h) => { const g = h.gain(0.4); h.osc('sine', 110).connect(g); h.osc('sine', 164.8, 6).connect(g); return g; }, { send: 0.8, max: 0.4 });
    a.automate(() => ({ tono: 1, master: 1 }));
  },
};
