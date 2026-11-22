// personaje dibujado en canvas con partes y movimiento: cabeza, cuello, torso, brazos, manos, pelo en mechones.
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

// ------------------------------------------------------------------ perfil mirando a la derecha, iluminado por la pantalla
export function personajePerfil(ctx, t, o = {}) {
  const luz = o.luz ?? 1, giro = o.giro ?? 0, parp = o.parpadeo ?? 0;
  const resp = Math.sin(t * 1.25) * 0.3;
  const W = viento(t, 3) * (o.viento ?? 1);
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // torso
  ctx.save();
  ctx.translate(0, resp);
  const torso = new Path2D();
  torso.moveTo(-6, 13); torso.bezierCurveTo(-14, 16, -22, 22, -23, 40); torso.lineTo(-23, 90); torso.lineTo(20, 90);
  torso.bezierCurveTo(21, 60, 19, 36, 14, 26); torso.bezierCurveTo(10, 19, 7, 15, 5, 13); torso.closePath();
  ctx.fillStyle = COL.camiseta; ctx.fill(torso);
  ctx.save(); ctx.clip(torso);
  ctx.fillStyle = COL.camisetaSombra; ctx.beginPath(); ctx.moveTo(-30, 10); ctx.lineTo(-3, 14); ctx.bezierCurveTo(-8, 40, -4, 60, -10, 90); ctx.lineTo(-30, 90); ctx.fill();
  ctx.strokeStyle = 'rgba(8,6,12,0.7)'; ctx.lineWidth = 0.34;
  for (const [a, b, c, d] of [[-12, 24, -9, 50], [4, 26, 1, 52], [12, 30, 10, 56]]) { ctx.beginPath(); ctx.moveTo(a, b); ctx.quadraticCurveTo((a + c) / 2 + 1.6, (b + d) / 2, c, d); ctx.stroke(); }
  ctx.restore();
  linea(ctx, torso, 0.3, 0.7);
  ctx.strokeStyle = COL.rim; ctx.globalAlpha = luz * 0.9; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(5, 13); ctx.bezierCurveTo(7, 15, 10, 19, 14, 26); ctx.bezierCurveTo(19, 36, 21, 60, 20, 85); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
  // cuello
  ctx.save();
  ctx.translate(0, resp * 0.6);
  const cu = new Path2D(); cu.moveTo(-5, 4); cu.lineTo(-5.4, 15); cu.quadraticCurveTo(0, 17.8, 6.4, 14.6); cu.lineTo(5.6, 8.6); cu.lineTo(1.5, 8.4); cu.closePath();
  forma(ctx, cu, COL.sombra, 0.28);
  ctx.strokeStyle = COL.rim; ctx.globalAlpha = luz * 0.7; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(5.6, 9); ctx.lineTo(6.3, 14.6); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.restore();
  // cabeza
  ctx.save();
  ctx.translate(giro, resp * 0.5);
  ctx.rotate(o.inclina ?? 0.05);
  const cara = new Path2D();
  cara.moveTo(-6.6, 3);
  cara.bezierCurveTo(-8, -5, -4, -10.5, 2, -10.5);
  cara.bezierCurveTo(5.4, -10.4, 7.4, -8, 7.8, -5.4);
  cara.lineTo(8.0, -3.8); cara.lineTo(7.5, -2.3);
  cara.quadraticCurveTo(9.0, -0.4, 10.2, 1.3);      // nariz minima
  cara.quadraticCurveTo(10.5, 2.2, 9.2, 2.5);
  cara.lineTo(8.3, 2.7);
  cara.quadraticCurveTo(8.8, 3.6, 8.5, 4.2);
  cara.lineTo(8.1, 4.8);
  cara.quadraticCurveTo(8.7, 5.4, 8.3, 6.2);
  cara.quadraticCurveTo(8.0, 7.0, 7.8, 7.5);
  cara.quadraticCurveTo(8.0, 9.7, 6.2, 10.2);
  cara.quadraticCurveTo(3.4, 10.5, 0.5, 9.3);
  cara.quadraticCurveTo(-3, 8.5, -4.8, 5.7);
  cara.closePath();
  ctx.fillStyle = COL.piel; ctx.fill(cara);
  ctx.save(); ctx.clip(cara);
  // cel de dos tonos: sombra en la parte trasera y bajo la mandibula; luz fria sobre el frente
  ctx.fillStyle = COL.sombra; ctx.globalAlpha = 0.9 * (1 - luz * 0.5);
  ctx.beginPath(); ctx.moveTo(-9, -12); ctx.lineTo(2.2, -12); ctx.quadraticCurveTo(-0.5, 0, 3.2, 12); ctx.lineTo(-9, 12); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 0.65; ctx.fillStyle = COL.sombra2;
  ctx.beginPath(); ctx.ellipse(3.4, 8.9, 5.2, 1.7, 0.1, 0, TAU); ctx.fill();
  ctx.globalAlpha = 0.5 * luz; ctx.fillStyle = COL.luz; ctx.beginPath(); ctx.ellipse(6.6, -0.6, 2.6, 3.4, 0, 0, TAU); ctx.fill();
  ctx.restore();
  linea(ctx, cara, 0.3, 0.6);
  const borde = new Path2D();
  borde.moveTo(7.8, -5.4); borde.lineTo(8.0, -3.8); borde.lineTo(7.5, -2.3); borde.quadraticCurveTo(9.0, -0.4, 10.2, 1.3); borde.quadraticCurveTo(10.5, 2.2, 9.2, 2.5); borde.lineTo(8.3, 2.7);
  borde.quadraticCurveTo(8.8, 3.6, 8.5, 4.2); borde.lineTo(8.1, 4.8); borde.quadraticCurveTo(8.7, 5.4, 8.3, 6.2); borde.quadraticCurveTo(8.0, 7.0, 7.8, 7.5); borde.quadraticCurveTo(8.0, 9.7, 6.2, 10.2);
  ctx.strokeStyle = COL.rim; ctx.globalAlpha = luz; ctx.lineWidth = 0.55; ctx.stroke(borde);
  ctx.globalAlpha = luz * 0.28; ctx.lineWidth = 1.9; ctx.stroke(borde); ctx.globalAlpha = 1;
  // ceja gruesa y recta
  ctx.strokeStyle = COL.pelo; ctx.lineCap = 'round';
  ctx.lineWidth = 1.05; ctx.beginPath(); ctx.moveTo(3.3, -3.9); ctx.quadraticCurveTo(5.8, -4.6, 8.0, -3.9); ctx.stroke();
  ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(3.0, -3.6); ctx.lineTo(4.4, -4.1); ctx.stroke();
  // ojo sobrio, cansado: parpado superior pesado y caido, iris marron casi negro con el reflejo de la pantalla
  const abre = 1 - clamp(parp);
  ctx.save();
  ctx.translate(5.7, -1.5);
  const ojo = new Path2D();
  ojo.moveTo(-2.1, 0.1); ojo.quadraticCurveTo(0, -1.5 * abre + 0.35, 2.1, 0.35); ojo.quadraticCurveTo(0.2, 1.05 * abre, -2.1, 0.1); ojo.closePath();
  ctx.fillStyle = '#d9cbb3'; ctx.fill(ojo);
  ctx.save(); ctx.clip(ojo);
  ctx.fillStyle = '#1a0d08'; ctx.beginPath(); ctx.ellipse(0.55, 0.2, 1.05, 1.25, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#3a1d0e'; ctx.beginPath(); ctx.ellipse(0.55, 0.35, 0.8, 0.8, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#0a0504'; ctx.beginPath(); ctx.arc(0.6, 0.2, 0.42, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(190,220,255,0.95)'; ctx.fillRect(0.85, -0.2, 0.34, 0.26);
  ctx.restore();
  // parpado caido: sombra del parpado y linea gruesa con pestanas
  ctx.fillStyle = COL.sombra2; ctx.globalAlpha = 0.55;
  ctx.beginPath(); ctx.moveTo(-2.3, -0.1); ctx.quadraticCurveTo(0, -1.9 * abre + 0.2, 2.3, 0.2); ctx.lineTo(2.3, -0.7); ctx.quadraticCurveTo(0, -2.3 * abre, -2.3, -0.9); ctx.fill(); ctx.globalAlpha = 1;
  ctx.strokeStyle = COL.tinta; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-2.2, 0.15); ctx.quadraticCurveTo(0, -1.7 * abre + 0.3, 2.3, 0.3); ctx.stroke();
  ctx.lineWidth = 0.32; ctx.beginPath(); ctx.moveTo(2.3, 0.3); ctx.lineTo(3.1, -0.35); ctx.moveTo(1.8, 0.0); ctx.lineTo(2.6, -0.8); ctx.stroke();
  ctx.lineWidth = 0.22; ctx.beginPath(); ctx.moveTo(-1.5, 0.95 * abre); ctx.quadraticCurveTo(0.2, 1.3 * abre, 1.8, 0.55); ctx.stroke();
  ctx.restore();
  // boca minima
  ctx.strokeStyle = '#4a241c'; ctx.lineWidth = 0.3;
  ctx.beginPath(); ctx.moveTo(8.1, 4.8); ctx.quadraticCurveTo(6.6, 5.0, 5.6, 4.6); ctx.stroke();
  // oreja con audifono
  const ore = new Path2D(); ore.ellipse(-1.3, 1.6, 1.9, 3.1, -0.1, 0, TAU); forma(ctx, ore, COL.piel, 0.24);
  ctx.fillStyle = COL.sombra; ctx.beginPath(); ctx.ellipse(-1.2, 1.7, 0.8, 1.6, -0.1, 0, TAU); ctx.fill();
  ctx.fillStyle = COL.cable; ctx.beginPath(); ctx.ellipse(-0.6, 2.2, 0.85, 1.1, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = COL.tinta; ctx.lineWidth = 0.2; ctx.stroke();
  // pelo: masa trasera con flequillo de lado
  const pelo = new Path2D();
  pelo.moveTo(-6.8, 6.6);
  pelo.bezierCurveTo(-10.8, 1.5, -10, -8, -4.5, -11.5);
  pelo.bezierCurveTo(0.5, -13.8, 6.2, -11.8, 8.7, -7.5);
  pelo.bezierCurveTo(9.0, -6.5, 8.8, -5.7, 8.3, -6.0);
  pelo.bezierCurveTo(6.4, -7.4, 4.2, -6.3, 2.4, -7.2);
  pelo.bezierCurveTo(0.4, -7.7, -1.4, -5.2, -2.6, -2.4);
  pelo.bezierCurveTo(-3.6, 0.2, -3.2, 3.6, -3.8, 6);
  pelo.bezierCurveTo(-4.8, 7.4, -6, 7.4, -6.8, 6.6);
  pelo.closePath();
  ctx.fillStyle = COL.pelo; ctx.fill(pelo);
  ctx.save(); ctx.clip(pelo);
  ctx.fillStyle = COL.peloMedio; ctx.beginPath(); ctx.moveTo(-4, -14); ctx.bezierCurveTo(4, -13, 9, -9, 9, -5); ctx.lineTo(2, -6.5); ctx.bezierCurveTo(-1, -7, -3, -10, -4, -14); ctx.fill();
  ctx.strokeStyle = COL.peloLuz; ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) { ctx.lineWidth = 0.2 + 0.2 * (i % 2); ctx.beginPath(); ctx.moveTo(-6 + i * 1.4, -9.5 + Math.abs(i - 3) * 0.4); ctx.quadraticCurveTo(-3 + i * 1.5, -8, 2 + i * 1.1, -6.6); ctx.stroke(); }
  ctx.restore();
  linea(ctx, pelo, 0.3, 0.8);
  ctx.strokeStyle = COL.rim; ctx.globalAlpha = luz * 0.9; ctx.lineWidth = 0.55;
  ctx.beginPath(); ctx.moveTo(0.5, -13.0); ctx.bezierCurveTo(4, -12.7, 7.6, -10.7, 8.7, -7.5); ctx.stroke(); ctx.globalAlpha = 1;
  // mechones del flequillo: puntas afiladas con inercia
  for (let i = 0; i < 7; i++) {
    const x0 = 2.1 + i * 0.95, y0 = -7.1 + (i % 2) * 0.35;
    const tx = x0 + 0.9 + i * 0.12 + W * 0.5 + Math.sin(t * 2.1 + i) * 0.22 + giro * 0.2;
    const ty = y0 + 1.7 + hash(i + 40) * 1.7 + Math.abs(W) * 0.2;
    mechon(ctx, x0, y0, tx, ty, 0.4, 0.55, COL.pelo, i % 2 ? COL.peloLuz : null);
  }
  // mechones sueltos en la coronilla
  for (let i = 0; i < 5; i++) {
    const x0 = -4 + i * 2.2, y0 = -12 + Math.abs(i - 2) * 0.6;
    mechon(ctx, x0, y0, x0 + W * 0.9 + 0.5, y0 - 1.6 - hash(i + 90), 0.3, 0.5, COL.pelo, COL.peloLuz);
  }
  ctx.restore();
  ctx.restore();
}

export function cableAudifono(ctx, x0, y0, x1, y1, t, holgura = 8) {
  ctx.save();
  ctx.lineCap = 'round';
  const cx = (x0 + x1) / 2 + Math.sin(t * 0.9) * 0.3, cy = Math.max(y0, y1) + holgura;
  const p = new Path2D();
  p.moveTo(x0, y0);
  p.bezierCurveTo(x0 + (cx - x0) * 0.2, y0 + holgura * 0.9, cx - (x1 - x0) * 0.2, cy, cx, cy - 1);
  p.bezierCurveTo(cx + (x1 - cx) * 0.4, cy - 1, x1 - (x1 - x0) * 0.1, y1 + holgura * 0.4, x1, y1);
  ctx.strokeStyle = 'rgba(8,6,10,0.6)'; ctx.lineWidth = 0.75; ctx.stroke(p);
  ctx.strokeStyle = COL.cable; ctx.lineWidth = 0.42; ctx.stroke(p);
  ctx.restore();
}

// ------------------------------------------------------------------ dedos bien construidos: tres falanges, nudillos y unas
function dedo(ctx, bx, by, ang, largos, anchoBase, curva, luz) {
  // devuelve la punta; dibuja de la base a la punta con ancho decreciente (contorno y relleno)
  const pts = [[bx, by]];
  let a = ang, x = bx, y = by;
  for (let i = 0; i < largos.length; i++) { a += curva * (i + 1) * 0.5; x += Math.cos(a) * largos[i]; y += Math.sin(a) * largos[i]; pts.push([x, y]); }
  for (let i = 0; i < pts.length - 1; i++) {
    const w0 = anchoBase * (1 - i * 0.18), w1 = anchoBase * (1 - (i + 1) * 0.18);
    const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1], L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    const p = new Path2D();
    p.moveTo(pts[i][0] + nx * w0 / 2, pts[i][1] + ny * w0 / 2);
    p.lineTo(pts[i + 1][0] + nx * w1 / 2, pts[i + 1][1] + ny * w1 / 2);
    p.arc(pts[i + 1][0], pts[i + 1][1], w1 / 2, Math.atan2(ny, nx), Math.atan2(ny, nx) + Math.PI);
    p.lineTo(pts[i][0] - nx * w0 / 2, pts[i][1] - ny * w0 / 2);
    p.closePath();
    ctx.fillStyle = COL.piel; ctx.fill(p);
    ctx.save(); ctx.clip(p); ctx.fillStyle = COL.sombra; ctx.globalAlpha = 0.6; ctx.fillRect(Math.min(pts[i][0], pts[i + 1][0]) - 2, Math.min(pts[i][1], pts[i + 1][1]) - 2, 8, 8); ctx.restore();
    ctx.strokeStyle = COL.tinta; ctx.lineWidth = 0.2; ctx.stroke(p);
    // luz fria en el borde que da a la pantalla
    ctx.strokeStyle = COL.rim; ctx.globalAlpha = 0.55 * luz; ctx.lineWidth = 0.3;
    ctx.beginPath(); ctx.moveTo(pts[i][0] - nx * w0 / 2, pts[i][1] - ny * w0 / 2); ctx.lineTo(pts[i + 1][0] - nx * w1 / 2, pts[i + 1][1] - ny * w1 / 2); ctx.stroke(); ctx.globalAlpha = 1;
  }
  const end = pts[pts.length - 1];
  ctx.fillStyle = 'rgba(236,205,185,0.6)'; ctx.beginPath(); ctx.ellipse(end[0] - Math.cos(a) * 0.5, end[1] - Math.sin(a) * 0.5, 0.45, 0.65, a, 0, TAU); ctx.fill();
  return end;
}

// teclado en perspectiva: macbook plateada, teclas pequenas, y dos manos con dedos que teclean
export function manosTeclado(ctx, t, o = {}) {
  const luz = o.luz ?? 1, ritmo = o.ritmo ?? 1;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const yA = -22, yB = 34, xa0 = 40, xb0 = 62;
  // base de aluminio plateado
  const base = new Path2D(); base.moveTo(-xa0 - 4, yA - 3); base.lineTo(xa0 + 4, yA - 3); base.lineTo(xb0 + 6, yB + 4); base.lineTo(-xb0 - 6, yB + 4); base.closePath();
  const alu = ctx.createLinearGradient(0, yA, 0, yB);
  alu.addColorStop(0, '#8d9098'); alu.addColorStop(0.5, '#aeb1b8'); alu.addColorStop(1, '#c9ccd2');
  ctx.fillStyle = alu; ctx.fill(base);
  ctx.strokeStyle = 'rgba(30,30,36,0.85)'; ctx.lineWidth = 0.3; ctx.stroke(base);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; const fr = ctx.createLinearGradient(0, yA, 0, yB); fr.addColorStop(0, `rgba(120,150,220,${0.35 * luz})`); fr.addColorStop(1, 'rgba(120,150,220,0)'); ctx.fillStyle = fr; ctx.fill(base); ctx.restore();
  const xw = (y) => lerp(xa0, xb0, (y - yA) / (yB - yA));
  // filas de teclas pequenas con huecos
  const filas = 6, cols = [14, 14, 14, 13, 12, 9];
  for (let r = 0; r < filas; r++) {
    const y0 = lerp(yA + 2, yB - 26, r / filas), y1 = lerp(yA + 2, yB - 26, (r + 0.82) / filas);
    const w0 = xw(y0) - 3, w1 = xw(y1) - 3, n = cols[r];
    for (let c = 0; c < n; c++) {
      const x00 = -w0 + (c / n) * 2 * w0 + 0.25, x01 = -w0 + ((c + 0.86) / n) * 2 * w0;
      const x10 = -w1 + (c / n) * 2 * w1 + 0.25, x11 = -w1 + ((c + 0.86) / n) * 2 * w1;
      const lit = Math.sin(t * 0.7 + r * 2.1 + c * 0.9) > 0.97 ? 0.5 : 0;
      ctx.beginPath(); ctx.moveTo(x00, y0); ctx.lineTo(x01, y0); ctx.lineTo(x11, y1); ctx.lineTo(x10, y1); ctx.closePath();
      ctx.fillStyle = `rgb(${24 + lit * 40},${25 + lit * 40},${30 + lit * 60})`; ctx.fill();
      ctx.fillStyle = `rgba(150,180,255,${0.16 * luz})`; ctx.fillRect(Math.min(x00, x10), y0, Math.abs(x01 - x00) * 0.9, 0.22);
    }
  }
  // trackpad
  const ty0 = yB - 21, ty1 = yB - 2;
  ctx.beginPath(); ctx.moveTo(-14, ty0); ctx.lineTo(14, ty0); ctx.lineTo(15.5, ty1); ctx.lineTo(-15.5, ty1); ctx.closePath();
  ctx.fillStyle = '#b9bcc3'; ctx.fill(); ctx.strokeStyle = 'rgba(40,40,48,0.7)'; ctx.lineWidth = 0.22; ctx.stroke();
  // manos
  const mano = (lado) => {
    const bx = lado * 17;
    ctx.save();
    ctx.translate(bx, 18 + Math.sin(t * 1.2 + lado) * 0.25);
    ctx.rotate(lado * -0.1);
    // antebrazo y manga
    const manga = new Path2D(); manga.moveTo(-8.5, 30); manga.lineTo(-6.8, 6); manga.lineTo(6.8, 6); manga.lineTo(8.5, 30); manga.closePath();
    forma(ctx, manga, COL.camiseta, 0.28, 0.6);
    ctx.strokeStyle = COL.rim; ctx.globalAlpha = 0.5 * luz; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(6.8, 6); ctx.lineTo(8.5, 30); ctx.stroke(); ctx.globalAlpha = 1;
    // muneca y dorso de la mano
    const dorso = new Path2D(); dorso.moveTo(-5, 6.5); dorso.quadraticCurveTo(-7.2, -1, -6.2, -8); dorso.quadraticCurveTo(0, -10.4, 6.2, -8); dorso.quadraticCurveTo(7.2, -1, 5, 6.5); dorso.closePath();
    forma(ctx, dorso, COL.piel, 0.28, 0.5);
    ctx.save(); ctx.clip(dorso); ctx.fillStyle = COL.sombra; ctx.globalAlpha = 0.55 - luz * 0.15; ctx.fillRect(-8, -12, 7, 20); ctx.restore();
    // nudillos y tendones
    ctx.strokeStyle = 'rgba(70,38,24,0.7)'; ctx.lineWidth = 0.22;
    for (let f = 0; f < 4; f++) { const x = -4.2 + f * 2.8; ctx.beginPath(); ctx.moveTo(x, 4); ctx.quadraticCurveTo(x + 0.2, -3, x, -8); ctx.stroke(); }
    // dedos: cuatro con tres falanges; la presion curva los dos ultimos segmentos
    for (let f = 0; f < 4; f++) {
      const fx = -4.2 + f * 2.8;
      const fase = t * (5 + hash(f + (lado > 0 ? 9 : 0)) * 3) * ritmo + f * 1.3 + (lado > 0 ? 1.7 : 0);
      const pulsa = Math.max(0, Math.sin(fase)) ** 3 * (Math.sin(t * 0.7 + f + lado) > -0.3 ? 1 : 0.15);
      const base_ = -1.5708 + (f - 1.5) * 0.05;
      const largos = f === 0 || f === 3 ? [4.4, 3.2, 2.5] : [5.0, 3.6, 2.7];
      dedo(ctx, fx, -8.4, base_, largos, 2.55, 0.16 + pulsa * 0.42, luz);
    }
    // pulgar: parte desde el costado
    dedo(ctx, -lado * 5.2, -1.5, -1.5708 - lado * 0.9, [4.0, 3.2], 2.7, -lado * 0.1, luz);
    ctx.restore();
  };
  mano(-1); mano(1);
  ctx.restore();
}

// reloj de pulsera: la aguja tiembla (el tiempo se estira)
export function reloj(ctx, t, x, y, r = 4.2) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath(); ctx.arc(0, 0, r + 0.9, 0, TAU); ctx.fillStyle = '#2a2830'; ctx.fill(); ctx.strokeStyle = COL.tinta; ctx.lineWidth = 0.3; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = '#d8cdb4'; ctx.fill();
  ctx.strokeStyle = '#3a2a1f'; ctx.lineWidth = 0.18;
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * (r - 0.6), Math.sin(a) * (r - 0.6)); ctx.lineTo(Math.cos(a) * r * 0.96, Math.sin(a) * r * 0.96); ctx.stroke(); }
  ctx.strokeStyle = '#1a0f0b'; ctx.lineWidth = 0.4;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(-1.2) * r * 0.5, Math.sin(-1.2) * r * 0.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(0.4) * r * 0.78, Math.sin(0.4) * r * 0.78); ctx.stroke();
  const tic = Math.floor(t * 1.0) + Math.pow((t * 1.0) % 1, 6);
  const tem = Math.sin(t * 38) * 0.035 + Math.sin(t * 91) * 0.02;
  const a = tic * (TAU / 60) * 6 - 1.57 + tem;
  ctx.strokeStyle = '#b03a2a'; ctx.lineWidth = 0.22;
  ctx.beginPath(); ctx.moveTo(Math.cos(a + Math.PI) * 0.9, Math.sin(a + Math.PI) * 0.9); ctx.lineTo(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92); ctx.stroke();
  ctx.fillStyle = '#b03a2a'; ctx.beginPath(); ctx.arc(0, 0, 0.3, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(190,215,255,0.28)'; ctx.beginPath(); ctx.ellipse(-1, -1.4, r * 0.7, r * 0.3, -0.5, 0, TAU); ctx.fill();
  ctx.restore();
}
