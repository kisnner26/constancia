// punto de entrada: monta el reproductor del motor con una escena de scenes/. ?escena=nombre elige otra (por defecto, constancia).
import { createPlayer } from '../engine/player.js';

const $ = (s) => document.querySelector(s);
const pedida = new URLSearchParams(location.search).get('escena') || 'constancia';
const nombre = /^[a-z0-9_-]+$/.test(pedida) ? pedida : 'constancia';
const { default: escena } = await import(`../scenes/${nombre}.js`);
const player = createPlayer({
  scene: escena,
  canvas: $('#c2'),
  glCanvas: $('#gl'),
  soundButton: $('#snd'),
  fallback: () => { $('#sin-webgl').hidden = false; },   // icono vectorial minimo si no hay webgl2
});
window.__constancia = { ir: (x) => player.seek(x), get t() { return player.t; }, FIN: player.timeline.total };
