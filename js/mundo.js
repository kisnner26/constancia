// una sola toma continua: luciernaga -> cuarto a las 2am -> mente -> edades -> ojo -> agujero negro -> planeta lejano -> regreso.
// la camara se mueve siempre; los cortes son por coincidencia de forma o de luz (match cut) o por barridos rapidos.
import { clamp, lerp, sstep, ease, easeOut, rng, hash, noise1, TAU } from './util.js';
import { dibujarTrazos, dibujarMorph, dibujarAguada, cacheCompleto, ESTILO } from './retratos.js';
import { personajeEspalda, personajePerfil, manosTeclado, reloj, cableAudifono, viento, COL } from './personaje.js';

export const FIN = 236;
// instantes clave (segundos)
export const K = { cuarto: 9, whipB: 24, whipC: 38, whipA: 49, push: 50.4, mente: 62, edades: 98, ojo: 152, agujero: 174, planeta: 194, regreso: 226 };
const EDADES = ['nino', 'adolescente', 'adulto', 'viejo', 'muerte'];
const W_SHOT = 178;

function sprite(rgb, n = 96) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  g.addColorStop(0, `rgba(${rgb},1)`);
  g.addColorStop(0.15, `rgba(${rgb},0.8)`);
  g.addColorStop(0.45, `rgba(${rgb},0.18)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = g;
  x.fillRect(0, 0, n, n);
  return c;
}

function papelTextura(w, h) {
  const tile = document.createElement('canvas');
  tile.width = tile.height = 256;
  const x = tile.getContext('2d');
  const id = x.createImageData(256, 256);
  const r = rng(5);
  for (let i = 0; i < 256 * 256; i++) {
    const v = 128 + (r() - 0.5) * 16 + (r() - 0.5) * 10;
    id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v;
    id.data[i * 4 + 3] = 255;
  }
  x.putImageData(id, 0, 0);
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(w)); c.height = Math.max(2, Math.round(h));
  const g = c.getContext('2d');
  g.fillStyle = '#e8dbbd'; g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.55;
  g.fillStyle = g.createPattern(tile, 'repeat'); g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  const v = g.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.3, c.width / 2, c.height / 2, Math.hypot(c.width, c.height) * 0.62);
  v.addColorStop(0, 'rgba(120,80,40,0)'); v.addColorStop(1, 'rgba(90,55,25,0.38)');
  g.fillStyle = v; g.fillRect(0, 0, c.width, c.height);
  return c;
}

export function crearMundo(env) {
  const { ctx, G, R, reducir } = env;
  const SPR_LUZ = sprite('255,236,150');
  const SPR_CALIDA = sprite('255,190,110');
  const SPR_FRIA = sprite('150,190,255');
  let papelC = null, papelKey = '';
  const getPapel = (w, h) => { const k = `${w}x${h}`; if (k !== papelKey) { papelC = papelTextura(w, h); papelKey = k; } return papelC; };

  // ------------------------------------------------------------ camara
  const cam = { x: 0, y: 0, z: 1, rot: 0 };
  function aplicarCamara(S) {
    ctx.translate(S.w / 2, S.h / 2);
    ctx.rotate(cam.rot);
    ctx.scale(S.u * cam.z, S.u * cam.z);
    ctx.translate(-cam.x, -cam.y);
  }
  function proyectar(S, x, y) {
    const c = Math.cos(cam.rot), s = Math.sin(cam.rot);
    const dx = (x - cam.x) * S.u * cam.z, dy = (y - cam.y) * S.u * cam.z;
    return [S.w / 2 + dx * c - dy * s, S.h / 2 + dx * s + dy * c];
  }
  const ruta = (t, a, b, f = ease) => lerp(0, 1, f(clamp((t - a) / (b - a))));

  // ------------------------------------------------------------ luciernagas
  function luciernaga(x, y, r, a, ta, fase = 0) {
    const per = 3.1;
    const b = Math.pow(Math.max(0, Math.sin(((ta / per) + fase) * Math.PI)), 4);
    const al = (0.18 + 0.82 * b) * a;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = al;
    ctx.drawImage(SPR_LUZ, x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
    ctx.globalAlpha = Math.min(1, al * 1.4);
    ctx.fillStyle = '#fff7cc';
    ctx.fillRect(x - r * 0.12, y - r * 0.12, r * 0.24, r * 0.24);
    ctx.restore();
  }
  const MORSE = (() => {
    const letras = { a: '.-', q: '--.-', u: '..-', i: '..' };
    const u = 0.3; const ev = []; let t = 0;
    for (const ch of 'aqui') { for (const s of letras[ch]) { const d = s === '.' ? 1 : 3; ev.push([t, t + d * u]); t += d * u + u; } t += 2 * u; }
    t += 4 * u;
    return { ev, total: t };
  })();
  function morse(S, x, y, alfa, r) {
    const t = S.ta % MORSE.total;
    let on = 0;
    for (const [a, b] of MORSE.ev) if (t >= a && t < b) { on = Math.min(1, Math.min(t - a, b - t) / 0.05); break; }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (0.1 + 0.9 * on) * alfa;
    ctx.drawImage(SPR_LUZ, x - r * 2.4, y - r * 2.4, r * 4.8, r * 4.8);
    ctx.fillStyle = '#fffbe0'; ctx.globalAlpha = (0.2 + 0.8 * on) * alfa;
    ctx.fillRect(x - r * 0.1, y - r * 0.1, r * 0.2, r * 0.2);
    ctx.restore();
  }

  // ------------------------------------------------------------ 0 luciernaga
  function luciernagaSola(S, t) {
    const { w, h, u } = S;
    ctx.fillStyle = '#0a0705'; ctx.fillRect(0, 0, w, h);
    // la luciernaga deriva despacio hacia el centro; al final se vuelve la luz de la pantalla
    const k = ease(clamp((t - 1) / 7.5));
    const x = lerp(w * 0.62, w * 0.5, k) + Math.sin(S.ta * 0.8) * u * 2.2 * (1 - k * 0.8);
    const y = lerp(h * 0.62, h * 0.46, k) + Math.cos(S.ta * 0.6) * u * 1.8 * (1 - k * 0.8);
    const r = u * lerp(2.2, 3.4, k);
    luciernaga(x, y, r, 1, S.ta);
    return [x, y, r];
  }

  // ------------------------------------------------------------ 1 el cuarto
  function maderaEscritorio(S, tope, alto) {
    const g = ctx.createLinearGradient(0, tope, 0, alto);
    g.addColorStop(0, '#2c1b11'); g.addColorStop(1, '#1b110a');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(-160, tope); ctx.lineTo(160, tope); ctx.lineTo(190, alto); ctx.lineTo(-190, alto); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(20,10,5,0.55)'; ctx.lineWidth = 0.18;
    for (let i = 0; i < 26; i++) {
      const y = lerp(tope + 1, alto, i / 26);
      ctx.beginPath(); ctx.moveTo(-170, y); ctx.bezierCurveTo(-60, y + 0.8 * Math.sin(i), 60, y - 0.8 * Math.cos(i * 2), 170, y + 0.3); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(190,140,90,0.28)'; ctx.lineWidth = 0.3;
    ctx.beginPath(); ctx.moveTo(-160, tope); ctx.lineTo(160, tope); ctx.stroke();
  }

  function ventana(S, t, x, y, w, h) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#0b1220'); g.addColorStop(0.7, '#161a2a'); g.addColorStop(1, '#10101a');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    // campo de maiz al viento: tallos que se mecen
    for (let i = 0; i < 46; i++) {
      const px = x + (i / 45) * w + (hash(i) - 0.5) * 2;
      const alt = 8 + hash(i + 3) * 8;
      const sway = Math.sin(t * 1.2 + i * 0.55 + Math.sin(t * 0.3) * 2) * 1.4 * (0.6 + 0.4 * Math.sin(t * 0.4 + i));
      ctx.strokeStyle = i % 3 ? '#07090d' : '#0b0f15';
      ctx.lineWidth = 0.55;
      ctx.beginPath(); ctx.moveTo(px, y + h); ctx.quadraticCurveTo(px + sway * 0.4, y + h - alt * 0.6, px + sway, y + h - alt); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px + sway * 0.55, y + h - alt * 0.6); ctx.lineTo(px + sway * 0.55 + 1.6, y + h - alt * 0.75 - 0.6); ctx.stroke();
    }
    // lluvia fina
    ctx.strokeStyle = 'rgba(150,175,230,0.35)'; ctx.lineWidth = 0.12;
    const n = reducir ? 30 : 90;
    for (let i = 0; i < n; i++) {
      const px = x + hash(i * 3 + 1) * w;
      const py = y + ((hash(i * 3 + 2) * h + t * (38 + hash(i) * 22)) % h);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - 0.7, py + 2.4); ctx.stroke();
    }
    // reflejo de la pantalla en el cristal
    ctx.restore();
    ctx.strokeStyle = '#2a1c12'; ctx.lineWidth = 1.2; ctx.strokeRect(x, y, w, h);
    ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.moveTo(x, y + h * 0.55); ctx.lineTo(x + w, y + h * 0.55); ctx.stroke();
  }

  function estanteria(x, y, w, h, t) {
    // vista desde atras: el marco, las tablas y la luz calida que se cuela entre los libros
    ctx.fillStyle = '#0e0a08'; ctx.fillRect(x, y, w, h);
    const filas = 5;
    for (let r = 0; r < filas; r++) {
      const ry = y + (r / filas) * h;
      ctx.fillStyle = '#251810'; ctx.fillRect(x, ry + h / filas - 1.1, w, 1.1);
      for (let i = 0; i < 11; i++) {
        const bx = x + 1 + i * (w - 2) / 11;
        const bh = (h / filas) * (0.62 + hash(r * 17 + i) * 0.32);
        ctx.fillStyle = `hsl(${20 + hash(r * 5 + i) * 20},${18 + hash(i) * 20}%,${8 + hash(r + i * 3) * 8}%)`;
        ctx.fillRect(bx, ry + h / filas - 1.1 - bh, (w - 2) / 11 - 0.4, bh);
      }
      // rendijas de luz entre libros
      ctx.fillStyle = `rgba(255,170,90,${0.12 + 0.05 * Math.sin(t * 0.7 + r)})`;
      for (let i = 0; i < 3; i++) ctx.fillRect(x + 2 + hash(r * 9 + i) * (w - 5), ry + 1.2, 0.35, h / filas - 3);
    }
    ctx.strokeStyle = '#34210f'; ctx.lineWidth = 0.7; ctx.strokeRect(x, y, w, h);
  }

  function polvoEnRayas(S, t0, t) {
    // el polvo cae en el haz de la ventana y se asienta formando lineas en el escritorio, como un mensaje
    const lineas = 7;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const haz = ctx.createLinearGradient(-60, -30, -30, 40);
    haz.addColorStop(0, 'rgba(120,150,210,0.12)'); haz.addColorStop(1, 'rgba(120,150,210,0)');
    ctx.fillStyle = haz;
    ctx.beginPath(); ctx.moveTo(-70, -22); ctx.lineTo(-38, -22); ctx.lineTo(-30, 46); ctx.lineTo(-84, 46); ctx.closePath(); ctx.fill();
    const n = reducir ? 60 : 180;
    for (let i = 0; i < n; i++) {
      const li = i % lineas;
      const xl = -78 + li * 4.6 + (hash(i * 7) - 0.5) * 1.2;
      const yl = 24 + (i / n) * 18 + li * 0.5;
      const llegada = t0 + (i / n) * 34 + hash(i + 3) * 4;
      const q = (t - llegada);
      let x, y, a;
      if (q < 0) { x = xl + 4 + Math.sin(t + i) * 1.2; y = -22 + ((t * 5 + i * 3.7) % 50); a = 0.35; if (y > yl) y = yl - 1; }
      else { x = xl; y = yl; a = 0.85; }
      ctx.fillStyle = `rgba(190,205,240,${a * (q < 0 ? 0.6 : 0.5)})`;
      ctx.fillRect(x, y, 0.5, 0.5);
    }
    ctx.restore();
  }

  function lampara() {
    ctx.save();
    ctx.translate(66, 18);
    ctx.fillStyle = '#0f0c10'; ctx.strokeStyle = '#1d1520'; ctx.lineWidth = 0.4;
    ctx.beginPath(); ctx.ellipse(0, 0, 8, 1.8, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 1.1; ctx.strokeStyle = '#17121a';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-5, -26); ctx.lineTo(8, -40); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2, -43); ctx.lineTo(16, -37); ctx.lineTo(13, -31); ctx.lineTo(-1, -37); ctx.closePath(); ctx.fillStyle = '#120e14'; ctx.fill();
    ctx.strokeStyle = COL.rim; ctx.globalAlpha = 0.4; ctx.lineWidth = 0.35; ctx.beginPath(); ctx.moveTo(2, -43); ctx.lineTo(16, -37); ctx.stroke();
    ctx.restore();
  }

  function huecoPantalla(quad) {
    ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 1; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.moveTo(...quad[0]); ctx.lineTo(...quad[1]); ctx.lineTo(...quad[2]); ctx.lineTo(...quad[3]); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  // pantalla del portatil: devuelve las esquinas en unidades de mundo
  const QUAD_A = [[-8, -24], [38, -24.8], [38, 5.2], [-8, 6]];
  function portatil(S, t, pant, brillo) {
    const [a, b, c, d] = QUAD_A;
    const o = 1.2;
    // tapa
    ctx.beginPath();
    ctx.moveTo(a[0] - o, a[1] - o); ctx.lineTo(b[0] + o, b[1] - o); ctx.lineTo(c[0] + o, c[1] + o + 0.8); ctx.lineTo(d[0] - o, d[1] + o + 0.8); ctx.closePath();
    ctx.moveTo(a[0], a[1]); ctx.lineTo(d[0], d[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(b[0], b[1]); ctx.closePath();
    ctx.fillStyle = '#16141a'; ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(200,170,140,0.5)'; ctx.lineWidth = 0.25;
    ctx.beginPath(); ctx.moveTo(a[0] - o, a[1] - o); ctx.lineTo(b[0] + o, b[1] - o); ctx.lineTo(c[0] + o, c[1] + o + 0.8); ctx.lineTo(d[0] - o, d[1] + o + 0.8); ctx.closePath(); ctx.stroke();
    // bisagra y base con teclado en perspectiva
    const y0 = d[1] + o + 0.8;
    ctx.beginPath(); ctx.moveTo(d[0] - o, y0); ctx.lineTo(c[0] + o, y0); ctx.lineTo(c[0] + o + 8, y0 + 12); ctx.lineTo(d[0] - o - 8, y0 + 12); ctx.closePath();
    const bg = ctx.createLinearGradient(0, y0, 0, y0 + 12);
    bg.addColorStop(0, '#26232b'); bg.addColorStop(1, '#14121a');
    ctx.fillStyle = bg; ctx.fill(); ctx.strokeStyle = 'rgba(200,170,140,0.4)'; ctx.stroke();
    ctx.fillStyle = '#0d0b10';
    ctx.fillRect(d[0] - o, y0 - 0.2, c[0] - d[0] + 2 * o, 0.8);
    for (let r = 0; r < 4; r++) {
      const yy = y0 + 1.6 + r * 2.4;
      const k = (yy - y0) / 12;
      const xa = lerp(d[0] - o, d[0] - o - 8, k) + 1.5, xb = lerp(c[0] + o, c[0] + o + 8, k) - 1.5;
      ctx.strokeStyle = `rgba(120,150,210,${0.22 * brillo})`; ctx.lineWidth = 0.35;
      ctx.beginPath(); ctx.moveTo(xa, yy); ctx.lineTo(xb, yy); ctx.stroke();
    }
    // la luz de la pantalla sobre el escritorio
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const rg = ctx.createRadialGradient(15, y0 + 14, 0, 15, y0 + 14, 60);
    rg.addColorStop(0, `rgba(110,150,230,${0.28 * brillo * pant})`); rg.addColorStop(1, 'rgba(110,150,230,0)');
    ctx.fillStyle = rg; ctx.fillRect(-60, y0, 150, 80);
    ctx.restore();
  }

  function glQuad(S, t, quad, offX, fade, zoom, zc) {
    const p = quad.map(([x, y]) => proyectar(S, x + offX, y));
    const gs = env.glEscala;
    G.dibujar('torres', {
      uRes: [env.gw, env.gh], uT: S.ta,
      uA: [p[0][0] * gs, p[0][1] * gs], uB: [p[1][0] * gs, p[1][1] * gs], uC: [p[2][0] * gs, p[2][1] * gs], uD: [p[3][0] * gs, p[3][1] * gs],
      uGlow: 0.9 + 0.1 * Math.sin(S.ta * 1.7), uFade: fade, uZoom: zoom || 1, uZC: zc || [0.5, 0.5],
    });
  }

  // toma A: sobre el hombro, la pantalla delante
  function tomaA(S, t, tl) {
    // fondo
    const g = ctx.createLinearGradient(0, -60, 0, 30);
    g.addColorStop(0, '#0a0810'); g.addColorStop(1, '#171019');
    ctx.fillStyle = g; ctx.fillRect(-230, -70, 460, 110);
    ventana(S, S.ta, -84, -40, 34, 40);
    estanteria(58, -46, 26, 62, S.ta);
    maderaEscritorio(S, 18, 80);
    polvoEnRayas(S, t, tl);
    lampara();
    // luz fria sobre la pared
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const rg = ctx.createRadialGradient(15, -8, 4, 15, -8, 70);
    rg.addColorStop(0, 'rgba(90,120,200,0.20)'); rg.addColorStop(1, 'rgba(90,120,200,0)');
    ctx.fillStyle = rg; ctx.fillRect(-120, -70, 260, 120); ctx.restore();
    // el personaje, de espaldas, mirando a la pantalla
    const sway = Math.sin(S.ta * 0.45);
    ctx.save();
    ctx.translate(-27 + sway * 0.4, -3);
    ctx.scale(1.05, 1.05);
    const gira = Math.sin(S.ta * 0.28) * 0.6;
    personajeEspalda(ctx, S.ta, { luz: 0.9, giro: gira, mira: gira * 0.4, viento: 0.6 });
    ctx.restore();
    // cable desde la oreja (lado derecho) hacia el portatil, en y
    cableAudifono(ctx, -17.3, 0.3, -9, 24, S.ta, 7);
    // brazo que llega al teclado
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = COL.tinta; ctx.lineWidth = 9.6;
    ctx.beginPath(); ctx.moveTo(-8, 22); ctx.quadraticCurveTo(-1, 34, 6, 30); ctx.stroke();
    ctx.strokeStyle = COL.camiseta; ctx.lineWidth = 9;
    ctx.stroke();
    ctx.strokeStyle = COL.rim; ctx.globalAlpha = 0.5; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(-4, 17.8); ctx.quadraticCurveTo(3, 29, 9, 25.5); ctx.stroke();
    ctx.restore();
    huecoPantalla(QUAD_A);
    portatil(S, t, 1, 1);
  }

  // toma B: perfil iluminado por la pantalla
  const QUAD_B = [[36, -30], [72, -22], [72, 10], [36, 20]];
  function tomaB(S, t) {
    const g = ctx.createLinearGradient(0, -60, 0, 40);
    g.addColorStop(0, '#08060d'); g.addColorStop(1, '#120d16');
    ctx.fillStyle = g; ctx.fillRect(-230, -70, 460, 120);
    estanteria(-86, -40, 24, 56, S.ta);
    maderaEscritorio(S, 26, 80);
    // luz de la pantalla (oblicua): bano frio sobre la cara
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const rg = ctx.createRadialGradient(50, -6, 3, 40, -6, 80);
    rg.addColorStop(0, 'rgba(120,160,255,0.35)'); rg.addColorStop(1, 'rgba(120,160,255,0)');
    ctx.fillStyle = rg; ctx.fillRect(-120, -70, 260, 130); ctx.restore();
    huecoPantalla(QUAD_B);
    // marco de la pantalla (borde del portatil visto de lado)
    ctx.beginPath();
    ctx.moveTo(QUAD_B[0][0] - 1.6, QUAD_B[0][1] - 1.6); ctx.lineTo(QUAD_B[1][0] + 1.6, QUAD_B[1][1] - 1.6); ctx.lineTo(QUAD_B[2][0] + 1.6, QUAD_B[2][1] + 1.6); ctx.lineTo(QUAD_B[3][0] - 1.6, QUAD_B[3][1] + 1.6); ctx.closePath();
    ctx.moveTo(...QUAD_B[0]); ctx.lineTo(...QUAD_B[3]); ctx.lineTo(...QUAD_B[2]); ctx.lineTo(...QUAD_B[1]); ctx.closePath();
    ctx.fillStyle = '#16141a'; ctx.fill('evenodd');
    ctx.beginPath(); ctx.moveTo(34, 21.5); ctx.lineTo(74, 11.8); ctx.lineTo(86, 24); ctx.lineTo(28, 30); ctx.closePath();
    ctx.fillStyle = '#1c1922'; ctx.fill();
    // personaje en perfil mirando a la derecha
    const parp = (() => { const k = (S.ta % 4.3); return k < 0.16 ? Math.sin((k / 0.16) * Math.PI) : 0; })();
    ctx.save();
    ctx.translate(-8 + Math.sin(S.ta * 0.35) * 0.5, -4);
    ctx.scale(1.55, 1.55);
    personajePerfil(ctx, S.ta, { luz: 1, parpadeo: parp, giro: Math.sin(S.ta * 0.3) * 0.5, inclina: 0.04 + Math.sin(S.ta * 0.3) * 0.02, viento: 0.5 });
    ctx.restore();
    cableAudifono(ctx, -8 - 0.9 * 1.55, -4 + 3.5 * 1.55, 30, 30, S.ta, 14);
    return QUAD_B;
  }

  // toma C: manos y cable
  function tomaC(S, t) {
    const g = ctx.createLinearGradient(0, -60, 0, 50);
    g.addColorStop(0, '#0f0d17'); g.addColorStop(1, '#09070d');
    ctx.fillStyle = g; ctx.fillRect(-230, -70, 460, 140);
    maderaEscritorio(S, -40, 80);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const rg = ctx.createLinearGradient(0, -50, 0, 30);
    rg.addColorStop(0, 'rgba(120,160,255,0.28)'); rg.addColorStop(1, 'rgba(120,160,255,0)');
    ctx.fillStyle = rg; ctx.fillRect(-120, -50, 240, 90); ctx.restore();
    // cable blanco serpenteando por el escritorio
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(8,6,10,0.6)'; ctx.lineWidth = 1.0;
    const cab = () => { ctx.beginPath(); ctx.moveTo(-88, -20); ctx.bezierCurveTo(-60, -34, -52, 4, -34, -14); ctx.bezierCurveTo(-20, -26, -30, 18, -6, -6); ctx.stroke(); };
    cab(); ctx.strokeStyle = COL.cable; ctx.lineWidth = 0.6; cab();
    ctx.restore();
    ctx.save();
    ctx.translate(0, 8); ctx.scale(0.88, 0.88);
    manosTeclado(ctx, S.ta, { luz: 1, ritmo: 1 });
    ctx.restore();
    // reloj en la muneca izquierda: la aguja tiembla
    reloj(ctx, S.ta, -17 * 0.88 - 2, 8 + 17 * 0.88 + 2, 4.6);
  }

  // ------------------------------------------------------------ orquestacion del cuarto
  function camaraCuarto(t) {
    let x = 0, y = 0, z = 1, whip = 0;
    if (t < K.whipB) { const u = (t - K.cuarto) / (K.whipB - K.cuarto); z = lerp(1.0, 1.22, ease(clamp(u))); y = lerp(0, -1.5, u); }
    else if (t < K.whipB + 1.3) { const u = clamp((t - K.whipB) / 1.3); x = lerp(0, W_SHOT, ease(u)); z = 1.22 - 0.2 * Math.sin(u * Math.PI); whip = Math.sin(u * Math.PI); }
    else if (t < K.whipC) { const u = (t - K.whipB - 1.3) / (K.whipC - K.whipB - 1.3); x = W_SHOT; z = lerp(1.02, 1.18, u); y = lerp(-1, 0, u); }
    else if (t < K.whipC + 1.3) { const u = clamp((t - K.whipC) / 1.3); x = lerp(W_SHOT, 2 * W_SHOT, ease(u)); z = 1.18 - 0.2 * Math.sin(u * Math.PI); whip = Math.sin(u * Math.PI); }
    else if (t < K.whipA) { const u = (t - K.whipC - 1.3) / (K.whipA - K.whipC - 1.3); x = 2 * W_SHOT; z = lerp(1.05, 1.2, u); y = lerp(2, 0, u); }
    else if (t < K.push) { const u = clamp((t - K.whipA) / 1.4); x = lerp(2 * W_SHOT, 0, ease(u)); z = 1.2 - 0.15 * Math.sin(u * Math.PI); whip = Math.sin(u * Math.PI); }
    else {
      // empuje hacia la pantalla: el centro de la camara se desliza al centro de la pantalla
      const u = clamp((t - K.push) / (K.mente - K.push));
      const e = Math.pow(u, 1.5);
      z = Math.exp(lerp(Math.log(1.05), Math.log(15), e));
      const k = ease(clamp(u * 1.6));
      x = lerp(0, 15, k); y = lerp(0, -9.5, k);
    }
    const sw = (t > K.push ? 0.35 : 1);
    x += Math.sin(t * 0.7) * 0.25 * sw; y += Math.sin(t * 0.93) * 0.18 * sw;
    return { x, y, z, rot: Math.sin(t * 0.5) * 0.0025 * sw, whip };
  }

  function cuarto(S, t, ent, bloom) {
    const c = camaraCuarto(t);
    cam.x = c.x; cam.y = c.y; cam.z = c.z; cam.rot = c.rot;
    const whip = c.whip;
    // rastro de movimiento en los barridos
    const pasadas = whip > 0.05 ? 3 : 1;
    let quad = QUAD_A, offX = 0, glFade = 0;
    for (let p = 0; p < pasadas; p++) {
      ctx.save();
      const dx = pasadas > 1 ? (p - 1) * whip * 5 : 0;
      cam.x = c.x + dx;
      aplicarCamara(S);
      ctx.globalAlpha = (pasadas > 1 ? (p === 1 ? 0.7 : 0.35) : 1) * ent;
      // cada toma vive en su propio tramo horizontal
      for (let si = 0; si < 3; si++) {
        const ox = si * W_SHOT;
        if (Math.abs(ox - cam.x) > W_SHOT * 0.9 / cam.z + 20) continue;
        ctx.save(); ctx.translate(ox, 0);
        if (si === 0) tomaA(S, S.ta, t);
        else if (si === 1) tomaB(S, S.ta);
        else tomaC(S, S.ta);
        ctx.restore();
      }
      ctx.restore();
    }
    cam.x = c.x;
    // la pantalla de gl: la toma mas cercana a la camara
    const dA = Math.abs(cam.x - 0), dB = Math.abs(cam.x - W_SHOT);
    if (dB < dA && dB < W_SHOT * 0.7) { quad = QUAD_B; offX = W_SHOT; }
    const visible = (dA < W_SHOT * 0.7 || dB < W_SHOT * 0.7) && !(whip > 0.6);
    const push = t > K.push;
    const zoomGL = push ? 1 + Math.max(0, (cam.z - 3.2)) * 0.3 : 1;
    if (visible || push) {
      glQuad(S, t, quad, offX, sstep(0, 2, t - K.cuarto) * ent, zoomGL, [0.62, 0.2]);
      env.glOp(ent * (1 - whip * 0.9));
    } else env.glOp(0);
    return c;
  }

  // ------------------------------------------------------------ 2 la mente
  let mente = null;
  function iniciarMente() {
    const r = rng(2026);
    const N = reducir ? 450 : 1500;
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
    const semillas = [0, 1, 2, 3].map(() => Math.floor(r() * N));
    const hop = semillas.map((s) => {
      const dist = new Int16Array(N).fill(-1); const cola = [s]; dist[s] = 0;
      for (let q = 0; q < cola.length; q++) { const u = cola[q]; for (const v of ady[u]) if (dist[v] < 0) { dist[v] = dist[u] + 1; cola.push(v); } }
      return dist;
    });
    const seg = [];
    for (let a = 0; a < (reducir ? 8 : 24); a++) {
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
    // estrellas de fondo (para cuando las neuronas se vuelven estrellas)
    const NS = reducir ? 200 : 700;
    const stars = new Float32Array(NS * 3);
    for (let i = 0; i < NS; i++) { stars[i * 3] = (r() * 2 - 1) * 3; stars[i * 3 + 1] = (r() * 2 - 1) * 2; stars[i * 3 + 2] = r() * 4 - 1; }
    mente = { N, X, Y, Z, edges, hop, semillas, periodos: [4.4, 5.9, 7.3, 3.7], fases: [0.5, 2.1, 3.9, 1.3], seg, LX, LY, LZ, NL, stars, NS, sx: new Float32Array(N), sy: new Float32Array(N), sz: new Float32Array(N), br: new Float32Array(N), tau: new Float32Array(N) };
  }

  function menteEscena(S, t) {
    if (!mente) iniciarMente();
    const M = mente;
    const { w, h } = S;
    ctx.fillStyle = '#03040a'; ctx.fillRect(0, 0, w, h);
    const tl = t - K.mente;
    const dur = K.edades - K.mente;
    // la camara retrocede desde una neurona (la luz de la ventana) hasta ver todo el cerebro; al final lo atraviesa y son estrellas
    const rec = ease(clamp(tl / 11));
    const zoom = lerp(14, 1, Math.pow(rec, 0.8));
    const atrav = ease(clamp((tl - (dur - 9)) / 8.5));
    const ent = sstep(0, 1.2, tl);
    const cx = w / 2, cy = h / 2;
    const ang = 0.4 + tl * 0.16, pit = 0.22 + 0.07 * Math.sin(tl * 0.21);
    const ca = Math.cos(ang), sa = Math.sin(ang), cp = Math.cos(pit), sp = Math.sin(pit);
    const f = h * 1.5 * zoom;
    const camZ = atrav * 4.4;
    const proy = (x, y, z, out) => {
      const x1 = x * ca + z * sa, z1 = -x * sa + z * ca;
      const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
      const d = 3.0 + z2 - camZ;
      if (d < 0.12) { out[2] = 99; return; }
      out[0] = cx + (x1 * f) / d + (atrav > 0 ? 0 : 0); out[1] = cy + (y2 * f) / d; out[2] = z2; out[3] = d;
    };
    const pt = [0, 0, 0, 1];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // estrellas lejanas (fijas), mas visibles cuando se acerca el final
    ctx.fillStyle = '#9fb4ff';
    for (let i = 0; i < M.NS; i++) {
      const x = M.stars[i * 3], y = M.stars[i * 3 + 1], z = M.stars[i * 3 + 2];
      const d = 3.4 + z - camZ * 0.8;
      if (d < 0.2) continue;
      const px = cx + (x * f * 0.35) / d, py = cy + (y * f * 0.35) / d;
      ctx.globalAlpha = (0.25 + 0.6 * atrav) * ent;
      const s = 0.8 + atrav * 2.2 / d;
      ctx.fillRect(px, py, s, s);
    }
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
    const vis = (i) => M.sz[i] < 50;
    // conexiones
    ctx.strokeStyle = '#4a73d6'; ctx.globalAlpha = 0.2 * ent * (1 - atrav); ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (const [a, b] of M.edges) if (vis(a) && vis(b)) { ctx.moveTo(M.sx[a], M.sy[a]); ctx.lineTo(M.sx[b], M.sy[b]); }
    ctx.stroke();
    // disparos en cadena: conexiones calientes, pulsos y rayos que saltan entre vecinos
    ctx.strokeStyle = '#ffc060'; ctx.lineWidth = 1.3; ctx.globalAlpha = 0.9 * ent * (1 - atrav * 0.7);
    ctx.beginPath();
    const pulsos = [];
    for (const [a, b] of M.edges) {
      if (M.br[a] > 0.22 && vis(a) && vis(b)) {
        ctx.moveTo(M.sx[a], M.sy[a]);
        // el rayo se quiebra un poco
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
      ctx.fillRect(x - 1.6, y - 1.6, 3.2, 3.2);
    }
    // neuronas
    for (let i = 0; i < M.N; i++) {
      if (!vis(i)) continue;
      const d = 3.0 + M.sz[i] - camZ;
      const prof = clamp((M.sz[i] + 1) / 2);
      const b = M.br[i];
      const base = (1.7 + b * 3.4) * (h / 800 + 0.6) * (zoom > 1.5 ? Math.min(6, 0.8 + zoom * 0.4) : 1) * (atrav > 0 ? (1 + atrav * 2.4 / Math.max(d, 0.3)) : 1);
      ctx.globalAlpha = (0.5 + 0.5 * Math.min(1, b)) * ent * (0.6 + 0.4 * (1 - prof));
      ctx.fillStyle = atrav > 0.4 ? '#dfe8ff' : b > 0.35 ? '#ffe0a0' : prof < 0.5 ? '#ffb858' : '#7aa4ff';
      ctx.fillRect(M.sx[i] - base / 2, M.sy[i] - base / 2, base, base);
      if ((b > 0.45 || zoom > 3) && !reducir) {
        ctx.globalAlpha = Math.min(1, (b - 0.3) * 0.9 + (zoom > 3 ? 0.2 : 0)) * ent;
        const g = base * (zoom > 3 ? 3 : 6);
        ctx.drawImage(SPR_CALIDA, M.sx[i] - g, M.sy[i] - g, g * 2, g * 2);
      }
    }
    // dendritas que crecen
    ctx.strokeStyle = '#ffd08a'; ctx.lineWidth = 0.9; ctx.globalAlpha = 0.6 * ent * (1 - atrav); ctx.beginPath();
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
    // atractor de lorenz: el pensamiento
    if (atrav < 0.8) {
      const cab = Math.floor((tl * 160 + 600) % M.NL), largo = 760;
      ctx.lineWidth = 1.5;
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
      ctx.drawImage(SPR_LUZ, pt[0] - g, pt[1] - g, g * 2, g * 2);
    }
    ctx.restore();
    // destello azul al atravesar: las neuronas ya son estrellas
    const flash = sstep(dur - 2.2, dur - 0.3, tl);
    if (flash > 0) { ctx.fillStyle = `rgba(210,225,255,${flash * 0.9})`; ctx.fillRect(0, 0, w, h); }
    return { flash, cx, cy };
  }

  // ------------------------------------------------------------ 3 las edades
  const trazoRetrato = (w, h, extra = 1) => {
    const s = Math.min((h * 0.9) / 1500, (w * 0.98) / 1180) * extra;
    return { x: w / 2 - 600 * s, y: h * 0.5 - 760 * s, s };
  };

  function edades(S, t) {
    const { w, h } = S;
    const tl = t - K.edades;
    const dur = (K.ojo - K.edades) / 5;
    const k = Math.min(4, Math.floor(tl / dur));
    const ts = tl - dur * k, u = ts / dur;
    const P = R[EDADES[k]];
    env.glOp(0);
    ctx.fillStyle = '#080605'; ctx.fillRect(0, 0, w, h);
    if (!P) return;
    // la camara empuja despacio dentro de cada edad y se acomoda al cambiar
    const push = 1 + 0.05 * u + (k > 0 ? 0 : 0);
    const tr = trazoRetrato(w, h, push);
    tr.x += Math.sin(S.ta * 0.4) * 2; tr.y += Math.cos(S.ta * 0.33) * 1.5;
    const noche = k === 4 ? sstep(0.46, 0.92, u) : 0;
    // el papel se abre como un iris desde el punto donde acabo el destello
    const reveal = k === 0 ? ease(clamp(tl / 2.6)) : 1;
    ctx.save();
    if (k === 0 && reveal < 1) { ctx.beginPath(); ctx.arc(w / 2, h / 2, reveal * Math.hypot(w, h) * 0.55, 0, TAU); ctx.clip(); }
    ctx.globalAlpha = (1 - noche);
    ctx.drawImage(getPapel(w, h), 0, 0, w, h);
    ctx.globalAlpha = 1;
    const mph = k < 4 ? clamp((u - 0.78) / 0.22) : 0;
    const alfaAg = k === 0 ? sstep(0.4, 0.75, u) : sstep(0.0, 0.3, u);
    // respiracion del retrato
    const resp = 1 + Math.sin(S.ta * 1.2) * 0.0025;
    ctx.translate(w / 2, h / 2); ctx.scale(resp, resp); ctx.translate(-w / 2, -h / 2);
    if (mph > 0) {
      const B = R[EDADES[k + 1]];
      dibujarAguada(ctx, P, tr, (1 - sstep(0, 0.6, mph)) * alfaAg);
      dibujarMorph(ctx, P, B, mph, tr, 1);
    } else if (k === 4) {
      muerte(S, P, tr, ts, u, noche);
    } else if (k === 0 && u < 0.5) {
      const q = ease(clamp(u / 0.45)) * P.n;
      dibujarAguada(ctx, P, tr, alfaAg);
      dibujarTrazos(ctx, P, q, q - Math.floor(q), tr, 1);
    } else {
      const c = cacheCompleto(P, tr.s * env.dpr);
      dibujarAguada(ctx, P, tr, alfaAg);
      ctx.drawImage(c, tr.x, tr.y, P.W * tr.s, P.H * tr.s);
    }
    ctx.restore();
  }

  function muerte(S, P, tr, ts, u, noche) {
    const { w, h } = S;
    const lx = w * 0.76, ly = h * 0.2;
    const luz = sstep(0.5, 0.9, u);
    if (luz > 0) {
      const rr = Math.min(w, h) * (0.1 + 0.2 * luz);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = luz; ctx.drawImage(SPR_CALIDA, lx - rr * 2, ly - rr * 2, rr * 4, rr * 4);
      ctx.globalAlpha = luz * 0.95; ctx.drawImage(SPR_LUZ, lx - rr * 0.6, ly - rr * 0.6, rr * 1.2, rr * 1.2);
      ctx.restore();
    }
    dibujarAguada(ctx, P, tr, (1 - sstep(0.4, 0.62, u)) * sstep(0, 0.2, u));
    const paths = [new Path2D(), new Path2D(), new Path2D(), new Path2D(), new Path2D()];
    const alas = new Path2D(), cuerpos = new Path2D();
    const sh = Math.min(w, h) / 900;
    const seg = u * 10.8;
    for (let i = 0; i < P.n; i++) {
      const cyp = P.cen[i * 2 + 1];
      const rel = 4.4 + 2.2 * (cyp / 1500) + 1.1 * hash(i * 3 + 7);
      const vuelo = 2.6 + 2.0 * hash(i * 5 + 1);
      const a = P.off[i], b = P.off[i + 1];
      if (seg < rel) {
        const tr0 = seg > rel - 1.5 ? (1 - (rel - seg) / 1.5) : 0;
        const jx = tr0 * 2.2 * Math.sin(seg * 31 + i), jy = tr0 * 2.2 * Math.cos(seg * 27 + i * 2);
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
      const tam = (3.2 + 3.2 * hash(i + 41)) * sh, fl = Math.sin(seg * (20 + hash(i + 51) * 10) + ph) * 0.9;
      const dir = Math.atan2(ly - y, lx - x) + (hash(i + 61) - 0.5) * 1.2;
      for (const sg of [-1, 1]) {
        const an = dir + sg * (0.55 + Math.abs(fl) * 0.7);
        alas.moveTo(x, y);
        alas.lineTo(x + Math.cos(an) * tam * 1.6, y + Math.sin(an) * tam * 1.6);
        alas.lineTo(x + Math.cos(an + sg * 0.9) * tam, y + Math.sin(an + sg * 0.9) * tam);
        alas.closePath();
      }
      cuerpos.moveTo(x, y); cuerpos.lineTo(x - Math.cos(dir) * tam * 0.9, y - Math.sin(dir) * tam * 0.9);
    }
    ctx.save(); ctx.translate(tr.x, tr.y); ctx.scale(tr.s, tr.s); ctx.lineCap = 'round';
    for (let tp = 0; tp < 5; tp++) {
      ctx.lineWidth = ESTILO[tp].w / tr.s * Math.max(0.55, Math.min(tr.s * 1.2, 2.2));
      const c = [107, 58, 31].map((v, j) => Math.round(lerp(v, [240, 226, 190][j], noche)));
      ctx.strokeStyle = `rgb(${c[0]},${c[1]},${c[2]})`; ctx.globalAlpha = ESTILO[tp].a;
      ctx.stroke(paths[tp]);
    }
    ctx.restore();
    ctx.save(); ctx.globalAlpha = 0.85;
    const cm = [107, 58, 31].map((v, j) => Math.round(lerp(v, [244, 232, 196][j], 0.25 + 0.75 * noche)));
    ctx.fillStyle = `rgb(${cm[0]},${cm[1]},${cm[2]})`; ctx.fill(alas); ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1; ctx.stroke(cuerpos);
    ctx.restore();
  }

  // ------------------------------------------------------------ 4 el ojo (la luz de las polillas se vuelve el brillo del ojo)
  function ojo(S, t) {
    const { w, h } = S;
    const tl = t - K.ojo, dur = K.agujero - K.ojo;
    const base = Math.min(w, h);
    const gs = env.glEscala;
    // fase 1: la luz crece y se vuelve el ojo; fase 2: empuje hacia la pupila; fase 3: la pupila llena el cuadro
    const aparece = sstep(1.2, 4.2, tl);
    const empuje = Math.pow(clamp((tl - 5) / (dur - 5)), 2.4);
    const escala = Math.exp(lerp(Math.log(0.2), Math.log(7.5), empuje));
    const mood = 0.5 - 0.5 * Math.cos(Math.max(0, tl - 3) * TAU / 8.5);
    const parp = (() => { const q = (S.ta % 5.2); return q < 0.2 ? Math.sin((q / 0.2) * Math.PI) : 0; })();
    // resplandor de la luz de las polillas que se convierte en el brillo
    const lx = w * 0.76, ly = h * 0.2;
    const lk = 1 - sstep(0.5, 3.5, tl);
    env.glOp(aparece);
    if (aparece > 0) G.dibujar('ojo', { uRes: [env.gw, env.gh], uT: S.ta, uC: [w * 0.5 * gs, h * 0.5 * gs], uR: base * escala * gs * (1 + 0.08 * Math.sin(S.ta * 0.6)), uMood: mood, uFade: 1, uBlink: parp });
    ctx.fillStyle = '#05040a'; ctx.globalAlpha = 1 - aparece; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
    if (lk > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const rr = base * 0.5 * (0.5 + lk);
      ctx.globalAlpha = lk; ctx.drawImage(SPR_CALIDA, lx - rr * 2, ly - rr * 2, rr * 4, rr * 4);
      ctx.drawImage(SPR_LUZ, lx - rr * 0.5, ly - rr * 0.5, rr, rr);
      ctx.restore();
    }
    return { empuje };
  }

  // ------------------------------------------------------------ 5 agujero negro
  function anillo(S, x, y, r, rot, ta, alfa) {
    // nave anular que gira en silencio: diseno propio (un aro con aletas y luces de posicion)
    ctx.save();
    ctx.translate(x, y); ctx.rotate(-0.25);
    ctx.globalAlpha = alfa;
    const inc = 0.38;
    for (let i = 0; i < 28; i++) {
      const a0 = (i / 28) * TAU + rot, a1 = ((i + 0.85) / 28) * TAU + rot;
      const lit = 0.5 + 0.5 * Math.cos(a0 - 0.8);
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * inc, 0, a0, a1);
      ctx.ellipse(0, 0, r * 0.84, r * inc * 0.84, 0, a1, a0, true);
      ctx.closePath();
      ctx.fillStyle = `rgb(${Math.round(40 + 190 * lit)},${Math.round(36 + 150 * lit)},${Math.round(34 + 100 * lit)})`;
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(10,8,8,0.8)'; ctx.lineWidth = Math.max(0.6, r * 0.012);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + rot; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.84, Math.sin(a) * r * 0.84 * inc); ctx.lineTo(0, 0); ctx.stroke(); }
    ctx.fillStyle = '#1b1613'; ctx.beginPath(); ctx.ellipse(0, 0, r * 0.12, r * 0.12 * inc * 1.4, 0, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + rot * 1.0;
      const on = Math.sin(ta * 2 + i) > 0.6 ? 1 : 0.25;
      ctx.fillStyle = `rgba(255,120,80,${0.7 * on})`;
      ctx.beginPath(); ctx.arc(Math.cos(a) * r, Math.sin(a) * r * inc, Math.max(1, r * 0.018), 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function agujero(S, t) {
    const { w, h } = S;
    const tl = t - K.agujero, dur = K.planeta - K.agujero;
    const ign = sstep(0.2, 4.5, tl);
    const fade = sstep(0, 1.4, tl) * (1 - sstep(dur - 1.3, dur, tl));
    const yaw = lerp(-0.55, 0.35, ease(clamp(tl / dur))) + Math.sin(S.ta * 0.2) * 0.02;
    const pit = lerp(0.2, 0.12, clamp(tl / dur)) + 0.01 * Math.sin(S.ta * 0.3);
    const dist = Math.exp(lerp(Math.log(34), Math.log(15), ease(clamp(tl / dur))));
    G.dibujar('agujero', { uRes: [env.gw, env.gh], uT: S.ta, uCam: [yaw, pit], uDist: dist, uIgn: ign, uFade: fade });
    env.glOp(1);
    // la nave anular cruza en silencio, muy lejos
    const k = clamp((tl - 3) / (dur - 4));
    const x = lerp(w * 1.08, w * 0.12, k), y = h * (0.22 + 0.07 * Math.sin(k * 2.4));
    anillo(S, x, y, Math.min(w, h) * 0.05, S.ta * 0.5, S.ta, 0.9 * sstep(0, 0.1, k) * (1 - sstep(0.9, 1, k)));
  }

  // ------------------------------------------------------------ 6 el planeta lejano al amanecer
  function criaturasLuz(S, n, cx, cy, rx, ry, morph, alfa) {
    // luciernagas que, con la luz del amanecer, se vuelven polillas
    const sh = Math.min(S.w, S.h) / 900;
    const alas = new Path2D();
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const ph = hash(i * 7 + 2) * TAU;
      const a = S.ta * (0.25 + hash(i + 14) * 0.45) + ph;
      const x = cx + Math.cos(a) * rx * (0.3 + hash(i + 12)) + Math.sin(S.ta * 0.9 + ph) * 10 * sh;
      const y = cy + Math.sin(a * 1.3) * ry * (0.3 + hash(i + 13));
      const b = Math.pow(Math.max(0, Math.sin(S.ta / (2.5 + hash(i) * 2) * Math.PI + ph)), 4);
      ctx.globalAlpha = (1 - morph) * (0.2 + 0.8 * b) * alfa;
      const r = sh * 10;
      ctx.drawImage(SPR_LUZ, x - r, y - r, r * 2, r * 2);
      const tam = (3.4 + 2.6 * hash(i + 15)) * sh * morph;
      if (tam > 0.3) {
        const fl = Math.sin(S.ta * (18 + hash(i + 16) * 8) + ph) * 0.9, dir = a + Math.PI / 2;
        for (const sg of [-1, 1]) {
          const an = dir + sg * (0.55 + Math.abs(fl) * 0.7);
          alas.moveTo(x, y); alas.lineTo(x + Math.cos(an) * tam * 1.6, y + Math.sin(an) * tam * 1.6); alas.lineTo(x + Math.cos(an + sg * 0.9) * tam, y + Math.sin(an + sg * 0.9) * tam); alas.closePath();
        }
      }
    }
    ctx.globalAlpha = 0.8 * alfa * morph; ctx.fillStyle = '#ecd8aa'; ctx.fill(alas);
    ctx.restore();
  }

  function polvoViento(S, n, alfa, tl) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = '#ffc890'; ctx.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      const sp = 40 + 120 * hash(i + 3);
      const x = ((hash(i * 3 + 1) * S.w * 1.3 - S.ta * sp) % (S.w * 1.3) + S.w * 1.3) % (S.w * 1.3) - S.w * 0.15;
      const y = S.h * (0.5 + 0.48 * hash(i * 3 + 2)) + Math.sin(S.ta * 0.7 + i) * 6;
      ctx.globalAlpha = alfa * (0.08 + 0.22 * hash(i + 9));
      const l = 6 + sp * 0.25;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + l, y - l * 0.08); ctx.stroke();
    }
    ctx.restore();
  }

  function planeta(S, t) {
    const { w, h, u } = S;
    const tl = t - K.planeta, dur = K.regreso - K.planeta;
    const rise = 0.9 * ease(sstep(0, dur * 0.85, tl));
    const fade = sstep(0, 1.6, tl);
    const zoom = 1 + 0.35 * ease(clamp(tl / dur));
    G.dibujar('horizonte', { uRes: [env.gw, env.gh], uT: S.ta, uRise: rise, uSol: 1, uFade: fade, uZ: zoom, uPan: -0.05 * ease(clamp(tl / dur)), uDust: 0.5 + 0.5 * Math.sin(tl * 0.18) });
    env.glOp(1);
    // figura de espaldas, pequena, con luz calida de borde; la camara se acerca con paralaje
    const z = lerp(1, 1.5, ease(clamp(tl / dur)));
    const fx = w * (0.3 - 0.02 * clamp(tl / dur)), fy = h * 0.9;
    ctx.save();
    ctx.translate(fx, fy);
    const sc = u * 0.21 * z;
    ctx.scale(sc, sc);
    // sombra larga hacia el espectador
    const sg = ctx.createLinearGradient(0, 100, -20, 330);
    sg.addColorStop(0, 'rgba(3,2,3,0.7)'); sg.addColorStop(1, 'rgba(3,2,3,0)');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.moveTo(-14, 104); ctx.lineTo(14, 104); ctx.lineTo(-10, 330); ctx.lineTo(-60, 330); ctx.closePath(); ctx.fill();
    ctx.translate(0, -100);
    // el viento lo despeina; el cuerpo se asienta mirando al amanecer, con la cabeza ligeramente alzada
    personajeEspalda(ctx, S.ta, { luz: 0.85, rim: 'rgba(255,170,100,0.95)', completo: true, viento: 1.6, mira: -0.5 + 0.1 * Math.sin(S.ta * 0.3), giro: 0 });
    ctx.restore();
    // fireflies -> polillas con el amanecer
    criaturasLuz(S, reducir ? 8 : 22, fx, fy - u * 12, u * 36, u * 14, sstep(dur * 0.25, dur * 0.55, tl), sstep(1, 4, tl));
    polvoViento(S, reducir ? 25 : 90, fade, tl);
    // nave anular a lo lejos, girando contra las estrellas
    anillo(S, w * 0.72, h * 0.16 + Math.sin(S.ta * 0.1) * 3, Math.min(w, h) * 0.028, S.ta * 0.35, S.ta, 0.8 * (1 - sstep(0.4, 0.8, tl / dur)) * sstep(2, 5, tl));
  }

  // ------------------------------------------------------------ 7 regreso: el maiz de la tierra, las luciernagas, una sola luz
  function regreso(S, t) {
    const { w, h, u } = S;
    const tl = t - K.regreso, dur = FIN - K.regreso;
    // el cielo del planeta se apaga (el sol se esconde) y sobre el queda el campo de maiz de casa
    const sol = 1 - ease(clamp(tl / 3.5));
    const fadeGL = 1 - sstep(2.5, 5.5, tl);
    if (fadeGL > 0.01) {
      G.dibujar('horizonte', { uRes: [env.gw, env.gh], uT: S.ta, uRise: lerp(0.9, 0.05, ease(clamp(tl / 5))), uSol: sol, uFade: fadeGL, uZ: 1.35, uPan: -0.05, uDust: 0.2 });
      env.glOp(1);
    } else env.glOp(0);
    ctx.fillStyle = `rgba(7,5,10,${1 - fadeGL})`; ctx.fillRect(0, 0, w, h);
    const campo = sstep(2.5, 6, tl);
    // cielo nocturno detras del maiz
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, `rgba(6,8,18,${campo})`); g.addColorStop(0.7, `rgba(20,16,26,${campo})`); g.addColorStop(1, `rgba(4,3,5,${campo})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.save(); ctx.globalAlpha = campo;
    const n = reducir ? 70 : 220;
    for (let capa = 0; capa < 3; capa++) {
      const yb = h * (0.78 + capa * 0.09), alt = h * (0.16 + capa * 0.1);
      ctx.strokeStyle = ['#0b0d14', '#07080d', '#030305'][capa]; ctx.lineWidth = u * (0.45 + capa * 0.35);
      for (let i = 0; i < n; i++) {
        const px = (i / n) * w * 1.1 - w * 0.05 + (hash(i + capa * 91) - 0.5) * u * 2;
        const hh = alt * (0.7 + hash(i + capa * 7) * 0.5);
        const sw = Math.sin(S.ta * (1.0 + capa * 0.2) + i * 0.4 + Math.sin(S.ta * 0.23) * 3) * u * (1.6 + capa * 0.8) * (0.6 + 0.4 * Math.sin(S.ta * 0.3 + i));
        ctx.beginPath(); ctx.moveTo(px, h); ctx.lineTo(px, yb); ctx.quadraticCurveTo(px + sw * 0.4, yb - hh * 0.6, px + sw, yb - hh); ctx.stroke();
        if (hash(i + 50) > 0.5) { ctx.beginPath(); ctx.moveTo(px + sw * 0.5, yb - hh * 0.55); ctx.lineTo(px + sw * 0.5 + u * 1.6, yb - hh * 0.68); ctx.stroke(); }
      }
    }
    ctx.restore();
    // luciernagas: se van apagando una a una hasta quedar una, la del morse
    const nf = reducir ? 8 : 26;
    for (let i = 0; i < nf; i++) {
      const vive = 1 - sstep(dur * 0.35 + hash(i) * dur * 0.45, dur * 0.35 + hash(i) * dur * 0.45 + 2, tl);
      if (vive <= 0) continue;
      const x = w * (0.08 + 0.84 * hash(i * 3 + 1)) + Math.sin(S.ta * 0.4 + i) * u * 3;
      const y = h * (0.45 + 0.4 * hash(i * 3 + 2)) + Math.cos(S.ta * 0.5 + i * 2) * u * 2;
      luciernaga(x, y, u * 1.6, vive * campo, S.ta + i * 1.3, hash(i));
    }
    const mx = w * 0.5, my = h * 0.6;
    morse(S, mx, my, campo * (1 - sstep(dur - 2.5, dur - 0.5, tl)), u * 2.2);
    return { mx, my };
  }

  // ------------------------------------------------------------ guion
  function dibujar(S) {
    const t = S.t;
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    let info = {};
    if (t < K.cuarto + 0.01) {
      env.glOp(0);
      const [fx, fy, fr] = luciernagaSola(S, t);
      info.firefly = [fx, fy];
    } else if (t < K.mente) {
      // fondo oscuro; el cuarto aparece desde el resplandor de la luciernaga
      ctx.fillStyle = '#07050a'; ctx.fillRect(0, 0, S.w, S.h);
      const ent = sstep(K.cuarto - 0.2, K.cuarto + 2.2, t);
      cuarto(S, t, ent);
      if (t < K.cuarto + 3) {
        const b = 1 - sstep(K.cuarto, K.cuarto + 3, t);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const r = Math.min(S.w, S.h) * (0.2 + 1.2 * (1 - b));
        ctx.globalAlpha = b; ctx.drawImage(SPR_LUZ, S.w / 2 - r, S.h * 0.46 - r, r * 2, r * 2); ctx.restore();
      }
    } else if (t < K.edades) {
      env.glOp(0);
      // el ultimo instante del empuje: la luz de la ventana de la torre sigue en gl hasta que las neuronas la toman
      const tl = t - K.mente;
      menteEscena(S, t);
      if (tl < 1.6) {
        // continuidad con la pantalla: la luz de la ultima ventana se disuelve en la primera neurona
        env.glOp(1 - sstep(0, 1.6, tl));
        glQuad(S, K.mente, QUAD_A, 0, 1 - sstep(0, 1.6, tl), 1 + (15 - 3.2) * 0.3, [0.62, 0.2]);
      }
    } else if (t < K.ojo) {
      edades(S, t);
    } else if (t < K.agujero) {
      ojo(S, t);
    } else if (t < K.planeta) {
      agujero(S, t);
    } else if (t < K.regreso) {
      ctx.clearRect(0, 0, S.w, S.h);
      planeta(S, t);
    } else {
      ctx.clearRect(0, 0, S.w, S.h);
      info = regreso(S, t);
    }
    return info;
  }

  return { dibujar, K, FIN };
}
