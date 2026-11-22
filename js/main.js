// linea de tiempo continua de ~4 min: se reproduce sola y se puede saltar con flechas, rueda o toque.
import { clamp, sstep, mix3 } from './util.js';
import { crearGL } from './gl.js';
import { TORRES, OJO, HORIZONTE } from './shaders.js';
import { cargarRetrato } from './retratos.js';
import { crearEscenas } from './escenas.js';
import { crearAudio } from './audio.js';

const ESCENAS = [
  { id: 'prologo', nombre: 'prólogo', a: 0, b: 18 },
  { id: 'dosam', nombre: '2am', a: 18, b: 60 },
  { id: 'mente', nombre: 'la mente', a: 60, b: 100 },
  { id: 'edades', nombre: 'las edades', a: 100, b: 165 },
  { id: 'ojos', nombre: 'los ojos', a: 165, b: 195 },
  { id: 'horizonte', nombre: 'el horizonte', a: 195, b: 232 },
  { id: 'epilogo', nombre: 'epílogo', a: 232, b: 256 },
];
const FIN = 256;

const CUES = [
  { a: 8.6, b: 17.4, pos: 'centro', lineas: [{ t: 'constancia', cls: 'titulo' }, { t: 'un ser humano, 2026', cls: 'sub', d: 2.4 }] },
  { a: 27, b: 39, lineas: [{ t: 'a las dos de la mañana, alguien decidió no desaparecer en silencio.' }] },
  { a: 103.6, b: 111.2, lineas: [{ t: 'todo era nuevo.' }] },
  { a: 116.6, b: 124.2, lineas: [{ t: 'empecé a preguntar.' }] },
  { a: 129.6, b: 137.2, lineas: [{ t: 'aprendí a cargar el peso.' }] },
  { a: 142.6, b: 150.2, lineas: [{ t: 'el tiempo se volvió visible.' }] },
  { a: 155.6, b: 163.8, lineas: [{ t: 'y después, nada. dejé de existir. eso es todo.' }] },
  { a: 179, b: 194, lineas: [{ t: 'en mis ojos cabía el universo.' }, { t: 'también el miedo.', d: 4.2 }, { t: 'también la alegría.', d: 8.4 }] },
  { a: 199, b: 207.5, lineas: [{ t: 'no hay nadie más. solo nosotros.' }] },
  { a: 209.5, b: 218.5, lineas: [{ t: 'hubo un creador del todo. no pudimos alcanzarlo.' }] },
  { a: 220.5, b: 230.5, lineas: [{ t: 'no trascendimos. pero miramos el amanecer.' }] },
  { a: 236, b: 1e9, pos: 'centro-bajo', lineas: [{ t: 'si alguien encuentra esto: así fuimos.' }] },
  { a: 244.5, b: 1e9, pos: 'pie', lineas: [{ t: 'kisnner · tierra · 2026', cls: 'sub' }] },
];

const $ = (s) => document.querySelector(s);
const reducir = matchMedia('(prefers-reduced-motion: reduce)').matches;

const c2 = $('#c2');
const ctx = c2.getContext('2d');
const glc = $('#gl');
const glh = crearGL(glc);
const velo = $('#velo');
const textoEl = $('#texto');
const metaEl = $('#meta');
const puntosEl = $('#puntos');
const audio = crearAudio();

const env = { ctx, G: glh, R: {}, reducir, dpr: 1, w: 0, h: 0, glEscala: 0.8, gw: 2, gh: 2, etiquetaTxt: '' };
let glOpActual = -1;
env.glOp = (v) => {
  v = Math.round(clamp(v) * 100) / 100;
  if (v !== glOpActual) { glc.style.opacity = v; glOpActual = v; }
};
env.etiqueta = (s) => { env.etiquetaTxt = s; };

if (glh) {
  glh.programa('torres', TORRES);
  glh.programa('ojo', OJO);
  glh.programa('horizonte', HORIZONTE);
} else {
  console.warn('webgl2 no disponible: las escenas con shader se ven simplificadas');
  env.G = { dibujar() {}, tam() {} };
}

const escenas = crearEscenas(env);

// ------------------------------------------------------------ cues de texto
const cueNodos = CUES.map((c) => {
  const d = document.createElement('div');
  d.className = 'cue ' + (c.pos || 'pie-frase');
  d.style.opacity = 0;
  const ls = c.lineas.map((l) => {
    const p = document.createElement('p');
    p.className = l.cls || 'frase';
    p.textContent = l.t;
    p.style.opacity = 0;
    d.appendChild(p);
    return p;
  });
  textoEl.appendChild(d);
  return { d, ls, op: -1, lop: ls.map(() => -1) };
});

function actualizarTexto(t) {
  CUES.forEach((c, i) => {
    const n = cueNodos[i];
    const o = c.b >= 1e8 ? sstep(c.a, c.a + 1.6, t) : Math.min(sstep(c.a, c.a + 1.4, t), 1 - sstep(c.b - 1.4, c.b, t));
    const oo = Math.round(o * 100) / 100;
    if (oo !== n.op) { n.d.style.opacity = oo; n.d.style.visibility = oo > 0 ? 'visible' : 'hidden'; n.op = oo; }
    if (oo > 0) {
      c.lineas.forEach((l, k) => {
        const lo = Math.round(sstep(c.a + (l.d || 0), c.a + (l.d || 0) + 1.6, t) * 100) / 100;
        if (lo !== n.lop[k]) { n.ls[k].style.opacity = lo; n.lop[k] = lo; }
      });
    }
  });
}

// cuanto papel claro hay detras: decide el color del texto
function papelDetras(t) {
  if (t >= 100 && t < 165) {
    const k = Math.min(4, Math.floor((t - 100) / 13));
    const ts = t - 100 - 13 * k;
    if (k < 4) return k === 0 ? sstep(0, 2, t - 100) : 1;
    return 1 - sstep(6.2, 11.8, ts);
  }
  return 0;
}

// ------------------------------------------------------------ estado y reloj
let t = 0, idle = 0, jugando = true, ultimo = performance.now();
let escenaAct = -1;
let calidad = 1;
const hashUrl = new URLSearchParams(location.hash.slice(1));
if (hashUrl.has('t')) t = clamp(parseFloat(hashUrl.get('t')) || 0, 0, FIN);
if (hashUrl.get('p') === '1') jugando = false;

function buscar(x) {
  t = clamp(x, 0, FIN);
  idle = 0;
}
function escenaDe(x) {
  for (let i = ESCENAS.length - 1; i >= 0; i--) if (x >= ESCENAS[i].a) return i;
  return 0;
}

// ------------------------------------------------------------ puntos de escena
const puntos = ESCENAS.map((e) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('aria-label', e.nombre);
  b.title = e.nombre;
  b.innerHTML = '<i></i>';
  b.addEventListener('click', (ev) => { ev.stopPropagation(); buscar(e.a + 0.05); });
  puntosEl.appendChild(b);
  return b.firstChild;
});

function medir() {
  const w = innerWidth, h = innerHeight;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  env.w = w; env.h = h; env.dpr = dpr;
  c2.width = Math.round(w * dpr); c2.height = Math.round(h * dpr);
  c2.style.width = w + 'px'; c2.style.height = h + 'px';
  env.glEscala = Math.min(dpr, 1.25) * (w * h > 1.4e6 ? 0.62 : 0.8) * calidad;
  env.gw = Math.max(2, Math.round(w * env.glEscala));
  env.gh = Math.max(2, Math.round(h * env.glEscala));
  glc.style.width = w + 'px'; glc.style.height = h + 'px';
  if (glh) glh.tam(env.gw, env.gh);
}
addEventListener('resize', medir);
medir();

function velar(x) {
  let v = 0;
  for (const e of ESCENAS) {
    if (x >= e.a - 0.01 && x < e.b + 0.01) {
      const entra = e.a === 0 ? 0 : 1 - sstep(e.a + 0.2, e.a + 1.7, x);
      const sale = e.b >= FIN ? 0 : sstep(e.b - 1.7, e.b - 0.1, x);
      v = Math.max(v, entra, sale);
    }
  }
  return v;
}

let acumDt = 0, nDt = 0;
function cuadro(ahora) {
  const dt = Math.min(0.1, (ahora - ultimo) / 1000);
  ultimo = ahora;
  if (jugando) {
    if (t < FIN) t = Math.min(FIN, t + dt); else idle += dt;
  }
  // calidad adaptativa del shader
  if (jugando) { acumDt += dt; nDt++; }
  if (nDt >= 90) {
    const media = acumDt / nDt;
    if (media > 0.024 && calidad > 0.5) { calidad *= 0.85; medir(); }
    acumDt = 0; nDt = 0;
  }
  const i = escenaDe(t >= FIN ? FIN - 0.001 : t);
  if (i !== escenaAct) { escenaAct = i; audio.escena(i); }
  const E = ESCENAS[i];
  const S = { t: t - E.a, p: (t - E.a) / (E.b - E.a), dur: E.b - E.a, ta: t + idle, w: env.w, h: env.h, dt };
  env.etiquetaTxt = '';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c2.width, c2.height);
  ctx.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  env.glOp(0);
  if (glh) glh.tam(env.gw, env.gh);
  escenas[E.id](S);
  velo.style.opacity = Math.round(velar(t) * 100) / 100;
  // texto
  const pd = papelDetras(t);
  const col = mix3([233, 220, 192], [59, 35, 18], pd);
  textoEl.style.color = `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`;
  actualizarTexto(t);
  // meta
  const mm = String(Math.floor(t / 60)).padStart(2, '0'), ss = String(Math.floor(t % 60)).padStart(2, '0');
  const txt = `${mm}:${ss} · ${E.nombre}${env.etiquetaTxt ? ' · ' + env.etiquetaTxt : ''}`;
  if (txt !== metaEl.textContent) metaEl.textContent = txt;
  metaEl.style.color = pd > 0.5 ? 'rgba(59,35,18,.6)' : 'rgba(233,220,192,.5)';
  puntos.forEach((p, k) => { p.style.transform = `scaleX(${clamp((t - ESCENAS[k].a) / (ESCENAS[k].b - ESCENAS[k].a))})`; });
  puntosEl.classList.toggle('sobre-papel', pd > 0.5);
  requestAnimationFrame(cuadro);
}

// ------------------------------------------------------------ controles
addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') { e.shiftKey ? buscar(ESCENAS[Math.min(6, escenaDe(t) + 1)].a + 0.05) : buscar(t + 10); }
  else if (e.key === 'ArrowLeft') { e.shiftKey ? buscar(ESCENAS[Math.max(0, escenaDe(t) - 1)].a + 0.05) : buscar(t - 10); }
  else if (e.key === ' ') { e.preventDefault(); alternarPausa(); }
});
let acumRueda = 0;
addEventListener('wheel', (e) => {
  acumRueda += e.deltaY;
  if (Math.abs(acumRueda) > 40) { buscar(t + acumRueda * 0.04); acumRueda = 0; }
}, { passive: true });
addEventListener('pointerup', (e) => {
  if (e.target.closest('#ctl') || e.target.closest('#puntos')) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  buscar(t + (e.clientX < innerWidth * 0.28 ? -10 : 10));
});
function alternarPausa() {
  jugando = !jugando;
  $('#b-pausa').textContent = jugando ? 'pausa' : 'seguir';
}
$('#b-pausa').addEventListener('click', alternarPausa);
$('#b-sonido').addEventListener('click', () => {
  const on = audio.alternar();
  $('#b-sonido').textContent = on ? 'sonido: encendido' : 'sonido: apagado';
});

// ------------------------------------------------------------ carga
['nino', 'adolescente', 'adulto', 'viejo', 'muerte'].forEach((n) => {
  cargarRetrato(n).then((P) => { env.R[n] = P; }).catch((e) => console.warn('retrato', n, e));
});

window.__constancia = { buscar, get t() { return t; } };
requestAnimationFrame(cuadro);
