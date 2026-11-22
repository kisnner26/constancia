// rig.js: personaje dibujado por partes (cabeza, cuello, torso, piernas, pelo en mechones) con movimiento procedural:
// respiracion, giro de cabeza y fisica simple de mechones (la punta sigue al viento y se retrasa respecto al giro).
//   drawBackRig(ctx, t, opts)  -> de espaldas. origen: centro de la cabeza; 1 unidad = 1% de la altura del cuadro.
//     opts = { luz 0..1, rim (color de luz de borde), giro, mira, viento, completo (de pie, con piernas) }
//   wind(t, seed)              -> viento suave en -1..1, util para varios rigs
//   COL                        -> paleta del personaje (cambiala para otro diseno)
// estilo de animacion cinematografica: linea de tinta de grosor variable, sombreado cel en dos tonos y luz de borde fria.
// unidades: 1 = 1% de la altura del cuadro.
import { clamp, lerp, hash, TAU } from './util.js';

export const COL = {
  piel: '#a8734f', sombra: '#76492f', sombra2: '#52301f', luz: '#c58d63',
  pelo: '#14101a', peloMedio: '#221c2e', peloLuz: '#46405e', tinta: '#140a07',
  camiseta: '#1e1d2a', camisetaSombra: '#12111a', camisetaLuz: '#34344c', rim: 'rgba(160,200,255,0.92)', cable: '#ece6d6',
};

// linea de tinta con peso variable: un trazo base y otro mas grueso desplazado hacia la sombra
function linea(ctx, path, lw = 0.26, peso = 0.5) {
  ctx.save();
  ctx.strokeStyle = COL.tinta; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.lineWidth = lw; ctx.stroke(path);
  ctx.translate(-peso * 0.28, peso * 0.34); ctx.lineWidth = lw * (0.8 + peso); ctx.globalAlpha = 0.85; ctx.stroke(path);
  ctx.restore();
}
function forma(ctx, path, color, lw = 0.26, peso = 0.5) {
  ctx.fillStyle = color; ctx.fill(path);
  linea(ctx, path, lw, peso);
}

// mechon afilado: dos curvas que se juntan en una punta; la punta cede con el viento
function mechon(ctx, x0, y0, tx, ty, curva, ancho, color, luz = null) {
  const mx = (x0 + tx) / 2 + curva, my = (y0 + ty) / 2;
  const p = new Path2D();
  p.moveTo(x0 - ancho, y0);
  p.quadraticCurveTo(mx - ancho * 0.7, my, tx, ty);
  p.quadraticCurveTo(mx + ancho * 0.7, my, x0 + ancho, y0);
  p.closePath();
  ctx.fillStyle = color; ctx.fill(p);
  if (luz) {
    ctx.strokeStyle = luz; ctx.lineWidth = ancho * 0.45; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0 + ancho * 0.1, y0 + (ty - y0) * 0.1); ctx.quadraticCurveTo(mx + ancho * 0.2, my, tx - (tx - x0) * 0.08, ty - (ty - y0) * 0.1); ctx.stroke();
  }
}

export function viento(t, seed = 0) {
  return Math.sin(t * 1.1 + seed) * 0.5 + Math.sin(t * 2.7 + seed * 2.3) * 0.25 + Math.sin(t * 0.37 + seed) * 0.4;
}

// ------------------------------------------------------------------ de espaldas
export function personajeEspalda(ctx, t, o = {}) {
  const luz = o.luz ?? 0.8, rim = o.rim ?? COL.rim, giro = o.giro ?? 0, mira = o.mira ?? 0;
  const resp = Math.sin(t * 1.25) * 0.28 + Math.sin(t * 0.31) * 0.1;
  const W = (o.viento ?? 1) * viento(t, 1);
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const yb = o.completo ? 52 : 90, wb = o.completo ? 15 : 24;
  // ---- torso
  ctx.save();
  ctx.translate(0, resp);
  if (o.completo) {
    for (const sg of [-1, 1]) {
      const p = new Path2D();
      p.moveTo(sg * 1, yb - 4); p.lineTo(sg * (wb + 0.5), yb - 4); p.lineTo(sg * (wb - 1.5), 104); p.lineTo(sg * 2.2, 104); p.closePath();
      forma(ctx, p, '#16151e', 0.28);
      const z = new Path2D(); z.ellipse(sg * (wb * 0.5 + 0.8), 105, 5.4, 2.3, 0, 0, TAU); forma(ctx, z, '#0b0a10', 0.28);
    }
    ctx.strokeStyle = rim; ctx.globalAlpha = luz * 0.6; ctx.lineWidth = 0.45; ctx.beginPath(); ctx.moveTo(wb + 0.5, yb - 4); ctx.lineTo(wb - 1.5, 104); ctx.stroke(); ctx.globalAlpha = 1;
  }
  const torso = new Path2D();
  torso.moveTo(-5.5, 11);
  torso.bezierCurveTo(-12, 12.5, -21, 15, -23.5, 27);
  torso.bezierCurveTo(-24.5, 36, -wb - 1, yb - 20, -wb, yb);
  torso.lineTo(wb, yb);
  torso.bezierCurveTo(wb + 1, yb - 20, 24.5, 36, 23.5, 27);
  torso.bezierCurveTo(21, 15, 12, 12.5, 5.5, 11);
  torso.closePath();
  ctx.fillStyle = COL.camiseta; ctx.fill(torso);
  ctx.save(); ctx.clip(torso);
  // sombra cel del lado opuesto a la luz y pliegues con volumen
  ctx.fillStyle = COL.camisetaSombra; ctx.globalAlpha = 0.85;
  ctx.beginPath(); ctx.moveTo(-30, 10); ctx.lineTo(-5, 10); ctx.bezierCurveTo(-10, 30, -8, 50, -14, yb + 4); ctx.lineTo(-30, yb + 4); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(8,6,12,0.7)'; ctx.lineWidth = 0.34;
  for (const [a, b, c, d] of [[-12, 20, -9, 44], [9, 22, 6, 46], [0, 28, 2, 52], [16, 26, 14, 48]]) { ctx.beginPath(); ctx.moveTo(a, b); ctx.quadraticCurveTo((a + c) / 2 + 2, (b + d) / 2, c, d); ctx.stroke(); }
  ctx.restore();
  linea(ctx, torso, 0.3, 0.7);
  if (luz > 0) {
    ctx.strokeStyle = rim; ctx.globalAlpha = luz; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(5.5, 11); ctx.bezierCurveTo(12, 12.5, 21, 15, 23.5, 27); ctx.bezierCurveTo(24.5, 36, wb + 1, yb - 20, wb, yb); ctx.stroke();
    ctx.globalAlpha = luz * 0.3; ctx.lineWidth = 2.2; ctx.stroke(); ctx.globalAlpha = 1;
  }
  ctx.restore();
  // ---- cuello (cel en dos tonos)
  ctx.save();
  ctx.translate(giro * 0.3, resp * 0.6);
  const cu = new Path2D(); cu.moveTo(-4.6, 4); cu.lineTo(-4.9, 13); cu.quadraticCurveTo(0, 15.8, 4.9, 13); cu.lineTo(4.6, 4); cu.closePath();
  forma(ctx, cu, COL.sombra, 0.28);
  ctx.strokeStyle = rim; ctx.globalAlpha = luz * 0.8; ctx.lineWidth = 0.45; ctx.beginPath(); ctx.moveTo(4.6, 4.5); ctx.lineTo(4.9, 13); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.restore();
  // ---- cabeza
  ctx.save();
  ctx.translate(giro, resp * 0.5);
  ctx.rotate(mira * 0.12);
  // oreja
  const or = new Path2D(); or.ellipse(9.4, 2.2, 1.8, 3.0, 0.1, 0, TAU);
  forma(ctx, or, COL.piel, 0.24);
  ctx.fillStyle = COL.sombra2; ctx.beginPath(); ctx.ellipse(9.5, 2.5, 0.7, 1.5, 0.1, 0, TAU); ctx.fill();
  ctx.fillStyle = COL.cable; ctx.beginPath(); ctx.ellipse(8.8, 3.1, 0.7, 0.9, 0, 0, TAU); ctx.fill();
  // masa de pelo
  const masa = new Path2D();
  masa.moveTo(-7.4, 8.4);
  masa.bezierCurveTo(-10.9, 4.5, -11, -4.4, -8.3, -8.4);
  masa.bezierCurveTo(-5, -12.9, 5, -12.9, 8.5, -8.4);
  masa.bezierCurveTo(11, -4.6, 10.4, 3.6, 7.5, 8.4);
  masa.bezierCurveTo(4, 10.4, -3.6, 10.4, -7.4, 8.4);
  masa.closePath();
  ctx.fillStyle = COL.pelo; ctx.fill(masa);
  ctx.save(); ctx.clip(masa);
  // tono medio (cel): bandas con la forma del craneo hacia la luz
  ctx.fillStyle = COL.peloMedio;
  ctx.beginPath(); ctx.moveTo(-1, -14); ctx.bezierCurveTo(8, -12, 12, -2, 9, 10); ctx.lineTo(2, 10); ctx.bezierCurveTo(5, 0, 4, -8, -1, -14); ctx.fill();
  // brillos en mechas afiladas
  ctx.strokeStyle = COL.peloLuz; ctx.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const k = i / 8;
    ctx.lineWidth = 0.22 + 0.25 * Math.sin(k * Math.PI);
    ctx.beginPath(); ctx.moveTo(lerp(-6, 7, k), -10.5 + Math.abs(k - 0.55) * 4);
    ctx.quadraticCurveTo(lerp(-8.5, 9, k), -3, lerp(-5.5, 6.5, k), 6.5 + Math.abs(k - 0.5) * 2); ctx.stroke();
  }
  ctx.restore();
  linea(ctx, masa, 0.3, 0.8);
  if (luz > 0) {
    ctx.strokeStyle = rim; ctx.globalAlpha = luz; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(1.5, -12.4); ctx.bezierCurveTo(6, -12, 9.4, -9, 10.4, -3.8); ctx.bezierCurveTo(10.8, -0.5, 9.8, 4, 7.6, 8); ctx.stroke();
    ctx.globalAlpha = luz * 0.3; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1;
  }
  // mechones afilados: la punta sigue el viento y se retrasa respecto al giro
  for (let i = 0; i < 16; i++) {
    const k = i / 15;
    const ang = lerp(-2.7, -0.45, k); // abanico sobre la coronilla
    const x0 = Math.cos(ang + 0.0) * 9.8, y0 = Math.sin(ang) * 11.2 - 1.2;
    const len = 2.2 + hash(i + 5) * 2.4;
    const tx = x0 + Math.cos(ang) * len + W * (0.7 + hash(i + 9) * 0.9) + Math.sin(t * (2 + hash(i) * 2) + i) * 0.28 - giro * 0.12;
    const ty = y0 + Math.sin(ang) * len + Math.cos(t * 1.4 + i) * 0.2;
    mechon(ctx, x0, y0, tx, ty, (hash(i + 3) - 0.5) * 1.4, 0.62, COL.pelo, i % 3 === 0 ? COL.peloLuz : null);
  }
  // nuca: mechones cortos que caen sobre el cuello
  for (let i = 0; i < 9; i++) {
    const x = lerp(-6.2, 6.2, i / 8);
    mechon(ctx, x, 7.6, x * 0.9 + W * 0.2, 11.4 + hash(i + 70) * 1.6, (hash(i + 71) - 0.5) * 0.8, 0.55, COL.pelo, null);
  }
  ctx.restore();
  ctx.restore();
}


export const drawBackRig = personajeEspalda;
