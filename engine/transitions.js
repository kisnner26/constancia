// transitions.js: fundidos, apertura en iris, destellos de luz y utilidades de match cut.
//   veil(ctx, w, h, a, color)                  -> velo de color con opacidad a
//   irisBegin(ctx, w, h, k, cx, cy) / irisEnd(ctx) -> revela lo que se dibuje entre medias con un circulo que crece (k 0..1)
//   bloom(ctx, sprite, x, y, r, a)             -> resplandor aditivo con un sprite de particles.sprite()
//   dip(t, a, b)                               -> 0..1..0 (sube hasta el centro del intervalo y baja)
//   matchCut(k)                                -> [alfaSale, alfaEntra] con curva suave
import { clamp, sstep, TAU } from './util.js';

export function veil(ctx, w, h, a, color = '#070504') { if (a <= 0) return; ctx.save(); ctx.globalAlpha = Math.min(1, a); ctx.fillStyle = color; ctx.fillRect(0, 0, w, h); ctx.restore(); }
export function irisBegin(ctx, w, h, k, cx = w / 2, cy = h / 2) {
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, k * Math.hypot(w, h) * 0.55, 0, TAU); ctx.clip();
}
export function irisEnd(ctx) { ctx.restore(); }
export function bloom(ctx, sprite, x, y, r, a = 1) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2); ctx.restore();
}
export function dip(t, a, b) { const m = (a + b) / 2; return t < m ? sstep(a, m, t) : 1 - sstep(m, b, t); }
export function matchCut(k) { const u = clamp(k); const s = u * u * (3 - 2 * u); return [1 - s, s]; }
