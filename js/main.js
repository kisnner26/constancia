// punto de entrada de constancia: monta el reproductor del motor con la escena.
import { createPlayer } from '../engine/player.js';
import escena from '../scenes/constancia.js';

const $ = (s) => document.querySelector(s);
const player = createPlayer({
  scene: escena,
  canvas: $('#c2'),
  glCanvas: $('#gl'),
  soundButton: $('#snd'),
  fallback: () => { $('#sin-webgl').hidden = false; },   // icono vectorial minimo si no hay webgl2
});
window.__constancia = { ir: (x) => player.seek(x), get t() { return player.t; }, FIN: player.timeline.total };
