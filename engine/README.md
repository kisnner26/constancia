# fanal: api del motor

motor web para animaciones largas hechas con canvas 2d y webgl2: una sola toma continua con cámara, transiciones por forma o luz, dibujo a trazos, personajes por partes y sonido sintetizado. módulos es nativos, sin build, sin dependencias. la animación `constancia` (`scenes/constancia.js`) está hecha solo con esta api.

## cómo crear una animación nueva

1. crea `scenes/mi-escena.js` que exporte por defecto una escena (ver el ejemplo).
2. ábrela con `teaser.html?escena=mi-escena` (o copia `ejemplo.html`).
3. cada toma (`shot`) tiene `dur` en segundos, una `camera` opcional con keyframes y una función `draw(S, env)` que dibuja el instante `S.local`. todo se calcula en función del tiempo: se puede saltar a cualquier punto (flechas) y siempre se ve igual.
4. el primer clic arranca (el navegador exige un gesto para el audio). la escena hace bucle.

## ejemplo mínimo

```js
// scenes/mi-escena.js
import { fireflies } from '../engine/particles.js';
export default {
  name: 'mi-escena',
  shots: [{
    id: 'luces', dur: 10, camera: [{ t: 0, z: 1 }, { t: 10, z: 1.3 }],
    draw(S, env) {
      env.ctx.fillStyle = '#0a0705'; env.ctx.fillRect(0, 0, S.w, S.h);
      fireflies(env.ctx, S.view, S.ta, { n: 20 });
    },
  }],
  audio(a) {
    a.layer('tono', (ac, h) => { const g = h.gain(0.4); h.osc('sine', 110).connect(g); return g; });
    a.automate((t) => ({ tono: 1, master: 1 }));
  },
};
```

## api por módulo

- `player.js` — `createPlayer({ scene, canvas, glCanvas, soundButton, fallback })`. la escena define `shots`, y opcionalmente `setup(env)`, `load(env)` (async), `audio(audio)` y `passes(gl)`. `S = { t, local, p, shot, ta, w, h, u, dt, esperando, view }`; `u` es 1% de la altura. `env = { ctx, gl, camera, audio, assets, reducir, glOp(v), view }`. teclas: flechas ±10 s, espacio pausa, `f` pantalla completa.
- `timeline.js` — `Timeline(shots, { loop })` con `.at(t)`; `keyframes(frames, t)` interpola propiedades numéricas con easing (`linear`, `ease`, `easeIn`, `easeOut`, `smooth`, `sine`).
- `camera.js` — `Camera`: `set`, `track(frames, t)`, `shake`, `apply(ctx, view)`, `project`, `layer(ctx, view, { depth, blur }, fn)` para parallax y profundidad de campo.
- `transitions.js` — `veil`, `irisBegin/irisEnd` (apertura en iris), `bloom` (cruce de luz), `dip`, `matchCut`. los match cuts se componen alineando posición y forma entre dos tomas (ver `shotMente`, donde la luciérnaga es la primera neurona).
- `particles.js` — `firefly`, `fireflies`, `morse`, `moths`, `dust` y `NeuralNet` (neuronas con disparos en cadena, dendritas y atractor de lorenz). todo determinista.
- `strokes.js` — `loadStrokes`, `drawStrokes`, `drawMorph`, `drawWash`, `cachedStrokes`, `releaseToMoths`: dibujos como listas de trazos json (los genera `tools/retratos.py`).
- `rig.js` — personaje por partes (`drawBackRig`): respiración, giro de cabeza, mechones con inercia y viento, luz de borde. la paleta está en `COL`.
- `gl.js` + `shaders.js` — `createGL(canvas)` con `register(nombre, frag)`, `draw(nombre, uniforms)`. pases incluidos: `eye` (iris con julia y galaxia), `horizon` (cielo, nubes heladas, océano con olas y lente gravitacional), `blackhole` (agujero negro con disco lensado, geodésicas de schwarzschild) y `julia`. añade los tuyos en `scene.passes(gl)`.
- `audio.js` — `createAudio()`: `layer(nombre, build, { send, max })`, `scheduler(fn)` para transitorios, `automate(t => ({ capa: 0..1, master }))` atado al timeline. compresor y reverb de impulso generado.

## multiplataforma

el motor es web puro (módulos es, canvas 2d, webgl2, webaudio), así que funciona igual en chrome, edge y safari, en macos y en windows. reglas que cumple el código: shaders con `precision highp float` y bucles de límite constante (windows usa angle/direct3d); si no hay webgl2 se muestra un icono vectorial y la escena sigue con lo que no necesita shaders; el `devicePixelRatio` se acota a 2 y la resolución baja sola si los fps caen; no hay fuentes ni recursos externos; rutas relativas con `/` y nombres en minúsculas; solo apis de audio estándar.

### en el navegador

```
python3 -m http.server 8791      # windows: py -3 -m http.server 8791
```

abre http://localhost:8791 (o `ejemplo.html`). los módulos es no cargan desde `file://`: usa un servidor local o github pages.

### reproductor de escritorio (electron)

carga `teaser.html?escena=<nombre>`; pantalla completa con f11 o ctrl/cmd+f, esc sale de pantalla completa (y, ya en ventana, cierra).

```
npm install
npm start                          # prueba local (si npm bloquea el postinstall de electron: node node_modules/electron/install.js) (escena por defecto: constancia)
npm start -- --escena=ejemplo
npm run build:mac                  # en macos: dist/*.dmg y *.zip (arm64 y x64), sin firmar
npm run build:win                  # zip portable x64 (se puede generar desde macos, sin wine)
```

- macos: `npm run build:mac` en un mac. como no está firmado, la primera vez abre con clic derecho > abrir.
- windows: `npm install` y `npm run build:win` también funcionan en una pc con windows (powershell). el zip se descomprime y se ejecuta `constancia.exe`; sin firmar, smartscreen pide confirmación.
