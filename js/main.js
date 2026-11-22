// una sola toma continua. al principio solo una luciernaga: el clic empieza todo (y desbloquea el audio).
import { clamp } from './util.js';
import { crearGL } from './gl.js';
import { TORRES, OJO, HORIZONTE, AGUJERO } from './shaders.js';
import { cargarRetrato } from './retratos.js';
import { crearMundo, FIN, K } from './mundo.js';
import { crearAudio } from './audio.js';

const $ = (s) => document.querySelector(s);
const reducir = matchMedia('(prefers-reduced-motion: reduce)').matches;
const c2 = $('#c2');
const ctx = c2.getContext('2d');
const glc = $('#gl');
const glh = crearGL(glc);
const snd = $('#snd');
const audio = crearAudio(K, FIN);

const env = { ctx, G: glh, R: {}, reducir, dpr: 1, w: 0, h: 0, glEscala: 0.8, gw: 2, gh: 2 };
let glOpActual = -1;
env.glOp = (v) => { v = Math.round(clamp(v) * 100) / 100; if (v !== glOpActual) { glc.style.opacity = v; glOpActual = v; } };
if (glh) {
  glh.programa('torres', TORRES);
  glh.programa('ojo', OJO);
  glh.programa('horizonte', HORIZONTE);
  glh.programa('agujero', AGUJERO);
} else {
  console.warn('webgl2 no disponible');
  env.G = { dibujar() {}, tam() {} };
}
const mundo = crearMundo(env);

let t = 0, idle = 0, jugando = false, empezado = false, ultimo = performance.now(), calidad = 1;
const hash = new URLSearchParams(location.hash.slice(1));
if (hash.has('t')) { t = clamp(parseFloat(hash.get('t')) || 0, 0, FIN); empezado = true; jugando = hash.get('p') !== '1'; document.body.classList.add('activo'); snd.hidden = false; }

function medir() {
  const w = innerWidth, h = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2);
  env.w = w; env.h = h; env.dpr = dpr;
  c2.width = Math.round(w * dpr); c2.height = Math.round(h * dpr);
  env.glEscala = Math.min(dpr, 1.25) * (w * h > 1.4e6 ? 0.62 : 0.8) * calidad;
  env.gw = Math.max(2, Math.round(w * env.glEscala)); env.gh = Math.max(2, Math.round(h * env.glEscala));
  if (glh) glh.tam(env.gw, env.gh);
}
addEventListener('resize', medir);
medir();

function empezar() {
  if (empezado) return;
  empezado = true; jugando = true;
  document.body.classList.add('activo');
  audio.iniciar();
  snd.hidden = false; snd.setAttribute('aria-pressed', 'true');
}
addEventListener('pointerdown', (e) => { if (!empezado && !e.target.closest('#snd')) empezar(); });
addEventListener('keydown', (e) => {
  if (!empezado) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); empezar(); } return; }
  if (e.key === 'ArrowRight') { t = clamp(t + 10, 0, FIN - 0.01); idle = 0; }
  else if (e.key === 'ArrowLeft') { t = clamp(t - 10, 0, FIN); idle = 0; }
  else if (e.key === ' ') { e.preventDefault(); jugando = !jugando; }
});
snd.addEventListener('click', () => { snd.setAttribute('aria-pressed', audio.alternar() ? 'true' : 'false'); });

let acumDt = 0, nDt = 0;
function cuadro(ahora) {
  const dt = Math.min(0.1, (ahora - ultimo) / 1000);
  ultimo = ahora;
  if (jugando) {
    t += dt;
    if (t >= FIN) { t -= FIN; idle = 0; }
    acumDt += dt; nDt++;
    if (nDt >= 90) { if (acumDt / nDt > 0.024 && calidad > 0.5) { calidad *= 0.85; medir(); } acumDt = 0; nDt = 0; }
  }
  // antes del clic, la luciernaga parpadea sola
  const ta = empezado ? t : performance.now() / 1000;
  const S = { t: empezado ? t : 0, ta, w: env.w, h: env.h, u: Math.min(env.h / 100, env.w / 84), dt };
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c2.width, c2.height);
  ctx.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  env.glOp(0);
  if (glh) glh.tam(env.gw, env.gh);
  mundo.dibujar(S);
  audio.mezcla(t);
  requestAnimationFrame(cuadro);
}

['nino', 'adolescente', 'adulto', 'viejo', 'muerte'].forEach((n) => {
  cargarRetrato(n).then((P) => { env.R[n] = P; }).catch((e) => console.warn('retrato', n, e));
});
window.__constancia = { ir(x) { t = clamp(x, 0, FIN); idle = 0; }, get t() { return t; }, FIN, K };
requestAnimationFrame(cuadro);
