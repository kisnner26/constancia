// camera.js: camara 2d con dolly, paneo, push-in (zoom), giro, parallax por capas y profundidad de campo.
//   const cam = new Camera();            cam.set({ x, y, z, rot })
//   cam.track(frames, t)                 -> aplica keyframes (ver timeline.keyframes)
//   cam.shake(t, amp)                    -> temblor suave de camara de mano
//   cam.apply(ctx, view)                 -> ctx.translate/scale: el mundo se dibuja en unidades de 1% de altura
//   cam.project(view, x, y)              -> coordenadas de pantalla de un punto del mundo
//   cam.layer(ctx, view, { depth, blur }, fn) -> dibuja fn() en una capa con parallax (depth 0 = fondo lejano, 1 = plano de accion)
//                                              y desenfoque opcional (profundidad de campo)
import { keyframes } from './timeline.js';

export class Camera {
  constructor() { this.x = 0; this.y = 0; this.z = 1; this.rot = 0; }
  set(o) { Object.assign(this, o); return this; }
  track(frames, t) { return this.set(keyframes(frames, t)); }
  shake(t, amp = 0.3) { this.x += Math.sin(t * 0.7) * amp * 0.8; this.y += Math.sin(t * 0.93) * amp * 0.6; this.rot += Math.sin(t * 0.5) * amp * 0.008; }
  apply(ctx, view) {
    ctx.translate(view.w / 2, view.h / 2);
    ctx.rotate(this.rot);
    ctx.scale(view.u * this.z, view.u * this.z);
    ctx.translate(-this.x, -this.y);
  }
  project(view, x, y) {
    const c = Math.cos(this.rot), s = Math.sin(this.rot);
    const dx = (x - this.x) * view.u * this.z, dy = (y - this.y) * view.u * this.z;
    return [view.w / 2 + dx * c - dy * s, view.h / 2 + dx * s + dy * c];
  }
  layer(ctx, view, { depth = 1, blur = 0 } = {}, fn) {
    ctx.save();
    const px = this.x * depth, py = this.y * depth, z = 1 + (this.z - 1) * depth;
    ctx.translate(view.w / 2, view.h / 2); ctx.rotate(this.rot * depth); ctx.scale(view.u * z, view.u * z); ctx.translate(-px, -py);
    if (blur > 0.05) ctx.filter = `blur(${blur.toFixed(1)}px)`;
    fn();
    ctx.restore();
  }
}
