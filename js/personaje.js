// personaje dibujado en canvas con partes y movimiento: cabeza, cuello, torso, brazos, manos, pelo con mechones.
// estilo de ilustracion calida: contorno de tinta, color plano y una sombra. unidades: 1 = 1% de la altura del cuadro.
import { clamp, lerp, hash, TAU } from './util.js';

export const COL = {
  piel: '#a8734f', sombra: '#6e4530', luz: '#c18a62',
  pelo: '#15111b', peloLuz: '#2c2640', tinta: '#1a0f0b',
  camiseta: '#1e1d2a', camisetaLuz: '#2d2c40', rim: 'rgba(150,195,255,0.9)', cable: '#ece6d6',
};

function relleno(ctx, color, tinta = true, lw = 0.28) {
  ctx.fillStyle = color;
  ctx.fill();
  if (tinta) { ctx.strokeStyle = COL.tinta; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke(); }
}

// mechon: curva fina que termina en punta; la punta cede con el viento y la inercia
function mechon(ctx, x0, y0, x1, y1, curva, ancho, color, dx, dy) {
  const tx = x1 + dx, ty = y1 + dy;
  const mx = (x0 + tx) / 2 + curva, my = (y0 + ty) / 2;
  ctx.beginPath();
  ctx.moveTo(x0 - ancho, y0);
  ctx.quadraticCurveTo(mx - ancho * 0.6, my, tx, ty);
  ctx.quadraticCurveTo(mx + ancho * 0.6, my, x0 + ancho, y0);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

export function viento(t, seed = 0) {
  return Math.sin(t * 1.1 + seed) * 0.5 + Math.sin(t * 2.7 + seed * 2.3) * 0.25 + Math.sin(t * 0.37 + seed) * 0.4;
}

// ------------------------------------------------------------------ de espaldas (sobre el hombro y frente al horizonte)
// origen: centro de la cabeza. luz: lado derecho (0 sin luz, 1 fuerte). rim: color de luz de borde
export function personajeEspalda(ctx, t, o = {}) {
  const luz = o.luz ?? 0.8, rim = o.rim ?? COL.rim, giro = o.giro ?? 0, mira = o.mira ?? 0;
  const resp = Math.sin(t * 1.25) * 0.28 + Math.sin(t * 0.31) * 0.1;
  ctx.save();
  ctx.lineCap = 'round';
  // torso
  ctx.save();
  ctx.translate(0, resp);
  const yb = o.completo ? 52 : 90, wb = o.completo ? 15 : 24;
  if (o.completo) {
    for (const sg of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sg * 1, yb - 4); ctx.lineTo(sg * (wb + 0.5), yb - 4); ctx.lineTo(sg * (wb - 1.5), 104); ctx.lineTo(sg * 2.2, 104); ctx.closePath();
      relleno(ctx, '#15141d');
      ctx.beginPath(); ctx.ellipse(sg * (wb * 0.5 + 0.8), 105, 5.2, 2.3, 0, 0, TAU); relleno(ctx, '#0d0c12');
    }
    ctx.strokeStyle = COL.rim; ctx.globalAlpha = luz * 0.5; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(wb + 0.5, yb - 4); ctx.lineTo(wb - 1.5, 104); ctx.stroke(); ctx.globalAlpha = 1;
  }
  ctx.beginPath();
  ctx.moveTo(-5.5, 11);
  ctx.bezierCurveTo(-12, 12.5, -21, 15, -23.5, 27);
  ctx.bezierCurveTo(-24.5, 36, -wb - 1, yb - 20, -wb, yb);
  ctx.lineTo(wb, yb);
  ctx.bezierCurveTo(wb + 1, yb - 20, 24.5, 36, 23.5, 27);
  ctx.bezierCurveTo(21, 15, 12, 12.5, 5.5, 11);
  ctx.closePath();
  relleno(ctx, COL.camiseta);
  // pliegues
  ctx.strokeStyle = 'rgba(8,6,12,0.55)';
  ctx.lineWidth = 0.3;
  for (const [a, b, c, d] of [[-12, 22, -8, 46], [10, 24, 7, 50], [0, 30, 1, 56], [-18, 36, -14, 58]]) {
    ctx.beginPath(); ctx.moveTo(a, a < 0 ? b : b); ctx.quadraticCurveTo((a + c) / 2 + 1.5, (b + d) / 2, c, d); ctx.stroke();
  }
  // luz fria en el hombro del lado de la pantalla
  if (luz > 0) {
    ctx.strokeStyle = rim;
    ctx.globalAlpha = luz;
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    ctx.moveTo(5.5, 11);
    ctx.bezierCurveTo(12, 12.5, 21, 15, 23.5, 27);
    ctx.bezierCurveTo(24.5, 36, wb + 1, yb - 20, wb, yb);
    ctx.stroke();
    ctx.globalAlpha = luz * 0.35;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  // cuello
  ctx.save();
  ctx.translate(giro * 0.3, resp * 0.6);
  ctx.beginPath();
  ctx.moveTo(-4.6, 4);
  ctx.lineTo(-4.9, 13);
  ctx.quadraticCurveTo(0, 15.5, 4.9, 13);
  ctx.lineTo(4.6, 4);
  ctx.closePath();
  relleno(ctx, COL.sombra);
  if (luz > 0) {
    ctx.strokeStyle = rim; ctx.globalAlpha = luz * 0.8; ctx.lineWidth = 0.4;
    ctx.beginPath(); ctx.moveTo(4.6, 4); ctx.lineTo(4.9, 13); ctx.stroke(); ctx.globalAlpha = 1;
  }
  ctx.restore();
  // cabeza
  ctx.save();
  ctx.translate(giro, resp * 0.5);
  ctx.rotate(mira * 0.12);
  // oreja del lado de la pantalla
  ctx.beginPath();
  ctx.ellipse(9.3, 2.2, 1.7, 2.8, 0.1, 0, TAU);
  relleno(ctx, COL.piel);
  ctx.beginPath();
  ctx.ellipse(9.4, 2.4, 0.7, 1.4, 0.1, 0, TAU);
  ctx.fillStyle = COL.sombra; ctx.fill();
  // audifono pequeno
  ctx.beginPath(); ctx.ellipse(8.8, 3.0, 0.7, 0.9, 0, 0, TAU); ctx.fillStyle = COL.cable; ctx.fill();
  // masa de pelo
  ctx.beginPath();
  ctx.moveTo(-7.2, 8.2);
  ctx.bezierCurveTo(-10.6, 4.5, -10.8, -4, -8.2, -8);
  ctx.bezierCurveTo(-5, -12.5, 5, -12.5, 8.4, -8);
  ctx.bezierCurveTo(10.8, -4.5, 10.2, 3.5, 7.4, 8.2);
  ctx.bezierCurveTo(4, 10, -3.5, 10, -7.2, 8.2);
  ctx.closePath();
  relleno(ctx, COL.pelo, true, 0.3);
  // reflejos del pelo (franjas de la forma del craneo)
  ctx.strokeStyle = COL.peloLuz; ctx.lineWidth = 0.35; ctx.globalAlpha = 0.9;
  for (let i = 0; i < 7; i++) {
    const k = i / 6;
    ctx.beginPath();
    ctx.moveTo(lerp(-6, 6, k), -9.5 + Math.abs(k - 0.5) * 3);
    ctx.quadraticCurveTo(lerp(-7, 7, k) * 1.1, -2, lerp(-5.5, 5.5, k), 6 + Math.abs(k - 0.5) * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (luz > 0) {
    ctx.strokeStyle = rim; ctx.globalAlpha = luz; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(1.5, -11.6); ctx.bezierCurveTo(5.5, -11.2, 9, -8.5, 10.1, -3.5); ctx.bezierCurveTo(10.5, -0.5, 9.6, 3.8, 7.6, 7.6); ctx.stroke();
    ctx.globalAlpha = luz * 0.3; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1;
  }
  // mechones con fisica simple: la punta sigue al viento y se retrasa respecto al giro
  const w = (o.viento ?? 1) * viento(t, 1);
  for (let i = 0; i < 11; i++) {
    const k = i / 10;
    const x0 = lerp(-8.4, 8.6, k), y0 = -8.5 + Math.abs(k - 0.5) * 5 + (hash(i + 5) - 0.5) * 1.5;
    const dx = w * (0.7 + hash(i + 9) * 0.8) + Math.sin(t * (2 + hash(i) * 2) + i) * 0.25 - giro * 0.15;
    const dy = Math.cos(t * 1.4 + i) * 0.15;
    mechon(ctx, x0, y0, x0 + (k - 0.5) * 2.4, y0 - 2.4 - hash(i + 2) * 1.4, (hash(i + 3) - 0.5) * 1.2, 0.5, COL.pelo, dx, dy);
  }
  // nuca: pelo corto con rayado
  ctx.strokeStyle = 'rgba(10,8,14,0.9)'; ctx.lineWidth = 0.22;
  for (let i = 0; i < 12; i++) {
    const x = lerp(-5.5, 5.5, i / 11);
    ctx.beginPath(); ctx.moveTo(x, 4.5); ctx.lineTo(x * 0.92, 8.8); ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
}

// ------------------------------------------------------------------ perfil mirando a la derecha, iluminado por la pantalla
export function personajePerfil(ctx, t, o = {}) {
  const luz = o.luz ?? 1, giro = o.giro ?? 0, parp = o.parpadeo ?? 0;
  const resp = Math.sin(t * 1.25) * 0.3;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // torso
  ctx.save();
  ctx.translate(0, resp);
  ctx.beginPath();
  ctx.moveTo(-6, 13);
  ctx.bezierCurveTo(-14, 16, -22, 22, -23, 40);
  ctx.lineTo(-23, 90); ctx.lineTo(20, 90);
  ctx.bezierCurveTo(21, 60, 19, 36, 14, 26);
  ctx.bezierCurveTo(10, 19, 7, 15, 5, 13);
  ctx.closePath();
  relleno(ctx, COL.camiseta);
  ctx.strokeStyle = COL.rim; ctx.globalAlpha = luz * 0.9; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(5, 13); ctx.bezierCurveTo(7, 15, 10, 19, 14, 26); ctx.bezierCurveTo(19, 36, 21, 60, 20, 85); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
  // cuello
  ctx.save();
  ctx.translate(0, resp * 0.6);
  ctx.beginPath();
  ctx.moveTo(-5, 4); ctx.lineTo(-5.4, 15); ctx.quadraticCurveTo(0, 17.5, 6.4, 14.6); ctx.lineTo(5.6, 8.6); ctx.lineTo(1.5, 8.4);
  ctx.closePath();
  relleno(ctx, COL.sombra);
  ctx.strokeStyle = COL.rim; ctx.globalAlpha = luz * 0.7; ctx.lineWidth = 0.4;
  ctx.beginPath(); ctx.moveTo(5.6, 9); ctx.lineTo(6.3, 14.6); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.restore();
  // cabeza
  ctx.save();
  ctx.translate(giro, resp * 0.5);
  ctx.rotate(o.inclina ?? 0.05);
  // craneo y cara (perfil)
  const cara = new Path2D();
  cara.moveTo(-6.6, 3);
  cara.bezierCurveTo(-8, -5, -4, -10.5, 2, -10.5);
  cara.bezierCurveTo(5.4, -10.4, 7.4, -8, 7.8, -5.4);   // frente
  cara.lineTo(8.1, -3.6);                                  // arco superciliar
  cara.lineTo(7.5, -2.2);                                  // puente
  cara.quadraticCurveTo(9.2, -0.2, 10.5, 1.5);             // dorso de la nariz
  cara.quadraticCurveTo(10.8, 2.4, 9.4, 2.6);              // punta
  cara.lineTo(8.3, 2.7);                                   // base
  cara.quadraticCurveTo(8.9, 3.6, 8.5, 4.1);               // labio superior
  cara.lineTo(8.0, 4.7);
  cara.quadraticCurveTo(8.8, 5.3, 8.3, 6.1);               // labio inferior
  cara.quadraticCurveTo(8.0, 6.9, 7.8, 7.4);
  cara.quadraticCurveTo(8.0, 9.6, 6.2, 10.1);              // menton
  cara.quadraticCurveTo(3.4, 10.4, 0.5, 9.2);              // mandibula
  cara.quadraticCurveTo(-3, 8.4, -4.8, 5.6);
  cara.closePath();
  ctx.fillStyle = COL.piel; ctx.fill(cara);
  // sombra: toda la mitad trasera de la cara, la luz entra por delante
  ctx.save();
  ctx.clip(cara);
  ctx.fillStyle = COL.sombra;
  ctx.globalAlpha = 0.85 * (1 - luz * 0.55);
  ctx.beginPath(); ctx.moveTo(-9, -12); ctx.lineTo(2.5, -12); ctx.quadraticCurveTo(0, 0, 3.5, 12); ctx.lineTo(-9, 12); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 0.5; ctx.fillStyle = '#4a2e20';
  ctx.beginPath(); ctx.ellipse(3.5, 8.7, 4.8, 1.6, 0.1, 0, TAU); ctx.fill();   // sombra bajo la mandibula
  ctx.restore();
  ctx.strokeStyle = COL.tinta; ctx.lineWidth = 0.3; ctx.stroke(cara);
  // luz fria de la pantalla sobre los rasgos
  ctx.strokeStyle = COL.rim; ctx.globalAlpha = luz; ctx.lineWidth = 0.5;
  const borde = new Path2D();
  borde.moveTo(7.8, -5.4); borde.lineTo(8.1, -3.6); borde.lineTo(7.5, -2.2); borde.quadraticCurveTo(9.2, -0.2, 10.5, 1.5);
  borde.quadraticCurveTo(10.8, 2.4, 9.4, 2.6); borde.lineTo(8.3, 2.7); borde.quadraticCurveTo(8.9, 3.6, 8.5, 4.1); borde.lineTo(8.0, 4.7);
  borde.quadraticCurveTo(8.8, 5.3, 8.3, 6.1); borde.quadraticCurveTo(8.0, 6.9, 7.8, 7.4); borde.quadraticCurveTo(8.0, 9.6, 6.2, 10.1);
  ctx.stroke(borde);
  ctx.globalAlpha = luz * 0.28; ctx.lineWidth = 1.8; ctx.stroke(borde); ctx.globalAlpha = 1;
  // ceja gruesa y recta
  ctx.strokeStyle = COL.pelo; ctx.lineWidth = 0.95;
  ctx.beginPath(); ctx.moveTo(3.4, -3.9); ctx.quadraticCurveTo(5.8, -4.5, 8.0, -3.9); ctx.stroke();
  // ojo cansado: parpado superior pesado, iris oscuro, brillo pequeno
  const abre = 1 - clamp(parp);
  ctx.save();
  ctx.translate(5.6, -1.6);
  ctx.beginPath();
  ctx.moveTo(-2.0, 0.1); ctx.quadraticCurveTo(0, -1.9 * abre + 0.2, 2.0, 0.2); ctx.quadraticCurveTo(0, 1.1 * abre, -2.0, 0.1);
  ctx.closePath();
  ctx.fillStyle = '#e8dcc8'; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = '#1b100c'; ctx.beginPath(); ctx.ellipse(0.5, 0.2, 1.0, 1.15, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(0.9, -0.15, 0.22, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1; ctx.restore();
  ctx.strokeStyle = COL.tinta; ctx.lineWidth = 0.55;
  ctx.beginPath(); ctx.moveTo(-2.1, 0.2); ctx.quadraticCurveTo(0, -2.2 * abre + 0.2, 2.2, 0.1); ctx.stroke();
  ctx.lineWidth = 0.28;
  ctx.beginPath(); ctx.moveTo(-1.4, 0.9 * abre); ctx.quadraticCurveTo(0, 1.4 * abre, 1.8, 0.5); ctx.stroke();
  ctx.restore();
  // boca
  ctx.strokeStyle = '#4a241c'; ctx.lineWidth = 0.28;
  ctx.beginPath(); ctx.moveTo(8.0, 4.7); ctx.quadraticCurveTo(6.4, 4.9, 5.4, 4.5); ctx.stroke();
  // oreja con audifono
  ctx.beginPath(); ctx.ellipse(-1.3, 1.6, 1.9, 3.1, -0.1, 0, TAU); relleno(ctx, COL.piel);
  ctx.beginPath(); ctx.ellipse(-1.2, 1.7, 0.8, 1.6, -0.1, 0, TAU); ctx.fillStyle = COL.sombra; ctx.fill();
  ctx.beginPath(); ctx.ellipse(-0.6, 2.2, 0.85, 1.1, 0, 0, TAU); ctx.fillStyle = COL.cable; ctx.fill();
  ctx.strokeStyle = COL.tinta; ctx.lineWidth = 0.2; ctx.stroke();
  // pelo: masa trasera con el flequillo cayendo de lado sobre la frente
  ctx.beginPath();
  ctx.moveTo(-6.8, 6.6);
  ctx.bezierCurveTo(-10.6, 1.5, -10, -8, -4.5, -11.4);
  ctx.bezierCurveTo(0.5, -13.6, 6.2, -11.6, 8.6, -7.4);
  ctx.bezierCurveTo(8.9, -6.4, 8.7, -5.6, 8.2, -5.9);
  ctx.bezierCurveTo(6.4, -7.3, 4.2, -6.2, 2.4, -7.1);       // flequillo
  ctx.bezierCurveTo(0.4, -7.6, -1.4, -5.2, -2.6, -2.4);
  ctx.bezierCurveTo(-3.6, 0.2, -3.2, 3.6, -3.8, 6);
  ctx.bezierCurveTo(-4.8, 7.4, -6, 7.4, -6.8, 6.6);
  ctx.closePath();
  relleno(ctx, COL.pelo, true, 0.3);
  ctx.strokeStyle = COL.peloLuz; ctx.lineWidth = 0.32;
  for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(-6 + i * 1.4, -9.5 + Math.abs(i - 2.5) * 0.4); ctx.quadraticCurveTo(-3 + i * 1.5, -7.8, 2 + i * 1.1, -6.6); ctx.stroke(); }
  ctx.strokeStyle = COL.rim; ctx.globalAlpha = luz * 0.9; ctx.lineWidth = 0.45;
  ctx.beginPath(); ctx.moveTo(0.5, -12.9); ctx.bezierCurveTo(4, -12.6, 7.6, -10.6, 8.6, -7.4); ctx.stroke();
  ctx.globalAlpha = 1;
  // mechones del flequillo con inercia
  const w = viento(t, 3) * (o.viento ?? 1);
  for (let i = 0; i < 6; i++) {
    const x0 = 2.2 + i * 1.1, y0 = -7 + (i % 2) * 0.3;
    mechon(ctx, x0, y0, x0 + 1.0 + i * 0.1, y0 + 1.6 + hash(i + 40) * 1.6, 0.35, 0.5, COL.pelo, w * 0.5 + Math.sin(t * 2.1 + i) * 0.2 + giro * 0.2, Math.abs(w) * 0.2);
  }
  ctx.restore();
  // cable del audifono: baja por el cuello hacia el pecho y sale hacia el portatil
  ctx.restore();
}

export function cableAudifono(ctx, x0, y0, x1, y1, t, holgura = 8) {
  ctx.save();
  ctx.lineCap = 'round';
  const cx = (x0 + x1) / 2 + Math.sin(t * 0.9) * 0.3, cy = Math.max(y0, y1) + holgura;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.bezierCurveTo(x0 + (cx - x0) * 0.2, y0 + holgura * 0.9, cx - (x1 - x0) * 0.2, cy, cx, cy - 1);
  ctx.bezierCurveTo(cx + (x1 - cx) * 0.4, cy - 1, x1 - (x1 - x0) * 0.1, y1 + holgura * 0.4, x1, y1);
  ctx.strokeStyle = 'rgba(8,6,10,0.6)'; ctx.lineWidth = 0.75; ctx.stroke();
  ctx.strokeStyle = COL.cable; ctx.lineWidth = 0.42; ctx.stroke();
  ctx.restore();
}

// ------------------------------------------------------------------ manos sobre el teclado (primer plano)
export function manosTeclado(ctx, t, o = {}) {
  const luz = o.luz ?? 1, ritmo = o.ritmo ?? 1;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // teclado en perspectiva
  const filas = 5, cols = 14;
  ctx.beginPath(); ctx.moveTo(-34, -6); ctx.lineTo(34, -6); ctx.lineTo(46, 30); ctx.lineTo(-46, 30); ctx.closePath();
  ctx.fillStyle = '#17151d'; ctx.fill(); ctx.strokeStyle = COL.rim; ctx.globalAlpha = 0.5 * luz; ctx.lineWidth = 0.35; ctx.stroke(); ctx.globalAlpha = 1;
  for (let r = 0; r < filas; r++) {
    const y0 = lerp(-5, 29, r / filas), y1 = lerp(-5, 29, (r + 0.84) / filas);
    const xa = (y) => lerp(34, 46, (y + 6) / 36), cw = (y) => (xa(y) * 2) / cols;
    for (let c = 0; c < cols; c++) {
      const w0 = cw(y0), w1 = cw(y1);
      const x00 = -xa(y0) + c * w0 + 0.3, x01 = x00 + w0 - 0.6;
      const x10 = -xa(y1) + c * w1 + 0.3, x11 = x10 + w1 - 0.6;
      const lit = Math.sin(t * 0.5 + r * 2 + c * 0.7) > 0.96 ? 1 : 0;
      ctx.beginPath(); ctx.moveTo(x00, y0); ctx.lineTo(x01, y0); ctx.lineTo(x11, y1); ctx.lineTo(x10, y1); ctx.closePath();
      ctx.fillStyle = `rgba(${34 + luz * 14},${34 + luz * 18},${48 + luz * 34},1)`; ctx.fill();
    }
  }
  // manos
  const mano = (lado) => {
    const sx = lado * 17;
    ctx.save();
    ctx.translate(sx, 14 + Math.sin(t * 1.2 + lado) * 0.25);
    ctx.rotate(lado * -0.12);
    // antebrazo (manga oscura que viene de abajo)
    ctx.beginPath(); ctx.moveTo(-8, 26); ctx.lineTo(-6.5, 3); ctx.lineTo(6.5, 3); ctx.lineTo(8, 26); ctx.closePath();
    relleno(ctx, COL.camiseta);
    ctx.strokeStyle = COL.rim; ctx.globalAlpha = 0.5 * luz; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(6.5, 3); ctx.lineTo(8, 26); ctx.stroke(); ctx.globalAlpha = 1;
    // muneca y palma
    ctx.beginPath(); ctx.moveTo(-5.2, 3.5); ctx.quadraticCurveTo(-7, -4, -5.4, -9); ctx.lineTo(5.4, -9); ctx.quadraticCurveTo(7, -4, 5.2, 3.5); ctx.closePath();
    relleno(ctx, COL.piel);
    ctx.save(); ctx.clip(); ctx.fillStyle = COL.sombra; ctx.globalAlpha = 0.55 - luz * 0.2; ctx.fillRect(-8, -10, 6, 16); ctx.restore();
    // dedos que teclean
    for (let f = 0; f < 4; f++) {
      const fx = -4.1 + f * 2.7;
      const fase = t * (5 + hash(f + (lado > 0 ? 9 : 0)) * 3) * ritmo + f * 1.3 + (lado > 0 ? 1.7 : 0);
      const pulsa = Math.max(0, Math.sin(fase)) ** 3 * (Math.sin(t * 0.7 + f + lado) > -0.3 ? 1 : 0.15);
      const l1 = 4.6 + (f === 1 || f === 2 ? 0.6 : 0), l2 = 3.6;
      const a1 = -1.5708 + (f - 1.5) * 0.06 + pulsa * 0.35;
      const x1 = fx + Math.cos(a1) * l1, y1 = -9 + Math.sin(a1) * l1;
      const a2 = a1 + 0.35 + pulsa * 0.6;
      const x2 = x1 + Math.cos(a2) * l2, y2 = y1 + Math.sin(a2) * l2;
      ctx.strokeStyle = COL.tinta; ctx.lineWidth = 2.45; ctx.beginPath(); ctx.moveTo(fx, -9); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.strokeStyle = COL.piel; ctx.lineWidth = 1.95; ctx.stroke();
      ctx.strokeStyle = COL.rim; ctx.globalAlpha = 0.5 * luz; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(fx + 0.8, -9); ctx.lineTo(x1 + 0.8, y1); ctx.lineTo(x2 + 0.8, y2); ctx.stroke(); ctx.globalAlpha = 1;
    }
    // pulgar
    ctx.strokeStyle = COL.tinta; ctx.lineWidth = 2.7; ctx.beginPath(); ctx.moveTo(-lado * 4.6, -2); ctx.lineTo(-lado * 8, -6.5); ctx.stroke();
    ctx.strokeStyle = COL.piel; ctx.lineWidth = 2.2; ctx.stroke();
    ctx.restore();
  };
  mano(-1); mano(1);
  ctx.restore();
}

// reloj de pulsera: la aguja tiembla (el tiempo se estira)
export function reloj(ctx, t, x, y, r = 4.2) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath(); ctx.arc(0, 0, r + 0.9, 0, TAU); ctx.fillStyle = '#25232c'; ctx.fill(); ctx.strokeStyle = COL.tinta; ctx.lineWidth = 0.3; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = '#d8cdb4'; ctx.fill();
  ctx.strokeStyle = '#3a2a1f'; ctx.lineWidth = 0.18;
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * (r - 0.6), Math.sin(a) * (r - 0.6)); ctx.lineTo(Math.cos(a) * r * 0.96, Math.sin(a) * r * 0.96); ctx.stroke(); }
  // horas y minutos casi quietos
  ctx.strokeStyle = '#1a0f0b'; ctx.lineWidth = 0.4;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(-1.2) * r * 0.5, Math.sin(-1.2) * r * 0.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(0.4) * r * 0.78, Math.sin(0.4) * r * 0.78); ctx.stroke();
  // segundero: avanza a tirones y tiembla
  const tic = Math.floor(t * 1.0) + Math.pow((t * 1.0) % 1, 6);
  const tem = Math.sin(t * 38) * 0.035 + Math.sin(t * 91) * 0.02;
  const a = tic * (TAU / 60) * 6 - 1.57 + tem;
  ctx.strokeStyle = '#b03a2a'; ctx.lineWidth = 0.22;
  ctx.beginPath(); ctx.moveTo(Math.cos(a + Math.PI) * 0.9, Math.sin(a + Math.PI) * 0.9); ctx.lineTo(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92); ctx.stroke();
  ctx.fillStyle = '#b03a2a'; ctx.beginPath(); ctx.arc(0, 0, 0.3, 0, TAU); ctx.fill();
  // reflejo del cristal
  ctx.fillStyle = 'rgba(190,215,255,0.28)'; ctx.beginPath(); ctx.ellipse(-1, -1.4, r * 0.7, r * 0.3, -0.5, 0, TAU); ctx.fill();
  ctx.restore();
}
