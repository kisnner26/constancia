// strokes.js: render de dibujos como listas de trazos (json) con aguada.
//   loadStrokes(nombre, base)   -> { n, tipo, raw, kp, cen, aguada, poster, W, H }   (base: carpeta con <nombre>.json y <nombre>-aguada.webp)
//   drawStrokes(ctx, P, n, frac, tr, alfa)  -> dibuja los primeros n trazos y el siguiente parcialmente; tr = {x, y, s}
//   drawMorph(ctx, A, B, m, tr, alfa)       -> transforma los trazos de A en los de B (m de 0 a 1)
//   drawWash(ctx, P, tr, alfa)              -> capa de color translucida con multiply
//   cachedStrokes(P, q)                     -> canvas con el dibujo completo, para no reconstruirlo en cada cuadro
//   releaseToMoths(ctx, P, tr, seg, o)      -> los trazos se sueltan y se vuelven polillas que vuelan hacia una luz
import { clamp, lerp, ease, hash, TAU } from './util.js';

const K = 10; // puntos por trazo al remuestrear (para el morph)
export const STYLE = [
  { c: '#4d2412', w: 1.5, a: 0.95 },
  { c: '#6b3a1f', w: 0.95, a: 0.82 },
  { c: '#5a3018', w: 0.9, a: 0.88 },
  { c: '#6b3a1f', w: 1.05, a: 0.78 },
  { c: '#3a1a0a', w: 1.25, a: 0.95 },
];

function img(src) {
  return new Promise((res) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = src;
  });
}

export async function loadStrokes(nombre, base = 'assets/retratos') {
  const [j, aguada, poster] = await Promise.all([
    fetch(`${base}/${nombre}.json`).then((r) => r.json()),
    img(`${base}/${nombre}-aguada.webp`),
    img(`${base}/${nombre}.png`),
  ]);
  const rows = j.s;
  const n = rows.length;
  const tipo = new Uint8Array(n);
  const ancho = new Uint8Array(n);
  const off = new Uint32Array(n + 1);
  let total = 0;
  for (const r of rows) total += (r.length - 2) / 2;
  const raw = new Float32Array(total * 2);
  let o = 0;
  for (let i = 0; i < n; i++) {
    const r = rows[i];
    tipo[i] = r[0];
    ancho[i] = r[1];
    off[i] = o / 2;
    let x = r[2], y = r[3];
    raw[o++] = x; raw[o++] = y;
    for (let k = 4; k < r.length; k += 2) {
      x += r[k]; y += r[k + 1];
      raw[o++] = x; raw[o++] = y;
    }
  }
  off[n] = o / 2;
  // remuestreo a K puntos por longitud de arco
  const kp = new Float32Array(n * K * 2);
  const cen = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const a = off[i], b = off[i + 1], m = b - a;
    const acc = new Float32Array(m);
    for (let q = 1; q < m; q++) {
      const dx = raw[(a + q) * 2] - raw[(a + q - 1) * 2];
      const dy = raw[(a + q) * 2 + 1] - raw[(a + q - 1) * 2 + 1];
      acc[q] = acc[q - 1] + Math.hypot(dx, dy);
    }
    const L = acc[m - 1] || 1;
    let seg = 0;
    let cx = 0, cy = 0;
    for (let s = 0; s < K; s++) {
      const d = (s / (K - 1)) * L;
      while (seg < m - 2 && acc[seg + 1] < d) seg++;
      const t = clamp((d - acc[seg]) / ((acc[seg + 1] - acc[seg]) || 1));
      const x = lerp(raw[(a + seg) * 2], raw[(a + seg + 1) * 2], t);
      const y = lerp(raw[(a + seg) * 2 + 1], raw[(a + seg + 1) * 2 + 1], t);
      kp[(i * K + s) * 2] = x;
      kp[(i * K + s) * 2 + 1] = y;
      cx += x; cy += y;
    }
    cen[i * 2] = cx / K;
    cen[i * 2 + 1] = cy / K;
  }
  return { nombre, n, tipo, ancho, off, raw, kp, cen, aguada, poster, W: j.w, H: j.h, cache: null };
}

function preparar(ctx, tr, alfa) {
  ctx.save();
  ctx.translate(tr.x, tr.y);
  ctx.scale(tr.s, tr.s);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = alfa;
}

// dibuja los primeros n trazos completos y el siguiente parcialmente (frac)
export function drawStrokes(ctx, P, n, frac, tr, alfa = 1, tinta = null) {
  const paths = [new Path2D(), new Path2D(), new Path2D(), new Path2D(), new Path2D()];
  const N = Math.min(P.n, Math.floor(n));
  for (let i = 0; i < N; i++) {
    const p = paths[P.tipo[i]];
    const a = P.off[i], b = P.off[i + 1];
    p.moveTo(P.raw[a * 2], P.raw[a * 2 + 1]);
    for (let k = a + 1; k < b; k++) p.lineTo(P.raw[k * 2], P.raw[k * 2 + 1]);
  }
  if (N < P.n && frac > 0) {
    const p = paths[P.tipo[N]];
    const a = P.off[N], b = P.off[N + 1];
    const m = Math.max(1, Math.floor((b - a - 1) * frac));
    p.moveTo(P.raw[a * 2], P.raw[a * 2 + 1]);
    for (let k = a + 1; k <= a + m; k++) p.lineTo(P.raw[k * 2], P.raw[k * 2 + 1]);
  }
  preparar(ctx, tr, alfa);
  for (let t = 0; t < 5; t++) {
    ctx.lineWidth = STYLE[t].w / Math.max(tr.s, 0.0001) * Math.max(0.55, Math.min(tr.s * 1.2, 2.2)) ;
    ctx.strokeStyle = tinta ? tinta(t) : STYLE[t].c;
    ctx.globalAlpha = alfa * STYLE[t].a;
    ctx.stroke(paths[t]);
  }
  ctx.restore();
}

// morph de la lista A a la lista B (m de 0 a 1)
export function drawMorph(ctx, A, B, m, tr, alfa = 1) {
  const M = Math.max(A.n, B.n);
  const paths = [new Path2D(), new Path2D(), new Path2D(), new Path2D(), new Path2D()];
  for (let i = 0; i < M; i++) {
    const ia = Math.floor((i * A.n) / M), ib = Math.floor((i * B.n) / M);
    const d = hash(i * 7 + 3) * 0.42;
    const u = ease(clamp((m - d) / 0.58));
    const swirl = Math.sin(Math.PI * u) * (hash(i * 13 + 1) - 0.5) * 70;
    const p = paths[u < 0.5 ? A.tipo[ia] : B.tipo[ib]];
    for (let s = 0; s < K; s++) {
      const x = lerp(A.kp[(ia * K + s) * 2], B.kp[(ib * K + s) * 2], u) + swirl;
      const y = lerp(A.kp[(ia * K + s) * 2 + 1], B.kp[(ib * K + s) * 2 + 1], u) - swirl * 0.6;
      if (s === 0) p.moveTo(x, y); else p.lineTo(x, y);
    }
  }
  preparar(ctx, tr, alfa);
  for (let t = 0; t < 5; t++) {
    ctx.lineWidth = STYLE[t].w / Math.max(tr.s, 0.0001) * Math.max(0.55, Math.min(tr.s * 1.2, 2.2));
    ctx.strokeStyle = STYLE[t].c;
    ctx.globalAlpha = alfa * STYLE[t].a;
    ctx.stroke(paths[t]);
  }
  ctx.restore();
}

export function drawWash(ctx, P, tr, alfa) {
  if (!P.aguada || alfa <= 0.002) return;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = alfa;
  ctx.drawImage(P.aguada, tr.x, tr.y, P.W * tr.s, P.H * tr.s);
  ctx.restore();
}

// retrato completo: usa una copia en canvas para no reconstruir 8000 trazos en cada cuadro
export function cachedStrokes(P, q) {
  q = Math.min(1.3, Math.max(0.3, q));
  if (P.cache && Math.abs(P.cache.q - q) < 0.08) return P.cache.c;
  const c = document.createElement('canvas');
  c.width = Math.round(P.W * q);
  c.height = Math.round(P.H * q);
  const cx = c.getContext('2d');
  drawStrokes(cx, P, P.n, 0, { x: 0, y: 0, s: q }, 1);
  P.cache = { q, c };
  return c;
}

/**
 * trazos que se sueltan y se vuelven polillas. seg: segundos desde el inicio de la fase.
 * o = { target:[x,y], escala (px por unidad de pantalla), noche 0..1, soltar:[desde, rango], vuelo:[min, rango], tam, fade }
 */
export function releaseToMoths(ctx, P, tr, seg, o) {
  const [lx, ly] = o.target, sh = o.escala || 1, noche = o.noche || 0;
  const [r0, rr] = o.soltar || [2.6, 2.6], [v0, vr] = o.vuelo || [3.4, 2.4], tamBase = o.tam || 5.5;
  const paths = [new Path2D(), new Path2D(), new Path2D(), new Path2D(), new Path2D()];
  const alas = new Path2D(), cuerpos = new Path2D();
  for (let i = 0; i < P.n; i++) {
    const cyp = P.cen[i * 2 + 1];
    const rel = r0 + rr * (cyp / 1500) + 0.8 * hash(i * 3 + 7);
    const vuelo = v0 + vr * hash(i * 5 + 1);
    const a = P.off[i], b = P.off[i + 1];
    if (seg < rel) {
      const k = seg > rel - 1.2 ? 1 - (rel - seg) / 1.2 : 0;
      const jx = k * 2.2 * Math.sin(seg * 31 + i), jy = k * 2.2 * Math.cos(seg * 27 + i * 2);
      const p = paths[P.tipo[i]];
      p.moveTo(P.raw[a * 2] + jx, P.raw[a * 2 + 1] + jy);
      for (let q = a + 1; q < b; q++) p.lineTo(P.raw[q * 2] + jx, P.raw[q * 2 + 1] + jy);
      continue;
    }
    const s = clamp((seg - rel) / vuelo);
    const sx = tr.x + P.cen[i * 2] * tr.s, sy = tr.y + cyp * tr.s;
    const e = Math.pow(s, 1.5);
    const amp = (1 - s) * 130 * sh * (0.4 + hash(i + 4)), ph = hash(i + 11) * TAU;
    let x = lerp(sx, lx, e) + Math.sin(seg * 2.6 + ph) * amp;
    let y = lerp(sy, ly, e) + Math.cos(seg * 2.1 + ph * 2) * amp * 0.6 - Math.sin(Math.PI * s) * 70 * sh;
    if (s >= 1) {
      const orb = (20 + 90 * hash(i + 21)) * sh, an = seg * (0.8 + hash(i + 31) * 1.2) + ph;
      x = lx + Math.cos(an) * orb * (0.6 + 0.4 * Math.sin(seg * 0.7 + ph)); y = ly + Math.sin(an * 1.3) * orb * 0.7;
    }
    const tam = (tamBase + (tamBase * 0.9) * hash(i + 41)) * sh, fl = Math.sin(seg * (20 + hash(i + 51) * 10) + ph) * 0.9;
    const dir = Math.atan2(ly - y, lx - x) + (hash(i + 61) - 0.5) * 1.2;
    for (const sg of [-1, 1]) {
      const an = dir + sg * (0.55 + Math.abs(fl) * 0.7);
      alas.moveTo(x, y); alas.lineTo(x + Math.cos(an) * tam * 1.6, y + Math.sin(an) * tam * 1.6); alas.lineTo(x + Math.cos(an + sg * 0.9) * tam, y + Math.sin(an + sg * 0.9) * tam); alas.closePath();
    }
    cuerpos.moveTo(x, y); cuerpos.lineTo(x - Math.cos(dir) * tam * 0.9, y - Math.sin(dir) * tam * 0.9);
  }
  ctx.save(); ctx.translate(tr.x, tr.y); ctx.scale(tr.s, tr.s); ctx.lineCap = 'round';
  for (let tp = 0; tp < 5; tp++) {
    ctx.lineWidth = STYLE[tp].w / tr.s * Math.max(0.55, Math.min(tr.s * 1.2, 2.2));
    const c = [107, 58, 31].map((v, j) => Math.round(lerp(v, [240, 226, 190][j], noche)));
    ctx.strokeStyle = `rgb(${c[0]},${c[1]},${c[2]})`; ctx.globalAlpha = STYLE[tp].a;
    ctx.stroke(paths[tp]);
  }
  ctx.restore();
  ctx.save(); ctx.globalAlpha = 0.92;
  const cm = [107, 58, 31].map((v, j) => Math.round(lerp(v, [244, 232, 196][j], 0.25 + 0.75 * noche)));
  ctx.fillStyle = `rgb(${cm[0]},${cm[1]},${cm[2]})`; ctx.fill(alas); ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1; ctx.stroke(cuerpos);
  ctx.restore();
}
