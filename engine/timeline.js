// timeline.js: secuenciador de tomas, easing y keyframes de propiedades.
//   const tl = new Timeline([{ id:'a', dur:6, ... }, { id:'b', dur:10, ... }], { loop:true })
//   tl.total                -> duracion total (s)
//   tl.at(t)                -> { shot, index, local, p, start }   (t se envuelve si loop)
//   keyframes(frames, t)    -> objeto con las propiedades numericas interpoladas
//       frames = [{ t:0, x:0, z:1 }, { t:4, x:10, z:2, ease:'easeOut' }]   (ease del fotograma de salida)
//   easings.<nombre>(u)     -> linear, ease, easeIn, easeOut, smooth, sine
import { clamp, lerp } from './util.js';

export const easings = {
  linear: (u) => u,
  ease: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
  easeIn: (u) => u * u * u,
  easeOut: (u) => 1 - Math.pow(1 - u, 3),
  smooth: (u) => u * u * (3 - 2 * u),
  sine: (u) => 0.5 - 0.5 * Math.cos(Math.PI * u),
};

export function keyframes(frames, t, porDefecto = 'ease') {
  if (!frames || !frames.length) return {};
  if (t <= frames[0].t) return strip(frames[0]);
  const last = frames[frames.length - 1];
  if (t >= last.t) return strip(last);
  let i = 0;
  while (i < frames.length - 2 && frames[i + 1].t <= t) i++;
  const a = frames[i], b = frames[i + 1];
  const u = (easings[a.ease || porDefecto] || easings.ease)(clamp((t - a.t) / (b.t - a.t)));
  const out = {};
  for (const k in b) if (k !== 't' && k !== 'ease') out[k] = lerp(a[k] ?? b[k], b[k], u);
  return out;
}
function strip(f) { const o = {}; for (const k in f) if (k !== 't' && k !== 'ease') o[k] = f[k]; return o; }

export class Timeline {
  constructor(shots, { loop = true } = {}) {
    let acc = 0;
    this.shots = shots.map((s) => { const r = { ...s, start: acc }; acc += s.dur; return r; });
    this.total = acc;
    this.loop = loop;
  }
  /** shot activo en el instante t */
  at(t) {
    if (this.loop) t = ((t % this.total) + this.total) % this.total;
    t = clamp(t, 0, this.total - 1e-6);
    let i = this.shots.length - 1;
    while (i > 0 && t < this.shots[i].start) i--;
    const shot = this.shots[i];
    return { shot, index: i, local: t - shot.start, p: (t - shot.start) / shot.dur, start: shot.start, t };
  }
  /** instante global de inicio de un shot por id */
  startOf(id) { return this.shots.find((s) => s.id === id)?.start ?? 0; }
}
