// constancia: la animacion completa, definida solo con la api del motor (engine/).
// una luciernaga -> mente -> edades -> ojo -> agujero negro -> planeta lejano -> regreso al maizal -> luciernaga (bucle).
import { clamp, lerp, sstep, ease, easeOut, hash, noise1, TAU } from '../engine/util.js';
import { easings } from '../engine/timeline.js';
import { veil, irisBegin, irisEnd, bloom } from '../engine/transitions.js';
import { firefly, fireflies, morse, moths, dust, NeuralNet, SPR, sprite } from '../engine/particles.js';
import { loadStrokes, drawStrokes, drawMorph, drawWash, cachedStrokes, releaseToMoths } from '../engine/strokes.js';
import { drawBackRig } from '../engine/rig.js';

// ---------------------------------------------------------------- guion: duracion de cada toma
const DUR = { luciernaga: 3, mente: 47, edades: 25, ojo: 26, agujero: 24, planeta: 40, regreso: 12 };
const EDADES = ['nino', 'adolescente', 'adulto', 'viejo', 'muerte'];
const DUR_EDAD = [5, 4.5, 4.5, 4.5, 6.5];
const T = {}; { let a = 0; for (const k in DUR) { T[k] = a; a += DUR[k]; } T.fin = a; }

// ---------------------------------------------------------------- estado de la escena
let red = null;
let papel = null, papelKey = '';
function papelTextura(w, h) {
  const k = `${w}x${h}`;
  if (papel && papelKey === k) return papel;
  const tile = document.createElement('canvas'); tile.width = tile.height = 256;
  const x = tile.getContext('2d'); const id = x.createImageData(256, 256);
  let s = 5; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < 256 * 256; i++) { const v = 128 + (rnd() - 0.5) * 16 + (rnd() - 0.5) * 10; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
  x.putImageData(id, 0, 0);
  const c = document.createElement('canvas'); c.width = Math.max(2, Math.round(w)); c.height = Math.max(2, Math.round(h));
  const g = c.getContext('2d');
  g.fillStyle = '#e8dbbd'; g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.55; g.fillStyle = g.createPattern(tile, 'repeat'); g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  const v = g.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.3, c.width / 2, c.height / 2, Math.hypot(c.width, c.height) * 0.62);
  v.addColorStop(0, 'rgba(120,80,40,0)'); v.addColorStop(1, 'rgba(90,55,25,0.38)');
  g.fillStyle = v; g.fillRect(0, 0, c.width, c.height);
  papel = c; papelKey = k; return c;
}

// ---------------------------------------------------------------- tomas
function shotLuciernaga(S, env) {
  const { ctx, view } = env, { w, h, u } = S;
  ctx.fillStyle = '#0a0705'; ctx.fillRect(0, 0, w, h);
  const [x, y] = posLuciernaga(S);
  firefly(ctx, x, y, u * 3.4, 1, S.ta);
}
const posLuciernaga = (S) => [S.w * 0.5 + Math.sin(S.ta * 0.8) * S.u * 0.6, S.h * 0.46 + Math.cos(S.ta * 0.6) * S.u * 0.5];

function shotMente(S, env) {
  const { ctx } = env, { w, h, u } = S, tl = S.local, dur = DUR.mente;
  ctx.fillStyle = '#03040a'; ctx.fillRect(0, 0, w, h);
  const ent = sstep(0, 1.6, tl);
  const Z = Math.exp(lerp(Math.log(14), 0, ease(clamp(tl / 16))));
  const atrav = ease(clamp((tl - (dur - 9)) / 8.5));
  const piv = posLuciernaga({ ...S, ta: T.mente + tl });
  // la luciernaga se vuelve la primera neurona: se apaga mientras ella dispara
  const fa = 1 - sstep(0.8, 2.6, tl);
  red.render(ctx, S.view, tl, { zoom: Z, atrav, ent, pivote: piv });
  if (fa > 0) firefly(ctx, piv[0], piv[1], u * 3.4, fa, T.mente + tl);
  const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.65)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
  const flash = sstep(dur - 2.2, dur - 0.3, tl);
  if (flash > 0) { ctx.fillStyle = `rgba(210,225,255,${flash * 0.9})`; ctx.fillRect(0, 0, w, h); }
}

function retratoTr(w, h, extra = 1) {
  const s = Math.min((h * 0.9) / 1500, (w * 0.98) / 1180) * extra;
  return { x: w / 2 - 600 * s, y: h * 0.5 - 760 * s, s };
}
function shotEdades(S, env) {
  const { ctx } = env, { w, h } = S, R = env.assets.R || {};
  let k = 0, ts = S.local;
  while (k < 4 && ts >= DUR_EDAD[k]) { ts -= DUR_EDAD[k]; k++; }
  const dur = DUR_EDAD[k], u = ts / dur;
  const P = R[EDADES[k]];
  ctx.fillStyle = '#080605'; ctx.fillRect(0, 0, w, h);
  if (!P) return;
  const tr = retratoTr(w, h, 1 + 0.04 * u);
  tr.x += Math.sin(S.ta * 0.4) * 2; tr.y += Math.cos(S.ta * 0.33) * 1.5;
  const noche = k === 4 ? sstep(0.25, 0.7, u) : 0;
  const reveal = k === 0 ? ease(clamp(S.local / 1.4)) : 1;
  if (k === 0 && reveal < 1) irisBegin(ctx, w, h, reveal);
  ctx.globalAlpha = 1 - noche; ctx.drawImage(papelTextura(w, h), 0, 0, w, h); ctx.globalAlpha = 1;
  const resp = 1 + Math.sin(S.ta * 1.2) * 0.0025;
  ctx.save(); ctx.translate(w / 2, h / 2); ctx.scale(resp, resp); ctx.translate(-w / 2, -h / 2);
  const mph = k < 4 ? clamp((u - 0.76) / 0.24) : 0;
  if (mph > 0) {
    const B = R[EDADES[k + 1]];
    drawWash(ctx, P, tr, 1 - mph); drawWash(ctx, B, tr, mph);
    drawMorph(ctx, P, B, mph, tr, 1);
  } else if (k === 4) {
    const lx = w * 0.76, ly = h * 0.2, luz = sstep(0.2, 0.6, u);
    if (luz > 0) {
      const rr = Math.min(w, h) * (0.1 + 0.2 * luz);
      bloom(ctx, SPR.calida, lx, ly, rr * 2, luz); bloom(ctx, SPR.luz, lx, ly, rr * 0.6, luz * 0.95);
    }
    drawWash(ctx, P, tr, 1 - sstep(0.15, 0.4, u));
    releaseToMoths(ctx, P, tr, ts, { target: [lx, ly], escala: Math.min(w, h) / 900, noche, soltar: [1.0, 1.8], vuelo: [2.2, 1.6], tam: 5.5 });
  } else if (k === 0 && u < 0.4) {
    const q = ease(clamp(u / 0.36)) * P.n;
    drawWash(ctx, P, tr, sstep(0.2, 0.4, u)); drawStrokes(ctx, P, q, q - Math.floor(q), tr, 1);
  } else {
    drawWash(ctx, P, tr, 1);
    ctx.drawImage(cachedStrokes(P, tr.s * env.view.dpr), tr.x, tr.y, P.W * tr.s, P.H * tr.s);
  }
  ctx.restore();
  if (k === 0 && reveal < 1) irisEnd(ctx);
}

function shotOjo(S, env) {
  const { ctx, gl, view } = env, { w, h } = S, tl = S.local, dur = DUR.ojo, base = Math.min(w, h);
  const aparece = sstep(1, 3.5, tl);
  const empuje = Math.pow(clamp((tl - 3) / (dur - 3)), 1.6);
  const escala = Math.exp(lerp(Math.log(0.2), Math.log(7.5), empuje));
  const mood = 0.5 - 0.5 * Math.cos(Math.max(0, tl - 3) * TAU / 8.5);
  const q = S.ta % 5.2, parp = q < 0.2 ? Math.sin((q / 0.2) * Math.PI) : 0;
  env.glOp(aparece);
  if (aparece > 0) gl.draw('eye', { uRes: [view.gw, view.gh], uT: S.ta, uC: [w * 0.5 * view.glScale, h * 0.5 * view.glScale], uR: base * escala * view.glScale * (1 + 0.08 * Math.sin(S.ta * 0.6)),
    uMood: mood, uFade: 1, uBlink: parp, uJulia: sstep(0.15, 0.65, empuje), uPupil: sstep(0.45, 0.95, empuje) });
  ctx.fillStyle = '#05040a'; ctx.globalAlpha = 1 - aparece; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
  // la luz de las polillas se vuelve el brillo del ojo
  const lk = 1 - sstep(0.4, 3, tl), lx = w * 0.76, ly = h * 0.2;
  if (lk > 0) { const rr = base * 0.5 * (0.5 + lk); bloom(ctx, SPR.calida, lx, ly, rr * 2, lk); bloom(ctx, SPR.luz, lx, ly, rr * 0.5, lk); }
}

function ringShip(ctx, x, y, r, rot, ta, alfa) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.25); ctx.globalAlpha = alfa;
  const inc = 0.38;
  for (let i = 0; i < 28; i++) {
    const a0 = (i / 28) * TAU + rot, a1 = ((i + 0.85) / 28) * TAU + rot, lit = 0.5 + 0.5 * Math.cos(a0 - 0.8);
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * inc, 0, a0, a1); ctx.ellipse(0, 0, r * 0.84, r * inc * 0.84, 0, a1, a0, true); ctx.closePath();
    ctx.fillStyle = `rgb(${Math.round(40 + 190 * lit)},${Math.round(36 + 150 * lit)},${Math.round(34 + 100 * lit)})`; ctx.fill();
  }
  ctx.strokeStyle = 'rgba(10,8,8,0.8)'; ctx.lineWidth = Math.max(0.6, r * 0.012);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + rot; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.84, Math.sin(a) * r * 0.84 * inc); ctx.lineTo(0, 0); ctx.stroke(); }
  ctx.fillStyle = '#1b1613'; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.12, r * 0.12 * inc * 1.4, 0, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + rot, on = Math.sin(ta * 2 + i) > 0.6 ? 1 : 0.25; ctx.fillStyle = `rgba(255,120,80,${0.7 * on})`; ctx.beginPath(); ctx.arc(Math.cos(a) * r, Math.sin(a) * r * inc, Math.max(1, r * 0.018), 0, TAU); ctx.fill(); }
  ctx.restore();
}

function shotAgujero(S, env) {
  const { ctx, gl, view } = env, { w, h } = S, tl = S.local, dur = DUR.agujero;
  const ign = sstep(0.2, 4.5, tl), fade = sstep(0, 1.4, tl) * (1 - sstep(dur - 1.3, dur, tl));
  const yaw = lerp(-0.55, 0.35, ease(clamp(tl / dur))) + Math.sin(S.ta * 0.2) * 0.02;
  const pit = lerp(0.2, 0.12, clamp(tl / dur)) + 0.01 * Math.sin(S.ta * 0.3);
  const dist = Math.exp(lerp(Math.log(34), Math.log(15), ease(clamp(tl / dur))));
  gl.draw('blackhole', { uRes: [view.gw, view.gh], uT: S.ta, uCam: [yaw, pit], uDist: dist, uIgn: ign, uFade: fade });
  env.glOp(1);
  const k = clamp((tl - 3) / (dur - 4));
  ringShip(ctx, lerp(w * 1.08, w * 0.12, k), h * (0.22 + 0.07 * Math.sin(k * 2.4)), Math.min(w, h) * 0.05, S.ta * 0.5, S.ta, 0.9 * sstep(0, 0.1, k) * (1 - sstep(0.9, 1, k)));
}

function shotPlaneta(S, env) {
  const { ctx, gl, view, camera } = env, { w, h, u } = S, tl = S.local, dur = DUR.planeta;
  const rise = 0.9 * ease(sstep(0, dur * 0.85, tl)), fade = sstep(0, 1.6, tl);
  gl.draw('horizon', { uRes: [view.gw, view.gh], uT: S.ta, uRise: rise, uSol: 1, uFade: fade, uZ: 1 + 0.35 * ease(clamp(tl / dur)), uPan: -0.05 * ease(clamp(tl / dur)), uDust: 0.5 + 0.5 * Math.sin(tl * 0.18) });
  env.glOp(1);
  const k = clamp(tl / dur);
  const fx = w * (0.3 - 0.02 * k), fy = h * 0.93;
  // el personaje, de espaldas y de pie, mirando al amanecer; el viento le mueve el pelo
  camera.layer(ctx, { w, h, u: 1 }, { depth: 0 }, () => {
    ctx.translate(fx - w / 2, fy - h / 2);
    const sc = u * 0.27 * camera.z;
    ctx.scale(sc, sc);
    const sg = ctx.createLinearGradient(0, 100, -20, 330);
    sg.addColorStop(0, 'rgba(3,2,3,0.7)'); sg.addColorStop(1, 'rgba(3,2,3,0)');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.moveTo(-14, 104); ctx.lineTo(14, 104); ctx.lineTo(-10, 330); ctx.lineTo(-60, 330); ctx.closePath(); ctx.fill();
    ctx.translate(0, -100);
    drawBackRig(ctx, S.ta, { luz: 0.85, rim: 'rgba(255,170,100,0.95)', completo: true, viento: 1.6, mira: -0.5 + 0.1 * Math.sin(S.ta * 0.3), giro: 0 });
  });
  moths(ctx, S.view, S.ta, { n: env.reducir ? 10 : 30, cx: fx, cy: fy - u * 20, rx: u * 46, ry: u * 18, morph: sstep(dur * 0.2, dur * 0.5, tl), alfa: sstep(0.5, 3, tl) });
  dust(ctx, S.view, S.ta, { n: env.reducir ? 25 : 90, alfa: fade });
  ringShip(ctx, w * 0.72, h * 0.16 + Math.sin(S.ta * 0.1) * 3, Math.min(w, h) * 0.028, S.ta * 0.35, S.ta, 0.8 * (1 - sstep(0.4, 0.8, tl / dur)) * sstep(2, 5, tl));
}

function shotRegreso(S, env) {
  const { ctx, gl, view, camera } = env, { w, h, u } = S, tl = S.local, dur = DUR.regreso;
  const sol = 1 - ease(clamp(tl / 3.5)), fadeGL = 1 - sstep(2.5, 5.5, tl);
  if (fadeGL > 0.01) {
    gl.draw('horizon', { uRes: [view.gw, view.gh], uT: S.ta, uRise: lerp(0.9, 0.05, ease(clamp(tl / 5))), uSol: sol, uFade: fadeGL, uZ: 1.35, uPan: -0.05, uDust: 0.2 });
    env.glOp(1);
  }
  ctx.fillStyle = `rgba(7,5,10,${1 - fadeGL})`; ctx.fillRect(0, 0, w, h);
  const campo = sstep(2.5, 6, tl);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, `rgba(6,8,18,${campo})`); g.addColorStop(0.7, `rgba(20,16,26,${campo})`); g.addColorStop(1, `rgba(4,3,5,${campo})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // tres capas de maiz con parallax; la de delante, fuera de foco
  const n = env.reducir ? 70 : 200;
  const capas = [{ depth: 0.4, blur: 0, color: '#0b0d14', yb: 0.78, alt: 0.16, lw: 0.45 }, { depth: 0.8, blur: 0, color: '#07080d', yb: 0.87, alt: 0.26, lw: 0.8 }, { depth: 1.5, blur: 2.2, color: '#030305', yb: 0.96, alt: 0.36, lw: 1.3 }];
  ctx.save(); ctx.globalAlpha = campo;
  camera.set({ x: Math.sin(tl * 0.2) * 3, y: 0, z: 1 + 0.12 * (tl / dur) });
  for (const [ci, c] of capas.entries()) {
    camera.layer(ctx, { w, h, u: 1 }, { depth: c.depth * 0.6, blur: c.blur }, () => {
      ctx.translate(-w / 2, -h / 2);
      ctx.strokeStyle = c.color; ctx.lineWidth = u * c.lw;
      for (let i = 0; i < n; i++) {
        const px = (i / n) * w * 1.2 - w * 0.1 + (hash(i + ci * 91) - 0.5) * u * 2, yb = h * c.yb, hh = h * c.alt * (0.7 + hash(i + ci * 7) * 0.5);
        const sw = Math.sin(S.ta * (1.0 + ci * 0.2) + i * 0.4 + Math.sin(S.ta * 0.23) * 3) * u * (1.6 + ci * 0.8) * (0.6 + 0.4 * Math.sin(S.ta * 0.3 + i));
        ctx.beginPath(); ctx.moveTo(px, h * 1.2); ctx.lineTo(px, yb); ctx.quadraticCurveTo(px + sw * 0.4, yb - hh * 0.6, px + sw, yb - hh); ctx.stroke();
      }
    });
  }
  ctx.restore();
  const nf = env.reducir ? 8 : 26;
  for (let i = 0; i < nf; i++) {
    const vive = 1 - sstep(dur * 0.35 + hash(i) * dur * 0.45, dur * 0.35 + hash(i) * dur * 0.45 + 2, tl);
    if (vive <= 0) continue;
    firefly(ctx, w * (0.08 + 0.84 * hash(i * 3 + 1)) + Math.sin(S.ta * 0.4 + i) * u * 3, h * (0.45 + 0.4 * hash(i * 3 + 2)) + Math.cos(S.ta * 0.5 + i * 2) * u * 2, u * 1.6, vive * campo, S.ta + i * 1.3, hash(i));
  }
  morse(ctx, S.view, S.ta, w * 0.5, h * 0.6, campo * (1 - sstep(dur - 2.5, dur - 0.5, tl)), u * 2.2, 'aqui');
}

// ---------------------------------------------------------------- audio (capas propias, nada con derechos)
const ESCALA = [220, 261.63, 293.66, 329.63, 392, 440, 523.25];
const ACORDES = [[73.42, 110, 130.81, 164.81, 174.61], [58.27, 87.31, 110, 146.83, 174.61], [49, 73.42, 98, 116.54, 146.83], [65.41, 98, 123.47, 164.81, 196], [73.42, 110, 146.83, 185, 220]];
function configurarAudio(audio) {
  audio.layer('zumbido', (ac, h) => {
    const m = h.gain(1);
    h.noise('brown').connect(h.filter('lowpass', 220)).connect(m);
    for (const [f, g] of [[50, 0.05], [100, 0.03], [150, 0.018]]) h.osc(f === 50 ? 'sine' : 'sawtooth', f).connect(h.gain(g)).connect(m);
    return m;
  }, { send: 0.12, max: 0.5 });
  audio.layer('brillo', (ac, h) => h.gain(1), { send: 0.6, max: 0.4 });
  audio.layer('crujido', (ac, h) => h.gain(1), { send: 0.4, max: 0.5 });
  audio.layer('latido', (ac, h) => h.gain(1), { send: 0.3, max: 0.9 });
  audio.layer('organo', (ac, h) => {
    const out = h.gain(1), lp = h.filter('lowpass', 1500, 0.3);
    h.orgOsc = [];
    for (let v = 0; v < 5; v++) for (const [mult, amp] of [[1, 0.5], [2, 0.28], [3, 0.14], [4, 0.1], [6, 0.05]]) {
      const o = h.osc('sine', 55 * mult, (hash(v * 7 + mult) - 0.5) * 8); o.connect(h.gain(0.05 * amp)).connect(lp); h.orgOsc.push({ o, mult, v });
    }
    h.lfo(5.2, 0.04, lp.detune);
    lp.connect(out); return out;
  }, { send: 0.9, max: 0.5 });
  audio.layer('viento', (ac, h) => { const b = h.filter('bandpass', 420, 0.8); h.lfo(0.09, 260, b.frequency); h.noise().connect(b); return b; }, { send: 0.5, max: 0.5 });
  audio.layer('polvo', (ac, h) => { const g = h.gain(0.2); h.lfo(0.13, 0.12, g.gain); h.noise().connect(h.filter('highpass', 3800)).connect(g); return g; }, { send: 0.3, max: 0.12 });
  audio.layer('polillas', (ac, h) => h.gain(1), { send: 0.4, max: 0.35 });
  let sCru = 0, sLat = 0, sAla = 0, sBri = 0, acorde = -1, pasoBri = 0;
  audio.scheduler((now, p, h) => {
    if (p.crujido > 0.05) { while (sCru < now + 0.1) { if (sCru < now - 0.3) sCru = now; const n = 1 + Math.floor(Math.random() * 4); for (let i = 0; i < n; i++) h.burst(h.input('crujido'), sCru + i * 0.008, 0.4 * p.crujido, 3000 + Math.random() * 5000, 0.8, 0.006 + Math.random() * 0.012); sCru += 0.05 + Math.random() * (1.1 - p.crujido); } } else sCru = now;
    if (p.latido > 0.05) { while (sLat < now + 0.2) { if (sLat < now - 0.5) sLat = now; h.thump(h.input('latido'), sLat, 52, 0.7); h.thump(h.input('latido'), sLat + 0.26, 44, 0.45); sLat += 0.86; } } else sLat = now;
    if (p.polillas > 0.05) { while (sAla < now + 0.12) { if (sAla < now - 0.3) sAla = now; for (let i = 0; i < 4; i++) h.burst(h.input('polillas'), sAla + i * 0.025, 0.12 * p.polillas, 900 + Math.random() * 900, 2, 0.02); sAla += 0.07 + Math.random() * 0.12; } } else sAla = now;
    // destellos agudos y suaves de la luciernaga
    if (p.brillo > 0.05) { while (sBri < now + 0.3) { if (sBri < now - 0.5) sBri = now; h.note(h.input('brillo'), sBri, ESCALA[(pasoBri++ * 3) % 7] * 4, 1.6, 0.03 * p.brillo, 'sine'); sBri += 0.9 + Math.random() * 1.4; } } else sBri = now;
    // acordes lentos del organo
    const idx = Math.floor((h.tl ?? 0) / 14) % ACORDES.length;
    if (idx !== acorde && h.orgOsc) { acorde = idx; for (const n of h.orgOsc) n.o.frequency.setTargetAtTime(ACORDES[idx][n.v] * n.mult, now, 2.2); }
  });
  audio.automate((t) => {
    const ent = (a, b) => sstep(a, b, t), sal = (a, b) => 1 - sstep(a, b, t);
    return {
      zumbido: 0.35 * sal(T.mente, T.mente + 6) + 0.1,
      brillo: ent(0, 1) * sal(T.mente + 8, T.mente + 14),
      crujido: 0.9 * ent(T.mente - 1, T.mente + 1) * sal(T.mente + 12, T.mente + 22) + 0.5 * ent(T.edades - 10, T.edades - 4) * sal(T.edades - 1, T.edades + 1),
      latido: 0.8 * ent(T.mente + 6, T.mente + 14) * sal(T.edades - 6, T.edades) + 0.5 * ent(T.edades + 1, T.edades + 4) * sal(T.ojo - 4, T.ojo),
      organo: 0.55 * ent(T.edades, T.edades + 8) * sal(T.regreso, T.regreso + 5) + 0.3 * ent(T.mente + 18, T.edades),
      viento: 0.9 * ent(T.planeta - 2, T.planeta + 4) * sal(T.regreso + 2, T.fin - 3) + 0.5 * ent(T.agujero, T.agujero + 4) * sal(T.planeta, T.planeta + 2),
      polvo: 0.8 * ent(T.planeta, T.planeta + 5) * sal(T.regreso, T.regreso + 4),
      polillas: 0.8 * ent(T.edades + 18, T.edades + 21) * sal(T.ojo - 1, T.ojo) + 0.35 * ent(T.planeta + 8, T.planeta + 14) * sal(T.regreso - 2, T.regreso + 1),
      master: 1 - 0.93 * ent(T.fin - 9, T.fin - 2),
    };
  });
}

// ---------------------------------------------------------------- la escena
export default {
  name: 'constancia',
  loop: true,
  shots: [
    { id: 'luciernaga', dur: DUR.luciernaga, draw: shotLuciernaga },
    { id: 'mente', dur: DUR.mente, draw: shotMente },
    { id: 'edades', dur: DUR.edades, draw: shotEdades },
    { id: 'ojo', dur: DUR.ojo, draw: shotOjo },
    { id: 'agujero', dur: DUR.agujero, draw: shotAgujero },
    { id: 'planeta', dur: DUR.planeta, camera: [{ t: 0, z: 1 }, { t: DUR.planeta, z: 1.5, ease: 'ease' }], draw: shotPlaneta },
    { id: 'regreso', dur: DUR.regreso, draw: shotRegreso },
  ],
  setup(env) { red = new NeuralNet({ N: 1500, seed: 2026, reducir: env.reducir }); },
  async load(env) {
    env.assets.R = {};
    await Promise.all(EDADES.map((n) => loadStrokes(n, 'assets/retratos').then((P) => { env.assets.R[n] = P; }).catch((e) => console.warn('retrato', n, e))));
  },
  audio: configurarAudio,
};
