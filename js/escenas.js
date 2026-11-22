// las siete escenas. cada una es una funcion pura del tiempo local: se puede saltar a cualquier punto.
import { clamp, lerp, sstep, ease, easeOut, rng, hash, noise1, TAU } from './util.js';
import { dibujarTrazos, dibujarMorph, dibujarAguada, cacheCompleto, ESTILO } from './retratos.js';

const EDADES = ['nino', 'adolescente', 'adulto', 'viejo', 'muerte'];
const NOMBRE_EDAD = { nino: 'niño', adolescente: 'adolescente', adulto: 'adulto', viejo: 'viejo', muerte: 'muerte' };

// ---------------------------------------------------------------- sprites
function sprite(rgb, n = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  g.addColorStop(0, `rgba(${rgb},1)`);
  g.addColorStop(0.18, `rgba(${rgb},0.75)`);
  g.addColorStop(0.5, `rgba(${rgb},0.16)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = g;
  x.fillRect(0, 0, n, n);
  return c;
}

function papel(w, h) {
  // textura de papel crema generada en codigo
  const tile = document.createElement('canvas');
  tile.width = tile.height = 256;
  const x = tile.getContext('2d');
  const id = x.createImageData(256, 256);
  const r = rng(5);
  for (let i = 0; i < 256 * 256; i++) {
    const v = (r() - 0.5) * 16 + (r() - 0.5) * 10;
    id.data[i * 4] = 128 + v;
    id.data[i * 4 + 1] = 128 + v;
    id.data[i * 4 + 2] = 128 + v;
    id.data[i * 4 + 3] = 255;
  }
  x.putImageData(id, 0, 0);
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(w));
  c.height = Math.max(2, Math.round(h));
  const g = c.getContext('2d');
  g.fillStyle = '#e8dbbd';
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'overlay';
  g.globalAlpha = 0.55;
  g.fillStyle = g.createPattern(tile, 'repeat');
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  const v = g.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.3, c.width / 2, c.height / 2, Math.hypot(c.width, c.height) * 0.62);
  v.addColorStop(0, 'rgba(120,80,40,0)');
  v.addColorStop(1, 'rgba(90,55,25,0.38)');
  g.fillStyle = v;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

export function crearEscenas(env) {
  const { ctx, G, R, reducir } = env;
  const SPR_LUZ = sprite('255,236,150');
  const SPR_CALIDA = sprite('255,190,110');
  let papelC = null, papelKey = '';
  const getPapel = (w, h) => {
    const k = `${w}x${h}`;
    if (k !== papelKey) { papelC = papel(w, h); papelKey = k; }
    return papelC;
  };

  // ------------------------------------------------------------ luciernagas
  function luciernagas(S, n, opt = {}) {
    const { w, h, ta } = S;
    const base = Math.min(w, h);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const ai = opt.llegada ? opt.llegada(i) : 0;
      const vis = sstep(ai, ai + 1.6, ta);
      if (vis <= 0) continue;
      const hx = hash(i * 3 + 1), hy = hash(i * 3 + 2), hp = hash(i * 3 + 3);
      const ax = base * (0.03 + 0.05 * hash(i + 90)), ay = base * (0.02 + 0.04 * hash(i + 91));
      const fx = 0.11 + 0.17 * hash(i + 92), fy = 0.09 + 0.15 * hash(i + 93);
      const x0 = opt.x0 !== undefined ? opt.x0 + (hx - 0.5) * opt.rx : w * (0.1 + 0.8 * hx);
      const y0 = opt.y0 !== undefined ? opt.y0 + (hy - 0.5) * opt.ry : h * (0.18 + 0.66 * hy);
      const x = x0 + Math.sin(ta * fx * TAU + hp * 9) * ax + Math.sin(ta * fx * 2.3 + i) * ax * 0.4;
      const y = y0 + Math.cos(ta * fy * TAU + hp * 5) * ay;
      const per = 2.6 + 3.2 * hash(i + 94);
      const ph = (ta / per + hp * 7) % 1;
      const b = Math.pow(Math.max(0, Math.sin(ph * Math.PI * 1)), 5);
      const a = (0.12 + 0.88 * b) * vis * (opt.alfa ?? 1);
      const r = base * (0.012 + 0.006 * hash(i + 95)) * (0.7 + 0.8 * b) * (opt.escala ?? 1);
      ctx.globalAlpha = a;
      ctx.drawImage(SPR_LUZ, x - r * 2, y - r * 2, r * 4, r * 4);
      ctx.globalAlpha = Math.min(1, a * 1.3);
      ctx.fillStyle = '#fff6c8';
      ctx.fillRect(x - 0.9, y - 0.9, 1.8, 1.8);
    }
    ctx.restore();
  }

  // luciernaga que parpadea "aqui" en morse
  const MORSE = (() => {
    const letras = { a: '.-', q: '--.-', u: '..-', i: '..' };
    const u = 0.3;
    const ev = [];
    let t = 0;
    for (const ch of 'aqui') {
      for (const s of letras[ch]) {
        const d = s === '.' ? 1 : 3;
        ev.push([t, t + d * u]);
        t += d * u + u;
      }
      t += 2 * u; // 3 unidades entre letras (1 ya sumada)
    }
    t += 4 * u; // 7 entre palabras
    return { ev, total: t };
  })();

  function morse(S, x, y, alfa) {
    const t = S.ta % MORSE.total;
    let on = 0;
    for (const [a, b] of MORSE.ev) {
      if (t >= a && t < b) { on = Math.min(1, Math.min(t - a, b - t) / 0.05 + 0.0); break; }
    }
    const base = Math.min(S.w, S.h);
    const r = base * 0.022;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (0.12 + 0.88 * on) * alfa;
    ctx.drawImage(SPR_LUZ, x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
    ctx.fillStyle = '#fffbe0';
    ctx.globalAlpha = (0.25 + 0.75 * on) * alfa;
    ctx.fillRect(x - 1.3, y - 1.3, 2.6, 2.6);
    ctx.restore();
  }

  // ------------------------------------------------------------ 0 prologo
  function prologo(S) {
    const { w, h } = S;
    ctx.fillStyle = '#0b0705';
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createRadialGradient(w / 2, h * 0.55, 0, w / 2, h * 0.55, Math.hypot(w, h) * 0.6);
    g.addColorStop(0, 'rgba(60,34,16,0.28)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    luciernagas(S, reducir ? 7 : 18, { llegada: (i) => 1.5 + i * 0.62 });
  }

  // ------------------------------------------------------------ 1 las 2am
  let fig = null; // copias del retrato para la luz de la pantalla
  function prepararFigura() {
    const P = R.adolescente;
    if (fig || !P || !P.poster) return;
    const q = 0.62;
    const mk = () => { const c = document.createElement('canvas'); c.width = Math.round(1200 * q); c.height = Math.round(1500 * q); return c; };
    const base = mk();
    const b = base.getContext('2d');
    b.drawImage(P.poster, 0, 0, base.width, base.height);
    // borde difuso de hoja
    b.globalCompositeOperation = 'destination-in';
    b.save();
    b.translate(560 * q, 740 * q);
    b.scale(1, 1.25);
    const gr = b.createRadialGradient(0, 0, 330 * q, 0, 0, 520 * q);
    gr.addColorStop(0, 'rgba(0,0,0,1)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    b.fillStyle = gr;
    b.fillRect(-900 * q, -900 * q, 1800 * q, 1800 * q);
    b.restore();
    const oscuro = mk();
    const o = oscuro.getContext('2d');
    o.drawImage(base, 0, 0);
    o.globalCompositeOperation = 'multiply';
    o.fillStyle = '#6a6678';
    o.fillRect(0, 0, oscuro.width, oscuro.height);
    o.globalCompositeOperation = 'destination-in';
    o.drawImage(base, 0, 0);
    const frio = mk();
    const f = frio.getContext('2d');
    f.drawImage(base, 0, 0);
    f.globalCompositeOperation = 'multiply';
    f.fillStyle = '#d4e0ff';
    f.fillRect(0, 0, frio.width, frio.height);
    f.globalCompositeOperation = 'destination-in';
    f.drawImage(base, 0, 0);
    fig = { q, oscuro, frio, mask: mk() };
  }

  function layout2am(w, h) {
    const land = w / h > 1.05;
    let sw, sh, cx, cy, sc, fx, fy, desk;
    if (land) {
      sw = Math.min(w * 0.40, h * 0.74); sh = sw * 0.62;
      cx = w * 0.69; cy = h * 0.45;
      sc = (h * 0.80) / 1500;
      desk = h * 0.80;
      fx = w * 0.31 - 580 * sc;
      fy = desk - 1250 * sc;
    } else {
      sw = w * 0.86; sh = sw * 0.62;
      cx = w * 0.5; cy = h * 0.735;
      sc = Math.min((h * 0.5) / 1150, (w * 1.15) / 900);
      fy = h * 0.04 - 190 * sc;
      fx = w * 0.5 - 580 * sc;
      desk = fy + 1235 * sc;
    }
    const A = [cx - sw / 2, cy - sh / 2];
    const B = [cx + sw / 2, cy - sh / 2 + sh * 0.025];
    const C = [cx + sw / 2, cy + sh / 2 - sh * 0.035];
    const D = [cx - sw / 2, cy + sh / 2];
    return { land, sw, sh, cx, cy, sc, fx, fy, desk, A, B, C, D };
  }

  function dosam(S) {
    const { w, h, t } = S;
    const L = layout2am(w, h);
    prepararFigura();
    const ent = sstep(0, 3.0, t);
    const pantalla = sstep(1.2, 4.0, t);
    // zoom hacia la sien al final
    const zt = ease(clamp((t - 35) / 7));
    const zoom = 1 + 5.2 * zt;
    const temp = [L.fx + 860 * L.sc, L.fy + 560 * L.sc];
    // gl: la pantalla animada
    const gs = env.glEscala;
    G.dibujar('torres', {
      uRes: [env.gw, env.gh], uT: S.ta,
      uA: [L.A[0] * gs, L.A[1] * gs], uB: [L.B[0] * gs, L.B[1] * gs], uC: [L.C[0] * gs, L.C[1] * gs], uD: [L.D[0] * gs, L.D[1] * gs],
      uGlow: 0.9 + 0.1 * Math.sin(S.ta * 1.7), uFade: pantalla,
    });
    env.glOp(1 - sstep(36, 39.5, t));
    ctx.save();
    if (zt > 0) {
      ctx.translate(temp[0], temp[1]);
      ctx.scale(zoom, zoom);
      ctx.translate(-temp[0], -temp[1]);
    }
    // el escritorio y el portatil dejan huecos para el shader: dibujamos primero la figura
    if (fig) {
      const fw = 1200 * L.sc, fh = 1500 * L.sc;
      ctx.globalAlpha = ent;
      ctx.drawImage(fig.oscuro, L.fx, L.fy, fw, fh);
      // luz de la pantalla sobre la cara
      const m = fig.mask.getContext('2d');
      m.globalCompositeOperation = 'source-over';
      m.clearRect(0, 0, fig.mask.width, fig.mask.height);
      m.drawImage(fig.frio, 0, 0);
      m.globalCompositeOperation = 'destination-in';
      const q = fig.q;
      const parp = 0.9 + 0.1 * noise1(S.ta * 3.1, 4) + 0.05 * Math.sin(S.ta * 1.7);
      const gx = (L.land ? 1180 : 1100) * q, gy = 760 * q;
      const rg = m.createRadialGradient(gx, gy, 40 * q, gx, gy, 820 * q * parp);
      rg.addColorStop(0, `rgba(0,0,0,${0.95 * pantalla})`);
      rg.addColorStop(0.5, `rgba(0,0,0,${0.5 * pantalla})`);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      m.fillStyle = rg;
      m.fillRect(0, 0, fig.mask.width, fig.mask.height);
      ctx.drawImage(fig.mask, L.fx, L.fy, fw, fh);
      ctx.globalAlpha = 1;
    }
    // escritorio
    const dk = ctx.createLinearGradient(0, L.desk, 0, h);
    dk.addColorStop(0, '#120e10');
    dk.addColorStop(1, '#070506');
    ctx.fillStyle = dk;
    ctx.globalAlpha = ent;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-2000, L.desk, w + 4000, h - L.desk + 2000);
    ctx.moveTo(L.A[0], L.A[1]); ctx.lineTo(L.D[0], L.D[1]); ctx.lineTo(L.C[0], L.C[1]); ctx.lineTo(L.B[0], L.B[1]); ctx.closePath();
    ctx.clip('evenodd');
    ctx.fillRect(-2000, L.desk, w + 4000, h - L.desk + 2000);
    ctx.restore();
    ctx.strokeStyle = 'rgba(190,150,110,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-2000, L.desk); ctx.lineTo(w + 2000, L.desk); ctx.stroke();
    // reflejo de la pantalla en el escritorio
    const rf = ctx.createRadialGradient(L.cx, L.desk + 20, 0, L.cx, L.desk + 20, L.sw * 0.9);
    rf.addColorStop(0, `rgba(120,150,210,${0.16 * pantalla})`);
    rf.addColorStop(1, 'rgba(120,150,210,0)');
    ctx.fillStyle = rf;
    ctx.fillRect(0, L.desk, w, h - L.desk);
    // marco del portatil (con hueco para la pantalla)
    const { A, B, C, D } = L;
    const o = Math.max(7, L.sw * 0.016);
    ctx.beginPath();
    ctx.moveTo(A[0] - o, A[1] - o); ctx.lineTo(B[0] + o, B[1] - o); ctx.lineTo(C[0] + o, C[1] + o * 1.3); ctx.lineTo(D[0] - o, D[1] + o * 1.3); ctx.closePath();
    ctx.moveTo(A[0], A[1]); ctx.lineTo(D[0], D[1]); ctx.lineTo(C[0], C[1]); ctx.lineTo(B[0], B[1]); ctx.closePath();
    ctx.fillStyle = '#0a0809';
    ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(214,186,150,0.45)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(A[0] - o, A[1] - o); ctx.lineTo(B[0] + o, B[1] - o); ctx.lineTo(C[0] + o, C[1] + o * 1.3); ctx.lineTo(D[0] - o, D[1] + o * 1.3); ctx.closePath();
    ctx.stroke();
    // base y teclado
    const bx0 = D[0] - o - L.sw * 0.04, bx1 = C[0] + o + L.sw * 0.04;
    const by0 = D[1] + o * 1.3, by1 = by0 + L.sh * 0.17;
    ctx.beginPath();
    ctx.moveTo(D[0] - o, by0); ctx.lineTo(C[0] + o, by0); ctx.lineTo(bx1, by1); ctx.lineTo(bx0, by1); ctx.closePath();
    const bg = ctx.createLinearGradient(0, by0, 0, by1);
    bg.addColorStop(0, '#1b181b'); bg.addColorStop(1, '#0d0b0d');
    ctx.fillStyle = bg; ctx.fill();
    ctx.strokeStyle = 'rgba(214,186,150,0.35)'; ctx.stroke();
    ctx.strokeStyle = 'rgba(160,140,120,0.16)';
    for (let r = 1; r < 5; r++) {
      const yy = lerp(by0, by1, r / 5);
      const xa = lerp(D[0] - o, bx0, r / 5) + 8, xb = lerp(C[0] + o, bx1, r / 5) - 8;
      ctx.beginPath(); ctx.moveTo(xa, yy); ctx.lineTo(xb, yy); ctx.stroke();
    }
    // brillo de teclas
    const kg = ctx.createLinearGradient(0, by0, 0, by1 + 30);
    kg.addColorStop(0, `rgba(130,160,220,${0.10 * pantalla})`); kg.addColorStop(1, 'rgba(130,160,220,0)');
    ctx.fillStyle = kg; ctx.fillRect(bx0, by0, bx1 - bx0, by1 - by0 + 30);
    // cable blanco de los audifonos: del oido al portatil
    if (fig) {
      const P = (x, y) => [L.fx + x * L.sc, L.fy + y * L.sc];
      const e = P(246, 860), c1 = P(280, 1130), c2 = P(520, 1330), pm = P(760, 1250);
      const dst = [D[0] - o - 6, by0 + (by1 - by0) * 0.35];
      ctx.beginPath();
      ctx.moveTo(e[0], e[1]);
      ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], pm[0], pm[1]);
      ctx.bezierCurveTo(pm[0] + (dst[0] - pm[0]) * 0.4, Math.max(pm[1], L.desk) + 40, dst[0] - 60, dst[1] + 20, dst[0], dst[1]);
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(20,16,18,0.55)'; ctx.lineWidth = 3.2; ctx.stroke();
      ctx.strokeStyle = `rgba(240,234,220,${0.9 * ent})`; ctx.lineWidth = 1.7; ctx.stroke();
      // audifono
      ctx.fillStyle = `rgba(240,234,220,${0.95 * ent})`;
      ctx.beginPath(); ctx.ellipse(e[0], e[1] - 4 * L.sc * 3, 4.5 * L.sc * 3, 6.5 * L.sc * 3, 0.2, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // un poco de nieve que se cuela delante (2d, escasa)
    if (!reducir) {
      ctx.save();
      ctx.globalAlpha = 0.5 * pantalla;
      ctx.fillStyle = '#cfd8ff';
      for (let i = 0; i < 26; i++) {
        const x = (hash(i * 5 + 1) * w + Math.sin(S.ta * 0.4 + i) * 20 + w) % w;
        const y = (hash(i * 5 + 2) * h + S.ta * (14 + hash(i + 7) * 18)) % h;
        ctx.fillRect(x, y, 1.2, 1.2);
      }
      ctx.restore();
    }
  }

  // ------------------------------------------------------------ 2 la mente
  let mente = null;
  function iniciarMente() {
    const r = rng(2026);
    const N = reducir ? 420 : 1300;
    const X = new Float32Array(N), Y = new Float32Array(N), Z = new Float32Array(N);
    let n = 0;
    while (n < N) {
      let x = (r() * 2 - 1) * 1.15, y = (r() * 2 - 1) * 0.82, z = (r() * 2 - 1) * 0.95;
      if (y < -0.35) { const k = 1 - (-0.35 - y) * 0.9; x *= k; z *= k; }
      const e = (x / 1.15) ** 2 + (y / 0.82) ** 2 + (z / 0.95) ** 2;
      if (e > 1) continue;
      const sh = Math.sqrt(e);
      if (r() > 0.18 + 0.82 * sh * sh) continue;
      if (Math.abs(x) < 0.07) continue;
      // pliegues de la corteza
      const f = 1 + 0.045 * Math.sin(x * 9 + z * 6) * Math.sin(y * 8 + x * 3);
      X[n] = x * f; Y[n] = y * f; Z[n] = z * f;
      n++;
    }
    // vecinos mas cercanos
    const K = 3;
    const ady = [];
    const edges = [];
    for (let i = 0; i < N; i++) ady.push([]);
    for (let i = 0; i < N; i++) {
      const d = [];
      for (let j = 0; j < N; j++) {
        if (i === j) continue;
        const dx = X[i] - X[j], dy = Y[i] - Y[j], dz = Z[i] - Z[j];
        d.push([dx * dx + dy * dy + dz * dz, j]);
      }
      d.sort((a, b) => a[0] - b[0]);
      for (let k = 0; k < K; k++) {
        const j = d[k][1];
        edges.push([i, j]);
        ady[i].push(j); ady[j].push(i);
      }
    }
    // distancias en saltos desde los focos del disparo
    const semillas = [];
    let mejor = 0, md = 9;
    for (let i = 0; i < N; i++) { const d = Math.abs(X[i] - 1.0) + Math.abs(Y[i] - 0.1) + Math.abs(Z[i]); if (d < md) { md = d; mejor = i; } }
    semillas.push(mejor);
    for (let k = 1; k < 4; k++) semillas.push(Math.floor(r() * N));
    const hop = semillas.map((s) => {
      const dist = new Int16Array(N).fill(-1);
      const cola = [s]; dist[s] = 0;
      for (let q = 0; q < cola.length; q++) {
        const u = cola[q];
        for (const v of ady[u]) if (dist[v] < 0) { dist[v] = dist[u] + 1; cola.push(v); }
      }
      return dist;
    });
    const periodos = [5.2, 6.9, 8.3, 4.6], fases = [0.5, 2.1, 3.9, 1.3];
    // dendritas (l-system en 3d)
    const seg = [];
    const arboles = reducir ? 8 : 26;
    for (let a = 0; a < arboles; a++) {
      const s = Math.floor(r() * N);
      const nac = a * 0.9 + 1;
      const dir0 = [X[s], Y[s], Z[s]];
      const ln = Math.hypot(...dir0) || 1;
      const rec = (p, d, len, prof, nac0) => {
        const q = [p[0] + d[0] * len, p[1] + d[1] * len, p[2] + d[2] * len];
        seg.push([p[0], p[1], p[2], q[0], q[1], q[2], nac0, prof]);
        if (prof >= 5) return;
        const ramas = r() < 0.35 ? 3 : 2;
        for (let k = 0; k < ramas; k++) {
          const nd = [d[0] + (r() - 0.5) * 1.3, d[1] + (r() - 0.5) * 1.3, d[2] + (r() - 0.5) * 1.3];
          const m = Math.hypot(...nd) || 1;
          rec(q, [nd[0] / m, nd[1] / m, nd[2] / m], len * (0.7 + r() * 0.1), prof + 1, nac0 + 0.8 + r() * 0.5);
        }
      };
      rec([X[s], Y[s], Z[s]], [dir0[0] / ln, dir0[1] / ln, dir0[2] / ln], 0.2, 0, nac);
    }
    // atractor de lorenz: el pensamiento
    const NL = 4200;
    const LX = new Float32Array(NL), LY = new Float32Array(NL), LZ = new Float32Array(NL);
    let x = 1, y = 1, z = 1;
    for (let i = 0; i < 800; i++) { const dx = 10 * (y - x), dy = x * (28 - z) - y, dz = x * y - 8 / 3 * z; x += dx * 0.006; y += dy * 0.006; z += dz * 0.006; }
    for (let i = 0; i < NL; i++) {
      const dx = 10 * (y - x), dy = x * (28 - z) - y, dz = x * y - 8 / 3 * z;
      x += dx * 0.006; y += dy * 0.006; z += dz * 0.006;
      LX[i] = (x / 20) * 0.46; LY[i] = ((z - 25) / 26) * 0.46; LZ[i] = (y / 27) * 0.46;
    }
    // particulas de campo de flujo (en pantalla)
    const NF = reducir ? 120 : 520;
    const flujo = { x: new Float32Array(NF), y: new Float32Array(NF), px: new Float32Array(NF), py: new Float32Array(NF), edad: new Float32Array(NF), t: -1 };
    for (let i = 0; i < NF; i++) { flujo.x[i] = r(); flujo.y[i] = r(); flujo.px[i] = flujo.x[i]; flujo.py[i] = flujo.y[i]; flujo.edad[i] = r() * 6; }
    mente = { N, X, Y, Z, edges, hop, semillas, periodos, fases, seg, LX, LY, LZ, NL, flujo, sx: new Float32Array(N), sy: new Float32Array(N), sz: new Float32Array(N), br: new Float32Array(N), tau: new Float32Array(N) };
  }

  const campo = (x, y, t) => TAU * (noise1(x * 3.1 + t * 0.07, 3) + noise1(y * 3.7 - t * 0.05, 9) * 0.8 + noise1((x + y) * 2.3, 21) * 0.5) * 0.8;

  function mentePantalla(S) {
    if (!mente) iniciarMente();
    const M = mente;
    const { w, h, t } = S;
    ctx.fillStyle = '#04050a';
    ctx.fillRect(0, 0, w, h);
    const ent = sstep(0, 2.2, t);
    const zoom = 1 + 2.4 * (1 - easeOut(t / 5));
    const cx = w * 0.5, cy = h * 0.5;
    const ang = 0.4 + t * 0.12, pit = 0.22 + 0.06 * Math.sin(t * 0.21);
    const ca = Math.cos(ang), sa = Math.sin(ang), cp = Math.cos(pit), sp = Math.sin(pit);
    const f = Math.min(w * 0.9, h * 1.6) * 0.78 * zoom;
    const proy = (x, y, z, out, i) => {
      const x1 = x * ca + z * sa, z1 = -x * sa + z * ca;
      const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
      const d = 3.0 + z2;
      out[0] = cx + (x1 * f) / d * 1.0 + (w > h ? 0 : 0);
      out[1] = cy + (y2 * f) / d;
      out[2] = z2;
    };
    const pt = [0, 0, 0];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // campo de flujo (fondo)
    const F = M.flujo;
    ctx.globalAlpha = 0.16 * ent;
    ctx.strokeStyle = '#5b8cff';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    const dt = Math.min(0.05, S.dt || 0.016);
    for (let i = 0; i < F.x.length; i++) {
      F.edad[i] += dt;
      if (F.edad[i] > 6) { F.x[i] = Math.random(); F.y[i] = Math.random(); F.px[i] = F.x[i]; F.py[i] = F.y[i]; F.edad[i] = 0; }
      F.px[i] = F.x[i]; F.py[i] = F.y[i];
      const a = campo(F.x[i], F.y[i], S.ta);
      F.x[i] += Math.cos(a) * dt * 0.06 * (h / w > 1 ? 1.6 : 1);
      F.y[i] += Math.sin(a) * dt * 0.06;
      ctx.moveTo(F.px[i] * w, F.py[i] * h);
      ctx.lineTo(F.x[i] * w, F.y[i] * h);
    }
    ctx.stroke();
    // proyeccion de neuronas y disparos
    for (let i = 0; i < M.N; i++) {
      proy(M.X[i], M.Y[i], M.Z[i], pt);
      M.sx[i] = pt[0]; M.sy[i] = pt[1]; M.sz[i] = pt[2];
      let b = 0, tmin = 9;
      for (let s = 0; s < 4; s++) {
        const hp = M.hop[s][i];
        if (hp < 0 || hp > 46) continue;
        let tau = t - M.fases[s] - hp * 0.075;
        if (tau < 0) continue;
        tau = tau % M.periodos[s];
        const v = Math.exp(-tau * 3.0);
        if (v > b) { b = v; tmin = tau; }
      }
      M.br[i] = b; M.tau[i] = tmin;
    }
    // conexiones
    ctx.strokeStyle = '#3a5fb8';
    ctx.globalAlpha = 0.14 * ent;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (const [a, b] of M.edges) { ctx.moveTo(M.sx[a], M.sy[a]); ctx.lineTo(M.sx[b], M.sy[b]); }
    ctx.stroke();
    // conexiones calientes + pulsos
    ctx.strokeStyle = '#ffb347';
    ctx.globalAlpha = 0.5 * ent;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    const pulsos = [];
    for (const [a, b] of M.edges) {
      if (M.br[a] > 0.3) {
        ctx.moveTo(M.sx[a], M.sy[a]); ctx.lineTo(M.sx[b], M.sy[b]);
        if (M.tau[a] < 0.22) pulsos.push([a, b, M.tau[a] / 0.22]);
      }
    }
    ctx.stroke();
    ctx.fillStyle = '#fff2c4';
    for (const [a, b, u] of pulsos) {
      ctx.globalAlpha = 0.9 * ent * (1 - u * 0.6);
      ctx.fillRect(lerp(M.sx[a], M.sx[b], u) - 1.1, lerp(M.sy[a], M.sy[b], u) - 1.1, 2.2, 2.2);
    }
    // neuronas
    for (let i = 0; i < M.N; i++) {
      const prof = clamp((M.sz[i] + 1) / 2);
      const b = M.br[i];
      const r = 0.7 + prof * -0.6 + b * 2.6 + 0.9;
      const rr = Math.max(1.6, r * (h / 900 + 0.8));
      ctx.globalAlpha = (0.45 + 0.55 * Math.min(1, b + 0.0)) * ent * (0.6 + 0.4 * (1 - prof));
      ctx.fillStyle = b > 0.35 ? '#ffd27a' : prof < 0.5 ? '#ffb455' : '#6f9bff';
      ctx.fillRect(M.sx[i] - rr / 2, M.sy[i] - rr / 2, rr, rr);
      if (b > 0.5 && !reducir) {
        ctx.globalAlpha = (b - 0.4) * 0.6 * ent;
        const g = rr * 7;
        ctx.drawImage(SPR_CALIDA, M.sx[i] - g, M.sy[i] - g, g * 2, g * 2);
      }
    }
    // dendritas que crecen
    ctx.strokeStyle = '#ffc980';
    ctx.lineWidth = 0.8;
    ctx.globalAlpha = 0.55 * ent;
    ctx.beginPath();
    const p1 = [0, 0, 0], p2 = [0, 0, 0];
    for (const s of M.seg) {
      const g = clamp((t - 1.5 - s[6]) / 0.9);
      if (g <= 0) continue;
      proy(s[0], s[1], s[2], p1);
      proy(s[0] + (s[3] - s[0]) * g, s[1] + (s[4] - s[1]) * g, s[2] + (s[5] - s[2]) * g, p2);
      ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]);
    }
    ctx.stroke();
    // lorenz: el pensamiento
    const cab = Math.floor((t * 150 + 600) % M.NL);
    const largo = 760;
    ctx.lineWidth = 1.4;
    const tramos = 14;
    for (let k = 0; k < tramos; k++) {
      ctx.beginPath();
      const a0 = Math.floor((k / tramos) * largo), a1 = Math.floor(((k + 1) / tramos) * largo);
      for (let q = a0; q <= a1; q++) {
        const idx = (cab - largo + q + M.NL * 3) % M.NL;
        proy(M.LX[idx], M.LY[idx], M.LZ[idx], pt);
        if (q === a0) ctx.moveTo(pt[0], pt[1]); else ctx.lineTo(pt[0], pt[1]);
      }
      const u = (k + 1) / tramos;
      ctx.strokeStyle = `rgb(${Math.round(lerp(90, 255, u))},${Math.round(lerp(120, 214, u))},${Math.round(lerp(255, 130, u))})`;
      ctx.globalAlpha = (0.12 + 0.78 * u * u) * ent;
      ctx.stroke();
    }
    proy(M.LX[cab], M.LY[cab], M.LZ[cab], pt);
    ctx.globalAlpha = ent;
    const g = Math.min(w, h) * 0.05;
    ctx.drawImage(SPR_LUZ, pt[0] - g, pt[1] - g, g * 2, g * 2);
    ctx.restore();
    // vineta
    const v = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.35, cx, cy, Math.hypot(w, h) * 0.6);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  }

  // ------------------------------------------------------------ 3 las edades
  function trazoRetrato(w, h, extra = 0) {
    const s = Math.min((h * 0.9) / 1500, (w * 0.98) / 1180);
    return { x: w / 2 - 600 * s, y: h * 0.5 - 740 * s + extra, s };
  }

  function edadesEscena(S) {
    const { w, h, t } = S;
    const k = Math.min(4, Math.floor(t / 13));
    const ts = t - 13 * k;
    const u = ts / 13;
    const P = R[EDADES[k]];
    env.glOp(0);
    ctx.fillStyle = '#080605';
    ctx.fillRect(0, 0, w, h);
    if (!P) return;
    const tr = trazoRetrato(w, h);
    const noche = k === 4 ? sstep(6.2, 11.8, ts) : 0;
    const entrada = k === 0 ? sstep(0, 2, t) : 1;
    // papel
    ctx.globalAlpha = entrada * (1 - noche);
    ctx.drawImage(getPapel(w, h), 0, 0, w, h);
    ctx.globalAlpha = 1;
    env.etiqueta(NOMBRE_EDAD[EDADES[k]]);
    // morph hacia la siguiente
    const mph = k < 4 ? clamp((u - 0.82) / 0.18) : 0;
    const anterior = k > 0 ? R[EDADES[k - 1]] : null;
    const alfaAg = k === 0 ? sstep(0.45, 0.78, u) : sstep(0.0, 0.3, u);
    if (mph > 0) {
      const B = R[EDADES[k + 1]];
      dibujarAguada(ctx, P, tr, (1 - sstep(0, 0.6, mph)) * alfaAg);
      dibujarAguada(ctx, B, tr, sstep(0.5, 1, mph) * 0.0);
      dibujarMorph(ctx, P, B, mph, tr, 1);
      return;
    }
    if (k === 4) return muerte(S, P, tr, ts, noche);
    if (k === 0 && u < 0.52) {
      const q = ease(clamp(u / 0.5)) * P.n;
      dibujarAguada(ctx, P, tr, alfaAg);
      dibujarTrazos(ctx, P, q, q - Math.floor(q), tr, 1);
    } else {
      const c = cacheCompleto(P, tr.s * env.dpr);
      dibujarAguada(ctx, P, tr, alfaAg);
      ctx.drawImage(c, tr.x, tr.y, P.W * tr.s, P.H * tr.s);
    }
  }

  // muerte: los trazos se sueltan y se vuelven polillas que van hacia la luz
  function muerte(S, P, tr, ts, noche) {
    const { w, h } = S;
    const lx = w * 0.76, ly = h * 0.2;
    // luz
    if (noche > 0) {
      const rr = Math.min(w, h) * (0.12 + 0.22 * noche);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = noche;
      ctx.drawImage(SPR_CALIDA, lx - rr * 2, ly - rr * 2, rr * 4, rr * 4);
      ctx.globalAlpha = noche * 0.9;
      ctx.drawImage(SPR_LUZ, lx - rr * 0.6, ly - rr * 0.6, rr * 1.2, rr * 1.2);
      ctx.restore();
    }
    const alfaAg = (1 - sstep(6, 9, ts)) * sstep(0.0, 2.5, ts);
    dibujarAguada(ctx, P, tr, alfaAg);
    const paths = [new Path2D(), new Path2D(), new Path2D(), new Path2D(), new Path2D()];
    const alas = new Path2D();
    const cuerpos = new Path2D();
    const sh = Math.min(w, h) / 900;
    const dibujoHasta = ts < 3.2 ? ease(ts / 3.2) * P.n : P.n; // el dibujo aparece rapido, ya conocido
    const tem = ts > 4.6 ? (ts - 4.6) * 0.8 : 0;
    for (let i = 0; i < P.n; i++) {
      if (i > dibujoHasta) break;
      const cyp = P.cen[i * 2 + 1];
      const rel = 6.0 + 2.6 * (cyp / 1500) + 1.2 * hash(i * 3 + 7);
      const vuelo = 3.0 + 2.4 * hash(i * 5 + 1);
      const a = P.off[i], b = P.off[i + 1];
      if (ts < rel) {
        // aun es trazo; tiembla antes de soltarse
        const tr0 = ts > rel - 1.6 ? (1 - (rel - ts) / 1.6) : 0;
        const jx = tr0 * 2.2 * Math.sin(ts * 31 + i), jy = tr0 * 2.2 * Math.cos(ts * 27 + i * 2);
        const p = paths[P.tipo[i]];
        p.moveTo(P.raw[a * 2] + jx, P.raw[a * 2 + 1] + jy);
        for (let q = a + 1; q < b; q++) p.lineTo(P.raw[q * 2] + jx, P.raw[q * 2 + 1] + jy);
        continue;
      }
      // polilla
      const s = clamp((ts - rel) / vuelo);
      const sx = tr.x + P.cen[i * 2] * tr.s, sy = tr.y + cyp * tr.s;
      const e = Math.pow(s, 1.5);
      const amp = (1 - s) * 130 * sh * (0.4 + hash(i + 4));
      const ph = hash(i + 11) * TAU;
      let x = lerp(sx, lx, e) + Math.sin(ts * 2.6 + ph) * amp;
      let y = lerp(sy, ly, e) + Math.cos(ts * 2.1 + ph * 2) * amp * 0.6 - Math.sin(Math.PI * s) * 70 * sh;
      if (s >= 1) {
        const orb = (22 + 90 * hash(i + 21)) * sh;
        const an = ts * (0.8 + hash(i + 31) * 1.2) + ph;
        x = lx + Math.cos(an) * orb * (0.6 + 0.4 * Math.sin(ts * 0.7 + ph));
        y = ly + Math.sin(an * 1.3) * orb * 0.7;
      }
      const tam = (3.2 + 3.2 * hash(i + 41)) * sh;
      const fl = Math.sin(ts * (20 + hash(i + 51) * 10) + ph) * 0.9;
      const dir = Math.atan2(ly - y, lx - x) + (hash(i + 61) - 0.5) * 1.2;
      for (const sg of [-1, 1]) {
        const ang = dir + sg * (0.55 + Math.abs(fl) * 0.7);
        const x1 = x + Math.cos(ang) * tam * 1.6, y1 = y + Math.sin(ang) * tam * 1.6;
        const x2 = x + Math.cos(ang + sg * 0.9) * tam, y2 = y + Math.sin(ang + sg * 0.9) * tam;
        alas.moveTo(x, y); alas.lineTo(x1, y1); alas.lineTo(x2, y2); alas.closePath();
      }
      cuerpos.moveTo(x, y); cuerpos.lineTo(x - Math.cos(dir) * tam * 0.9, y - Math.sin(dir) * tam * 0.9);
    }
    ctx.save();
    ctx.translate(tr.x, tr.y);
    ctx.scale(tr.s, tr.s);
    ctx.lineCap = 'round';
    const fade = 1 - sstep(12.2, 13, ts);
    for (let tp = 0; tp < 5; tp++) {
      ctx.lineWidth = ESTILO[tp].w / tr.s * Math.max(0.55, Math.min(tr.s * 1.2, 2.2));
      const c = [107, 58, 31].map((v, j) => Math.round(lerp(v, [240, 226, 190][j], noche)));
      ctx.strokeStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      ctx.globalAlpha = ESTILO[tp].a * fade;
      ctx.stroke(paths[tp]);
    }
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.85 * fade;
    const cm = [107, 58, 31].map((v, j) => Math.round(lerp(v, [244, 232, 196][j], 0.25 + 0.75 * noche)));
    ctx.fillStyle = `rgb(${cm[0]},${cm[1]},${cm[2]})`;
    ctx.fill(alas);
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 1;
    ctx.stroke(cuerpos);
    ctx.restore();
  }

  // ------------------------------------------------------------ 4 los ojos
  const OJO_IRIS = [738, 634];
  function ojos(S) {
    const { w, h, t } = S;
    const P = R.adolescente;
    const gs = env.glEscala;
    const base = Math.min(w, h);
    const rIris = base * 0.2;
    const mood = 0.5 - 0.5 * Math.cos((Math.max(0, t - 11)) * TAU / 9.5);
    const expand = 1 + 0.35 * sstep(12, 26, t);
    const op = sstep(8.5, 12, t);
    if (t > 8) G.dibujar('ojo', { uRes: [env.gw, env.gh], uT: S.ta, uC: [w * 0.5 * gs, h * 0.5 * gs], uR: rIris * gs * expand, uMood: mood, uFade: sstep(8, 10, t) });
    env.glOp(op);
    const alfa2d = 1 - sstep(9.2, 12.2, t);
    if (alfa2d <= 0 || !P) { ctx.clearRect(0, 0, w, h); return; }
    const sc = Math.min((h * 0.92) / 1500, (w * 0.98) / 1180);
    const sFin = rIris / 16;
    const prog = ease(clamp(t / 10.5));
    const s = Math.exp(lerp(Math.log(sc), Math.log(sFin), prog));
    const f = clamp((Math.log(s) - Math.log(sc)) / (Math.log(sFin) - Math.log(sc)));
    const fx = lerp(600, OJO_IRIS[0], Math.pow(f, 0.85)), fy = lerp(740, OJO_IRIS[1], Math.pow(f, 0.85));
    const tr = { x: w / 2 - fx * s, y: h / 2 - fy * s, s };
    ctx.save();
    ctx.globalAlpha = alfa2d * sstep(0, 1.6, t);
    ctx.fillStyle = '#e4d6b6';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(getPapel(w, h), 0, 0, w, h);
    dibujarAguada(ctx, P, tr, 1);
    // en vez de la copia en cache usamos el vector: se ve nitido al acercarse
    dibujarTrazos(ctx, P, P.n, 0, tr, 1);
    ctx.restore();
  }

  // ------------------------------------------------------------ 5 el horizonte
  function figuraEspalda(x, y, alto, alfa, ta) {
    const u = alto;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = alfa;
    // sombra larga hacia el espectador
    const sg = ctx.createLinearGradient(0, 0, -u * 0.55, u * 2.2);
    sg.addColorStop(0, 'rgba(4,2,2,0.7)');
    sg.addColorStop(1, 'rgba(4,2,2,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.moveTo(-u * 0.06, 0); ctx.lineTo(u * 0.06, 0); ctx.lineTo(-u * 0.5, u * 2.3); ctx.lineTo(-u * 0.8, u * 2.3); ctx.closePath();
    ctx.fill();
    const ink = '#0b0706';
    ctx.fillStyle = ink;
    ctx.beginPath();
    // piernas
    ctx.moveTo(-u * 0.055, 0); ctx.lineTo(-u * 0.05, -u * 0.38); ctx.lineTo(u * 0.05, -u * 0.38); ctx.lineTo(u * 0.055, 0);
    ctx.lineTo(u * 0.012, 0); ctx.lineTo(0, -u * 0.3); ctx.lineTo(-u * 0.012, 0); ctx.closePath();
    ctx.fill();
    // torso y brazos
    ctx.beginPath();
    ctx.moveTo(-u * 0.058, -u * 0.38);
    ctx.bezierCurveTo(-u * 0.085, -u * 0.5, -u * 0.108, -u * 0.62, -u * 0.105, -u * 0.74);
    ctx.bezierCurveTo(-u * 0.09, -u * 0.8, -u * 0.04, -u * 0.82, -u * 0.02, -u * 0.83);
    ctx.lineTo(u * 0.02, -u * 0.83);
    ctx.bezierCurveTo(u * 0.04, -u * 0.82, u * 0.09, -u * 0.8, u * 0.105, -u * 0.74);
    ctx.bezierCurveTo(u * 0.108, -u * 0.62, u * 0.085, -u * 0.5, u * 0.058, -u * 0.38);
    ctx.closePath();
    ctx.fill();
    // brazos colgando
    ctx.fillRect(-u * 0.118, -u * 0.74, u * 0.026, u * 0.3);
    ctx.fillRect(u * 0.092, -u * 0.74, u * 0.026, u * 0.3);
    // cuello y cabeza (mirando arriba, hacia el sol)
    ctx.fillRect(-u * 0.019, -u * 0.86, u * 0.038, u * 0.05);
    ctx.beginPath();
    ctx.ellipse(0, -u * 0.915, u * 0.054, u * 0.064, 0.0, 0, TAU);
    ctx.fill();
    // pelo: flequillo sobre la nuca
    ctx.beginPath();
    ctx.ellipse(0, -u * 0.94, u * 0.058, u * 0.052, 0, Math.PI, TAU);
    ctx.fill();
    // luz de borde del amanecer (lado derecho)
    ctx.strokeStyle = 'rgba(255,176,96,0.75)';
    ctx.lineWidth = Math.max(1, u * 0.007);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(u * 0.052, -u * 0.935); ctx.bezierCurveTo(u * 0.058, -u * 0.915, u * 0.052, -u * 0.88, u * 0.02, -u * 0.865);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(u * 0.045, -u * 0.82); ctx.bezierCurveTo(u * 0.09, -u * 0.8, u * 0.108, -u * 0.74, u * 0.106, -u * 0.66);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,200,130,0.35)';
    ctx.beginPath(); ctx.moveTo(u * 0.118, -u * 0.72); ctx.lineTo(u * 0.119, -u * 0.46); ctx.stroke();
    // rayado fino en el lado en sombra (como el dibujo)
    ctx.strokeStyle = 'rgba(120,70,40,0.35)';
    ctx.lineWidth = Math.max(0.6, u * 0.003);
    for (let i = 0; i < 9; i++) {
      const yy = -u * (0.72 - i * 0.045);
      ctx.beginPath(); ctx.moveTo(-u * 0.1, yy); ctx.lineTo(-u * 0.06, yy + u * 0.03); ctx.stroke();
    }
    ctx.restore();
  }

  function polvo(S, n, alfa) {
    const { w, h, ta } = S;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const sp = 6 + 22 * hash(i + 3);
      const x = ((hash(i * 3 + 1) * w - ta * sp) % w + w) % w;
      const y = h * (0.45 + 0.5 * hash(i * 3 + 2)) + Math.sin(ta * 0.3 + i) * 8;
      ctx.globalAlpha = alfa * (0.1 + 0.25 * hash(i + 9)) * (0.6 + 0.4 * Math.sin(ta + i));
      ctx.fillStyle = '#ffc890';
      const r = 0.8 + 1.6 * hash(i + 7);
      ctx.fillRect(x, y, r, r);
    }
    ctx.restore();
  }

  function polillasCerca(S, n, cx, cy, alfa) {
    const { ta } = S;
    const sh = Math.min(S.w, S.h) / 900;
    const alas = new Path2D();
    for (let i = 0; i < n; i++) {
      const ph = hash(i * 7 + 2) * TAU;
      const rx = (60 + 150 * hash(i + 12)) * sh, ry = (40 + 80 * hash(i + 13)) * sh;
      const a = ta * (0.3 + hash(i + 14) * 0.5) + ph;
      const x = cx + Math.cos(a) * rx + Math.sin(ta * 0.9 + ph) * 12 * sh;
      const y = cy - 40 * sh + Math.sin(a * 1.4) * ry;
      const tam = (3.4 + 2.6 * hash(i + 15)) * sh;
      const fl = Math.sin(ta * (18 + hash(i + 16) * 8) + ph) * 0.9;
      const dir = a + Math.PI / 2;
      for (const sg of [-1, 1]) {
        const ang = dir + sg * (0.55 + Math.abs(fl) * 0.7);
        alas.moveTo(x, y);
        alas.lineTo(x + Math.cos(ang) * tam * 1.6, y + Math.sin(ang) * tam * 1.6);
        alas.lineTo(x + Math.cos(ang + sg * 0.9) * tam, y + Math.sin(ang + sg * 0.9) * tam);
        alas.closePath();
      }
    }
    ctx.save();
    ctx.globalAlpha = 0.75 * alfa;
    ctx.fillStyle = '#e8d4a6';
    ctx.fill(alas);
    ctx.restore();
  }

  function horizonteGL(S, rise, sol, fade) {
    G.dibujar('horizonte', { uRes: [env.gw, env.gh], uT: S.ta, uRise: rise, uSol: sol, uFade: fade });
    env.glOp(1);
  }

  function horizonte(S) {
    const { w, h, t } = S;
    const rise = 0.88 * ease(sstep(0, 34, t));
    horizonteGL(S, rise, 1, sstep(0, 2.5, t));
    const alto = h * 0.15;
    const fx = w * 0.3, fy = h * 0.8;
    figuraEspalda(fx, fy, alto, sstep(1, 4, t), S.ta);
    polvo(S, reducir ? 20 : 70, 1);
    luciernagas(S, reducir ? 6 : 16, { x0: fx, y0: fy - alto * 0.8, rx: w * 0.5, ry: h * 0.18, alfa: 0.9, escala: 0.6, llegada: (i) => 3 + i * 0.7 });
    polillasCerca(S, reducir ? 3 : 9, fx + alto * 0.1, fy - alto * 0.7, sstep(5, 9, t));
  }

  // ------------------------------------------------------------ 6 epilogo
  function epilogo(S) {
    const { w, h, t } = S;
    const rise = lerp(0.88, 0.1, ease(sstep(0, 14, t)));
    const sol = 1 - ease(sstep(0, 13, t));
    horizonteGL(S, rise, sol, 1 - 0.35 * sstep(8, 24, t));
    const alto = h * 0.15;
    const fx = w * 0.3, fy = h * 0.8;
    const af = 1 - sstep(6, 15, t);
    figuraEspalda(fx, fy, alto, af, S.ta);
    polvo(S, reducir ? 10 : 40, sol);
    luciernagas(S, reducir ? 10 : 30, { alfa: 1, llegada: (i) => 0 + i * 0.25, escala: 0.9, x0: undefined });
    polillasCerca(S, reducir ? 2 : 6, fx + alto * 0.1, fy - alto * 0.7, af);
    morse(S, w * 0.64, h * 0.66, sstep(5, 9, t));
  }

  return { prologo, dosam, mente: mentePantalla, edades: edadesEscena, ojos, horizonte, epilogo, luciernagas, morse, MORSE };
}
