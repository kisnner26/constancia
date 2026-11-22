// player.js: reproductor de escenas. une canvas 2d, un canvas webgl2 opcional debajo, audio, camara y timeline.
//
//   const player = createPlayer({ scene, canvas, glCanvas, soundButton });
//   scene = {
//     name, loop: true,
//     shots: [{ id, dur, camera: [keyframes], draw(S, env) }],     // S = { t, local, p, shot, ta, w, h, u, dt, esperando }
//     setup(env),            // opcional, sincrono: crear objetos (redes, rigs, sprites)
//     load(env),             // opcional, asincrono: cargar assets en env.assets
//     audio(audioEngine),    // opcional: definir capas, planificadores y automatizacion
//     passes(gl),            // opcional: registrar pases webgl2 propios (ademas de la biblioteca)
//   }
//   env = { ctx, gl, camera, audio, assets, reducir, glOp(v), view }
// el primer clic o tecla arranca todo (y desbloquea el audio). hasta entonces S.esperando = true y el tiempo no avanza.
import { clamp } from './util.js';
import { createGL } from './gl.js';
import { registerLibrary } from './shaders.js';
import { Timeline } from './timeline.js';
import { Camera } from './camera.js';
import { createAudio } from './audio.js';

export function createPlayer({ scene, canvas, glCanvas, soundButton = null, fallback = null }) {
  const reducir = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ctx = canvas.getContext('2d');
  let gl = null;
  if (glCanvas) {
    try { gl = createGL(glCanvas); } catch (e) { gl = null; }
    if (gl) { registerLibrary(gl); scene.passes?.(gl); }
    else if (fallback) fallback();   // sin webgl2: icono vectorial minimo, la escena sigue con lo que no necesita shaders
  }
  const audio = createAudio();
  const camera = new Camera();
  const env = { ctx, gl: gl || { draw() {}, register() {}, resize() {} }, hasGL: !!gl, camera, audio, assets: {}, reducir, view: null,
    glOp(v) { if (!glCanvas) return; v = Math.round(clamp(v) * 100) / 100; if (v !== env._op) { glCanvas.style.opacity = v; env._op = v; } } };
  const timeline = new Timeline(scene.shots, { loop: scene.loop !== false });
  scene.setup?.(env);
  scene.audio?.(audio);
  scene.load?.(env);

  let t = 0, jugando = false, empezado = false, ultimo = performance.now(), calidad = 1, acum = 0, n = 0;
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.has('t')) { t = clamp(parseFloat(hash.get('t')) || 0, 0, timeline.total); empezado = true; jugando = hash.get('p') !== '1'; soundButton && (soundButton.hidden = false); }

  const view = { w: 0, h: 0, u: 1, dpr: 1, glScale: 1, gw: 2, gh: 2 };
  env.view = view;
  function medir() {
    const w = innerWidth, h = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);   // windows suele dar 1.25 o 1.5: se acota y se ajusta por fps
    view.w = w; view.h = h; view.u = Math.min(h / 100, w / 84);
    view.dpr = Math.max(1, dpr * Math.max(calidad, 0.6));
    canvas.width = Math.round(w * view.dpr); canvas.height = Math.round(h * view.dpr);
    view.glScale = Math.min(dpr, 1.25) * (w * h > 1.4e6 ? 0.62 : 0.8) * calidad;
    view.gw = Math.max(2, Math.round(w * view.glScale)); view.gh = Math.max(2, Math.round(h * view.glScale));
    if (gl) gl.resize(view.gw, view.gh);
  }
  addEventListener('resize', medir);
  medir();

  function empezar() {
    if (empezado) return;
    empezado = true; jugando = true;
    document.body.classList.add('activo');
    audio.start();
    if (soundButton) { soundButton.hidden = false; soundButton.setAttribute('aria-pressed', 'true'); }
  }
  addEventListener('pointerdown', (e) => { if (!empezado && !(soundButton && soundButton.contains(e.target))) empezar(); });
  addEventListener('keydown', (e) => {
    if (!empezado) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); empezar(); } return; }
    if (e.key === 'ArrowRight') t = clamp(t + 10, 0, timeline.total - 0.01);
    else if (e.key === 'ArrowLeft') t = clamp(t - 10, 0, timeline.total);
    else if (e.key === ' ') { e.preventDefault(); jugando = !jugando; }
    else if (e.key === 'f' && !e.ctrlKey && !e.metaKey) { document.fullscreenElement ? document.exitFullscreen?.() : document.documentElement.requestFullscreen?.(); }
  });
  if (soundButton) soundButton.addEventListener('click', () => soundButton.setAttribute('aria-pressed', audio.toggle() ? 'true' : 'false'));

  function cuadro(ahora) {
    const dt = Math.min(0.1, (ahora - ultimo) / 1000); ultimo = ahora;
    if (jugando) {
      t += dt;
      if (t >= timeline.total) { if (timeline.loop) t -= timeline.total; else t = timeline.total - 1e-3; }
      acum += dt; n++;
      if (n >= 90) { if (acum / n > 0.024 && calidad > 0.5) { calidad *= 0.85; medir(); } acum = 0; n = 0; }
    }
    const at = timeline.at(empezado ? t : 0);
    const S = { t: at.t, local: at.local, p: at.p, shot: at.shot, index: at.index, ta: empezado ? t : performance.now() / 1000, w: view.w, h: view.h, u: view.u, dt, esperando: !empezado, view };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
    env.glOp(0);
    if (gl) gl.resize(view.gw, view.gh);
    camera.set({ x: 0, y: 0, z: 1, rot: 0 });
    if (at.shot.camera) camera.track(at.shot.camera, at.local);
    at.shot.draw(S, env);
    audio.update(at.t);
    requestAnimationFrame(cuadro);
  }
  requestAnimationFrame(cuadro);
  return { env, timeline, audio, camera, seek(x) { t = clamp(x, 0, timeline.total); }, get t() { return t; } };
}
