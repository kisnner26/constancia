# motor de animación

motor de animación 2d y webgl2 para el navegador, en módulos es nativos y sin build. funciona igual en windows y macos (chrome, edge, safari) y se puede empaquetar como reproductor de escritorio.

sirve para hacer animaciones largas en una sola toma: cámara con dolly, paneo y parallax, transiciones por forma o por luz, dibujo a trazos, personajes por partes y sonido sintetizado.

## módulos

- `engine/timeline.js` secuenciador de tomas, easing y keyframes
- `engine/camera.js` cámara 2d, parallax y profundidad de campo
- `engine/transitions.js` fundidos, iris y cruces de luz
- `engine/particles.js` luciérnagas, polillas, polvo y redes de neuronas
- `engine/strokes.js` dibujos a trazos con aguada y morph
- `engine/rig.js` personaje por partes con respiración y pelo con física
- `engine/gl.js` y `engine/shaders.js` pases webgl2 registrables: agujero negro, julia, cielo y océano
- `engine/audio.js` grafo webaudio por capas con compresor, reverb y automatización
- `engine/player.js` reproductor que une todo

## ejemplo mínimo

```js
// scenes/mi-escena.js
import { fireflies } from '../engine/particles.js';

export default {
  name: 'mi-escena',
  shots: [{
    id: 'luces', dur: 10, camera: [{ t: 0, z: 1 }, { t: 10, z: 1.3 }],
    draw(S, env) {
      env.ctx.fillStyle = '#0a0705';
      env.ctx.fillRect(0, 0, S.w, S.h);
      fireflies(env.ctx, S.view, S.ta, { n: 20 });
    },
  }],
};
```

## crear una escena

1. crea `scenes/<nombre>.js` con una lista de tomas (`shots`), cada una con su duración y su función `draw`.
2. ábrela con `index.html?escena=<nombre>`.
3. la api de cada módulo está en [engine/README.md](engine/README.md). hay una escena mínima en [ejemplo.html](ejemplo.html).

## correr en local

```
python3 -m http.server 8791
```

en windows: `py -3 -m http.server 8791`. abre http://localhost:8791.

## reproductor de escritorio

```
npm install
npm start
npm run build:mac
npm run build:win
```

`build:mac` genera dmg y zip (arm64 y x64) sin firmar; `build:win` genera un zip portable x64. detalles en [engine/README.md](engine/README.md).

## demo: constancia

`index.html` es la animación de demostración, hecha solo con la api del motor: una luciérnaga, una mente, un rostro a lo largo de la vida, un ojo, un agujero negro y un amanecer lejano. dura unos tres minutos y hace bucle. un clic en la luciérnaga empieza todo.

![constancia](docs/captura.png)

## créditos

estilo de dibujo inspirado en los estudios de leonardo da vinci (dominio público).
