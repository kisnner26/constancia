// punto de entrada de ejemplo.html: la escena minima scenes/ejemplo.js en el reproductor del motor.
import { createPlayer } from '../engine/player.js';
import escena from '../scenes/ejemplo.js';

const $ = (s) => document.querySelector(s);
createPlayer({ scene: escena, canvas: $('#c2'), glCanvas: $('#gl'), soundButton: $('#snd'), fallback: () => { $('#sin-webgl').hidden = false; } });
