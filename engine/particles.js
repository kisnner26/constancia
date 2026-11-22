// particles.js: particulas parametricas y deterministas (se pueden saltar a cualquier instante).
//   sprite(rgb, n)                                  -> canvas con un resplandor radial
//   fireflies(ctx, view, ta, opts)                  -> luciernagas: { n, area:{x,y,rx,ry}, alfa, escala, llegada(i) }
//   firefly(ctx, x, y, r, a, ta, fase)              -> una luciernaga que parpadea
//   morse(ctx, view, ta, x, y, alfa, r, texto)      -> luciernaga que parpadea un texto en morse, en bucle
//   moths(ctx, view, ta, opts)                      -> luciernagas que se vuelven polillas: { n, cx, cy, rx, ry, morph, alfa }
//   dust(ctx, view, ta, opts)                       -> polvo arrastrado por el viento: { n, alfa, color }
//   class NeuralNet(opts)                           -> red de neuronas con disparos en cadena, dendritas y un atractor de lorenz
import { clamp, lerp, sstep, ease, easeOut, rng, hash, TAU } from './util.js';

export function sprite(rgb, n = 96) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  g.addColorStop(0, `rgba(${rgb},1)`); g.addColorStop(0.15, `rgba(${rgb},0.8)`); g.addColorStop(0.45, `rgba(${rgb},0.18)`); g.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = g; x.fillRect(0, 0, n, n);
  return c;
}
export const SPR = { luz: null, calida: null };
function sprites() { if (!SPR.luz) { SPR.luz = sprite('255,236,150'); SPR.calida = sprite('255,190,110'); } return SPR; }

export function firefly(ctx, x, y, r, a, ta, fase = 0) {
  const S = sprites();
  const b = Math.pow(Math.max(0, Math.sin(((ta / 3.1) + fase) * Math.PI)), 4);
  const al = (0.18 + 0.82 * b) * a;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = al; ctx.drawImage(S.luz, x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
  ctx.globalAlpha = Math.min(1, al * 1.4); ctx.fillStyle = '#fff7cc'; ctx.fillRect(x - r * 0.12, y - r * 0.12, r * 0.24, r * 0.24);
  ctx.restore();
}

export function fireflies(ctx, view, ta, o = {}) {
  const { w, h, u } = view;
  const n = o.n ?? 20, base = Math.min(w, h);
  const ar = o.area || { x: w / 2, y: h * 0.55, rx: w * 0.45, ry: h * 0.3 };
  for (let i = 0; i < n; i++) {
    const ai = o.llegada ? o.llegada(i) : 0;
    const vis = sstep(ai, ai + 1.6, ta);
    if (vis <= 0) continue;
    const hx = hash(i * 3 + 1), hy = hash(i * 3 + 2), hp = hash(i * 3 + 3);
    const ax = base * (0.03 + 0.05 * hash(i + 90)), ay = base * (0.02 + 0.04 * hash(i + 91));
    const fx = 0.11 + 0.17 * hash(i + 92), fy = 0.09 + 0.15 * hash(i + 93);
    const x = ar.x + (hx - 0.5) * 2 * ar.rx + Math.sin(ta * fx * TAU + hp * 9) * ax;
    const y = ar.y + (hy - 0.5) * 2 * ar.ry + Math.cos(ta * fy * TAU + hp * 5) * ay;
    firefly(ctx, x, y, u * 1.6 * (o.escala ?? 1) * (0.8 + 0.4 * hash(i + 95)), vis * (o.alfa ?? 1), ta + i * 1.3, hash(i));
  }
}

function morseTabla(texto) {
  const letras = { a: '.-', b: '-...', c: '-.-.', d: '-..', e: '.', f: '..-.', g: '--.', h: '....', i: '..', j: '.---', k: '-.-', l: '.-..', m: '--', n: '-.', o: '---', p: '.--.', q: '--.-', r: '.-.', s: '...', t: '-', u: '..-', v: '...-', w: '.--', x: '-..-', y: '-.--', z: '--..' };
  const unidad = 0.3; const ev = []; let t = 0;
  for (const ch of texto) { for (const s of letras[ch] || '') { const d = s === '.' ? 1 : 3; ev.push([t, t + d * unidad]); t += d * unidad + unidad; } t += 2 * unidad; }
  return { ev, total: t + 4 * unidad };
}
const MORSE = {};
export function morse(ctx, view, ta, x, y, alfa, r, texto = 'aqui') {
  const M = MORSE[texto] || (MORSE[texto] = morseTabla(texto));
  const S = sprites();
  const t = ta % M.total;
  let on = 0;
  for (const [a, b] of M.ev) if (t >= a && t < b) { on = Math.min(1, Math.min(t - a, b - t) / 0.05); break; }
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = (0.1 + 0.9 * on) * alfa; ctx.drawImage(S.luz, x - r * 2.4, y - r * 2.4, r * 4.8, r * 4.8);
  ctx.fillStyle = '#fffbe0'; ctx.globalAlpha = (0.2 + 0.8 * on) * alfa; ctx.fillRect(x - r * 0.1, y - r * 0.1, r * 0.2, r * 0.2);
  ctx.restore();
}

export function moths(ctx, view, ta, o) {
  const S = sprites();
  const { n = 24, cx, cy, rx, ry, morph = 1, alfa = 1 } = o;
  const sh = Math.min(view.w, view.h) / 700;
  const alas = new Path2D();
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const ph = hash(i * 7 + 2) * TAU;
    const a = ta * (0.25 + hash(i + 14) * 0.45) + ph;
    const x = cx + Math.cos(a) * rx * (0.3 + hash(i + 12)) + Math.sin(ta * 0.9 + ph) * 10 * sh;
    const y = cy + Math.sin(a * 1.3) * ry * (0.3 + hash(i + 13));
    const b = Math.pow(Math.max(0, Math.sin(ta / (2.5 + hash(i) * 2) * Math.PI + ph)), 4);
    ctx.globalAlpha = (1 - morph) * (0.2 + 0.8 * b) * alfa;
    const r = sh * 10;
    ctx.drawImage(S.luz, x - r, y - r, r * 2, r * 2);
    const tam = (3.4 + 2.6 * hash(i + 15)) * sh * morph;
    if (tam > 0.3) {
      const fl = Math.sin(ta * (18 + hash(i + 16) * 8) + ph) * 0.9, dir = a + Math.PI / 2;
      for (const sg of [-1, 1]) {
        const an = dir + sg * (0.55 + Math.abs(fl) * 0.7);
        alas.moveTo(x, y); alas.lineTo(x + Math.cos(an) * tam * 1.6, y + Math.sin(an) * tam * 1.6); alas.lineTo(x + Math.cos(an + sg * 0.9) * tam, y + Math.sin(an + sg * 0.9) * tam); alas.closePath();
      }
    }
  }
  ctx.globalAlpha = 0.8 * alfa * morph; ctx.fillStyle = '#ecd8aa'; ctx.fill(alas);
  ctx.restore();
}

export function dust(ctx, view, ta, o = {}) {
  const { w, h } = view;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = o.color || '#ffc890'; ctx.lineWidth = 1;
  for (let i = 0; i < (o.n ?? 80); i++) {
    const sp = 40 + 120 * hash(i + 3);
    const x = ((hash(i * 3 + 1) * w * 1.3 - ta * sp) % (w * 1.3) + w * 1.3) % (w * 1.3) - w * 0.15;
    const y = h * (0.5 + 0.48 * hash(i * 3 + 2)) + Math.sin(ta * 0.7 + i) * 6;
    ctx.globalAlpha = (o.alfa ?? 1) * (0.08 + 0.22 * hash(i + 9));
    const l = 6 + sp * 0.25;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + l, y - l * 0.08); ctx.stroke();
  }
  ctx.restore();
}

/**
 * red neuronal: neuronas en un volumen con forma de cerebro, vecinos mas cercanos, disparos en cadena,
 * dendritas que crecen (l-system) y un atractor de lorenz en el centro.
 * render(ctx, view, tl, o): o = { dur, atrav (0..1: la camara atraviesa la red), zoom, pivote:[x,y], ent, reducir }
 *   - zoom > 1 acerca la imagen alrededor de la neurona semilla, que se coloca en `pivote` (p. ej. donde estaba una luciernaga)
 */
export class NeuralNet {
  constructor({ N = 1500, seed = 2026, dendritas = 24, reducir = false } = {}) {
    const r = rng(seed);
    N = reducir ? Math.min(N, 450) : N;
    const X = new Float32Array(N), Y = new Float32Array(N), Z = new Float32Array(N);
    let n = 0;
    while (n < N) {
      let x = (r() * 2 - 1) * 1.15, y = (r() * 2 - 1) * 0.82, z = (r() * 2 - 1) * 0.95;
      if (y < -0.35) { const k = 1 - (-0.35 - y) * 0.9; x *= k; z *= k; }
      const e = (x / 1.15) ** 2 + (y / 0.82) ** 2 + (z / 0.95) ** 2;
      if (e > 1) continue;
      const sh = Math.sqrt(e);
      if (r() > 0.2 + 0.8 * sh * sh) continue;
      if (Math.abs(x) < 0.07) continue;
      const f = 1 + 0.045 * Math.sin(x * 9 + z * 6) * Math.sin(y * 8 + x * 3);
      X[n] = x * f; Y[n] = y * f; Z[n] = z * f; n++;
    }
    const KN = 3, ady = [], edges = [];
    for (let i = 0; i < N; i++) ady.push([]);
    for (let i = 0; i < N; i++) {
      const d = [];
      for (let j = 0; j < N; j++) { if (i === j) continue; const dx = X[i] - X[j], dy = Y[i] - Y[j], dz = Z[i] - Z[j]; d.push([dx * dx + dy * dy + dz * dz, j]); }
      d.sort((a, b) => a[0] - b[0]);
      for (let k = 0; k < KN; k++) { const j = d[k][1]; edges.push([i, j]); ady[i].push(j); ady[j].push(i); }
    }
    // la neurona semilla esta cerca del centro de la imagen
    let semilla = 0, mejor = 9;
    for (let i = 0; i < N; i++) { const d = Math.abs(X[i] + 0.1) + Math.abs(Y[i]) + Math.abs(Z[i] - 0.55); if (d < mejor) { mejor = d; semilla = i; } }
    const semillas = [semilla, ...[1, 2, 3].map(() => Math.floor(r() * N))];
    const hop = semillas.map((s) => {
      const dist = new Int16Array(N).fill(-1); const cola = [s]; dist[s] = 0;
      for (let q = 0; q < cola.length; q++) { const u = cola[q]; for (const v of ady[u]) if (dist[v] < 0) { dist[v] = dist[u] + 1; cola.push(v); } }
      return dist;
    });
    const seg = [];
    for (let a = 0; a < (reducir ? 8 : dendritas); a++) {
      const s = Math.floor(r() * N);
      const ln = Math.hypot(X[s], Y[s], Z[s]) || 1;
      const rec = (p, d, len, prof, nac) => {
        const q = [p[0] + d[0] * len, p[1] + d[1] * len, p[2] + d[2] * len];
        seg.push([p[0], p[1], p[2], q[0], q[1], q[2], nac, prof]);
        if (prof >= 5) return;
        const ramas = r() < 0.35 ? 3 : 2;
        for (let k = 0; k < ramas; k++) {
          const nd = [d[0] + (r() - 0.5) * 1.3, d[1] + (r() - 0.5) * 1.3, d[2] + (r() - 0.5) * 1.3];
          const m = Math.hypot(...nd) || 1;
          rec(q, [nd[0] / m, nd[1] / m, nd[2] / m], len * (0.7 + r() * 0.1), prof + 1, nac + 0.8 + r() * 0.5);
        }
      };
      rec([X[s], Y[s], Z[s]], [X[s] / ln, Y[s] / ln, Z[s] / ln], 0.2, 0, a * 0.7 + 3);
    }
    const NL = 4200;
    const LX = new Float32Array(NL), LY = new Float32Array(NL), LZ = new Float32Array(NL);
    let x = 1, y = 1, z = 1;
    for (let i = 0; i < 800; i++) { const dx = 10 * (y - x), dy = x * (28 - z) - y, dz = x * y - 8 / 3 * z; x += dx * 0.006; y += dy * 0.006; z += dz * 0.006; }
    for (let i = 0; i < NL; i++) {
      const dx = 10 * (y - x), dy = x * (28 - z) - y, dz = x * y - 8 / 3 * z;
      x += dx * 0.006; y += dy * 0.006; z += dz * 0.006;
      LX[i] = (x / 20) * 0.46; LY[i] = ((z - 25) / 26) * 0.46; LZ[i] = (y / 27) * 0.46;
    }
    const NS = reducir ? 200 : 700;
    const stars = new Float32Array(NS * 3);
    for (let i = 0; i < NS; i++) { stars[i * 3] = (r() * 2 - 1) * 3; stars[i * 3 + 1] = (r() * 2 - 1) * 2; stars[i * 3 + 2] = r() * 4 - 1; }
    Object.assign(this, { N, X, Y, Z, edges, hop, semilla, periodos: [4.4, 5.9, 7.3, 3.7], fases: [0.5, 2.1, 3.9, 1.3], seg, LX, LY, LZ, NL, stars, NS, reducir,
      sx: new Float32Array(N), sy: new Float32Array(N), sz: new Float32Array(N), br: new Float32Array(N), tau: new Float32Array(N) });
  }

  render(ctx, view, tl, o = {}) {
    const S = sprites();
    const { w, h } = view;
    const M = this;
    const ent = o.ent ?? 1, atrav = o.atrav ?? 0, Z = Math.max(1, o.zoom ?? 1);
    const cx = w / 2, cy = h / 2;
    const ang = 0.4 + tl * 0.16, pit = 0.22 + 0.07 * Math.sin(tl * 0.21);
    const ca = Math.cos(ang), sa = Math.sin(ang), cp = Math.cos(pit), sp = Math.sin(pit);
    const f = h * 1.5, camZ = atrav * 4.4;
    const proy = (x, y, z, out) => {
      const x1 = x * ca + z * sa, z1 = -x * sa + z * ca;
      const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
      const d = 3.0 + z2 - camZ;
      if (d < 0.12) { out[2] = 99; return; }
      out[0] = cx + (x1 * f) / d; out[1] = cy + (y2 * f) / d; out[2] = z2; out[3] = d;
    };
    const pt = [0, 0, 0, 1];
    for (let i = 0; i < M.N; i++) {
      proy(M.X[i], M.Y[i], M.Z[i], pt);
      M.sx[i] = pt[0]; M.sy[i] = pt[1]; M.sz[i] = pt[2];
      let b = 0, tmin = 9;
      for (let s = 0; s < 4; s++) {
        const hp = M.hop[s][i];
        if (hp < 0 || hp > 50) continue;
        let tau = tl - M.fases[s] - hp * 0.07;
        if (tau < 0) continue;
        tau = tau % M.periodos[s];
        const v = Math.exp(-tau * 2.6);
        if (v > b) { b = v; tmin = tau; }
      }
      M.br[i] = b; M.tau[i] = tmin;
    }
    ctx.save();
    // zoom alrededor de la neurona semilla, que se mantiene en el pivote
    if (Z > 1) {
      const p0 = [M.sx[M.semilla], M.sy[M.semilla]];
      const piv = o.pivote || p0;
      const k = clamp((Z - 1) / 13);
      const tx = lerp(p0[0], piv[0], k), ty = lerp(p0[1], piv[1], k);
      ctx.translate(tx, ty); ctx.scale(Z, Z); ctx.translate(-p0[0], -p0[1]);
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = '#9fb4ff';
    for (let i = 0; i < M.NS; i++) {
      const x = M.stars[i * 3], y = M.stars[i * 3 + 1], z = M.stars[i * 3 + 2];
      const d = 3.4 + z - camZ * 0.8;
      if (d < 0.2) continue;
      ctx.globalAlpha = (0.25 + 0.6 * atrav) * ent;
      const s = 0.8 + atrav * 2.2 / d;
      ctx.fillRect(cx + (x * f * 0.35) / d, cy + (y * f * 0.35) / d, s, s);
    }
    const vis = (i) => M.sz[i] < 50;
    ctx.strokeStyle = '#4a73d6'; ctx.globalAlpha = 0.2 * ent * (1 - atrav); ctx.lineWidth = 0.7 / Math.sqrt(Z);
    ctx.beginPath();
    for (const [a, b] of M.edges) if (vis(a) && vis(b)) { ctx.moveTo(M.sx[a], M.sy[a]); ctx.lineTo(M.sx[b], M.sy[b]); }
    ctx.stroke();
    ctx.strokeStyle = '#ffc060'; ctx.lineWidth = 1.3 / Math.sqrt(Z); ctx.globalAlpha = 0.9 * ent * (1 - atrav * 0.7);
    ctx.beginPath();
    const pulsos = [];
    for (const [a, b] of M.edges) {
      if (M.br[a] > 0.22 && vis(a) && vis(b)) {
        ctx.moveTo(M.sx[a], M.sy[a]);
        const mx = (M.sx[a] + M.sx[b]) / 2 + (hash(a * 7 + b) - 0.5) * 6, my = (M.sy[a] + M.sy[b]) / 2 + (hash(a * 3 + b) - 0.5) * 6;
        ctx.lineTo(mx, my); ctx.lineTo(M.sx[b], M.sy[b]);
        if (M.tau[a] < 0.26) pulsos.push([a, b, M.tau[a] / 0.26]);
      }
    }
    ctx.stroke();
    ctx.fillStyle = '#fff6d0';
    for (const [a, b, u] of pulsos) {
      ctx.globalAlpha = 0.95 * ent;
      const x = lerp(M.sx[a], M.sx[b], u), y = lerp(M.sy[a], M.sy[b], u);
      ctx.fillRect(x - 1.6 / Math.sqrt(Z), y - 1.6 / Math.sqrt(Z), 3.2 / Math.sqrt(Z), 3.2 / Math.sqrt(Z));
    }
    for (let i = 0; i < M.N; i++) {
      if (!vis(i)) continue;
      const d = 3.0 + M.sz[i] - camZ;
      const prof = clamp((M.sz[i] + 1) / 2), b = M.br[i];
      const base = (1.7 + b * 3.4) * (h / 800 + 0.6) * (atrav > 0 ? (1 + atrav * 2.4 / Math.max(d, 0.3)) : 1);
      ctx.globalAlpha = (0.5 + 0.5 * Math.min(1, b)) * ent * (0.6 + 0.4 * (1 - prof));
      ctx.fillStyle = atrav > 0.4 ? '#dfe8ff' : b > 0.35 ? '#ffe0a0' : prof < 0.5 ? '#ffb858' : '#7aa4ff';
      ctx.fillRect(M.sx[i] - base / 2, M.sy[i] - base / 2, base, base);
      if ((b > 0.45 || (Z > 3 && i === M.semilla)) && !M.reducir) {
        ctx.globalAlpha = Math.min(1, (b - 0.3) * 0.9) * ent;
        const g = base * 6;
        ctx.drawImage(S.calida, M.sx[i] - g, M.sy[i] - g, g * 2, g * 2);
      }
    }
    ctx.strokeStyle = '#ffd08a'; ctx.lineWidth = 0.9 / Math.sqrt(Z); ctx.globalAlpha = 0.6 * ent * (1 - atrav); ctx.beginPath();
    const p1 = [0, 0, 0, 1], p2 = [0, 0, 0, 1];
    for (const s of M.seg) {
      const g = clamp((tl - s[6]) / 0.9);
      if (g <= 0) continue;
      proy(s[0], s[1], s[2], p1);
      proy(s[0] + (s[3] - s[0]) * g, s[1] + (s[4] - s[1]) * g, s[2] + (s[5] - s[2]) * g, p2);
      if (p1[2] > 50 || p2[2] > 50) continue;
      ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]);
    }
    ctx.stroke();
    if (atrav < 0.8) {
      const cab = Math.floor((tl * 160 + 600) % M.NL), largo = 760;
      ctx.lineWidth = 1.5 / Math.sqrt(Z);
      for (let k = 0; k < 14; k++) {
        ctx.beginPath();
        const a0 = Math.floor((k / 14) * largo), a1 = Math.floor(((k + 1) / 14) * largo);
        for (let q = a0; q <= a1; q++) {
          const idx = (cab - largo + q + M.NL * 3) % M.NL;
          proy(M.LX[idx], M.LY[idx], M.LZ[idx], pt);
          if (q === a0) ctx.moveTo(pt[0], pt[1]); else ctx.lineTo(pt[0], pt[1]);
        }
        const u = (k + 1) / 14;
        ctx.strokeStyle = `rgb(${Math.round(lerp(90, 255, u))},${Math.round(lerp(120, 214, u))},${Math.round(lerp(255, 130, u))})`;
        ctx.globalAlpha = (0.12 + 0.8 * u * u) * ent * (1 - atrav);
        ctx.stroke();
      }
      proy(M.LX[cab], M.LY[cab], M.LZ[cab], pt);
      ctx.globalAlpha = ent * (1 - atrav);
      const g = h * 0.06;
      ctx.drawImage(S.luz, pt[0] - g, pt[1] - g, g * 2, g * 2);
    }
    ctx.restore();
  }
}
