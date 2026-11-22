// audio.js: grafo webaudio por capas, con compresor, reverb de impulso generado y automatizacion atada al timeline.
// solo apis estandar (AudioContext, ConvolverNode, DynamicsCompressorNode): igual en chrome, edge y safari.
//
//   const audio = createAudio({ reverb: 3.6, master: 0.85 });
//   audio.layer('viento', (ac, h) => h.noise().connect(h.filter('bandpass', 420, 0.8)) ..., { send: 0.5, max: 0.5 });
//        // build(ac, h) devuelve el nodo de salida de la capa; h = ayudantes (noise, osc, filter, gain, lfo, burst, note, thump)
//   audio.scheduler((now, p, h) => { ... })   // se llama cada 40 ms: programa transitorios (clics, notas, latidos) con p[capa] = nivel actual
//   audio.automate((t) => ({ viento: 0.8, master: 1 }))   // nivel 0..1 de cada capa segun el instante del timeline
//   audio.start() (dentro de un gesto del usuario) / audio.toggle() / audio.update(t)
import { clamp } from './util.js';

export function createAudio({ reverb = 3.6, master = 0.85 } = {}) {
  let ac = null, comp, dry, wet, mst, iniciado = false, activo = false;
  const defs = [], scheds = [];
  const L = {};     // nombre -> { gain, node, max }
  const P = { master: 1 };   // niveles objetivo
  let auto = () => ({}), t0 = 0;
  let noiseBuf = null, brownBuf = null;

  function buffers() {
    const n = ac.sampleRate * 4;
    noiseBuf = ac.createBuffer(1, n, ac.sampleRate); brownBuf = ac.createBuffer(1, n, ac.sampleRate);
    const a = noiseBuf.getChannelData(0), b = brownBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; a[i] = w; last = (last + 0.02 * w) / 1.02; b[i] = last * 3.5; }
  }
  function impulso(seg) {
    const n = Math.floor(ac.sampleRate * seg);
    const buf = ac.createBuffer(2, n, ac.sampleRate);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6) * (1 - Math.exp(-i / 90)); }
    return buf;
  }

  const h = {
    noise(kind = 'white') { const s = ac.createBufferSource(); s.buffer = kind === 'brown' ? brownBuf : noiseBuf; s.loop = true; s.start(); return s; },
    filter(type, f, q = 0.7) { const n = ac.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; },
    gain(v = 1) { const g = ac.createGain(); g.gain.value = v; return g; },
    osc(type, f, detune = 0) { const o = ac.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune; o.start(); return o; },
    lfo(freq, depth, param) { const o = ac.createOscillator(); o.frequency.value = freq; const g = ac.createGain(); g.gain.value = depth; o.connect(g); g.connect(param); o.start(); return o; },
    /** transitorio de ruido filtrado (clic, crujido, aleteo) */
    burst(dest, tiempo, gain, freq, q, dur) {
      const s = ac.createBufferSource(); s.buffer = noiseBuf;
      const bp = h.filter('bandpass', freq, q);
      const g = ac.createGain(); g.gain.setValueAtTime(0, tiempo); g.gain.linearRampToValueAtTime(gain, tiempo + 0.001); g.gain.exponentialRampToValueAtTime(0.0001, tiempo + dur);
      s.connect(bp); bp.connect(g); g.connect(dest); s.start(tiempo, Math.random() * 3, dur + 0.02);
    },
    /** nota con ataque corto y caida exponencial */
    note(dest, tiempo, f, dur, gain, tipo = 'triangle') {
      const o = ac.createOscillator(); o.type = tipo; o.frequency.value = f;
      const g = ac.createGain(); g.gain.setValueAtTime(0, tiempo); g.gain.linearRampToValueAtTime(gain, tiempo + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, tiempo + dur);
      o.connect(g); g.connect(dest); o.start(tiempo); o.stop(tiempo + dur + 0.05);
    },
    /** golpe grave (latido) */
    thump(dest, tiempo, f, gain) {
      const o = ac.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f * 1.8, tiempo); o.frequency.exponentialRampToValueAtTime(f, tiempo + 0.08);
      const g = ac.createGain(); g.gain.setValueAtTime(0, tiempo); g.gain.linearRampToValueAtTime(gain, tiempo + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, tiempo + 0.32);
      o.connect(g); g.connect(dest); o.start(tiempo); o.stop(tiempo + 0.4);
    },
    /** nodo de entrada de otra capa (para enviarle transitorios) */
    input(nombre) { return L[nombre].node; },
    get now() { return ac.currentTime; },
  };

  function construir() {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    buffers();
    mst = ac.createGain(); mst.gain.value = 0;
    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -22; comp.knee.value = 18; comp.ratio.value = 5; comp.attack.value = 0.01; comp.release.value = 0.3;
    dry = ac.createGain(); wet = ac.createGain(); wet.gain.value = 0.7;
    const conv = ac.createConvolver(); conv.buffer = impulso(reverb);
    wet.connect(conv); conv.connect(comp); dry.connect(comp); comp.connect(mst); mst.connect(ac.destination);
    for (const d of defs) {
      const node = d.build(ac, h);
      const g = ac.createGain(); g.gain.value = 0;
      node.connect(g); g.connect(dry);
      const s = ac.createGain(); s.gain.value = d.send; g.connect(s); s.connect(wet);
      L[d.name] = { gain: g, node, max: d.max }; P[d.name] = 0;
    }
    iniciado = true;
    setInterval(paso, 40);
  }

  function paso() {
    if (!ac) return;
    const now = ac.currentTime;
    for (const k in L) L[k].gain.gain.setTargetAtTime(P[k] * L[k].max, now, 0.4);
    mst.gain.setTargetAtTime(activo ? P.master * master : 0, now, 0.6);
    for (const s of scheds) s(now, P, h);
  }

  return {
    get active() { return activo; },
    layer(name, build, { send = 0.25, max = 0.5 } = {}) { defs.push({ name, build, send, max }); return this; },
    scheduler(fn) { scheds.push(fn); return this; },
    automate(fn) { auto = fn; return this; },
    start() { if (!iniciado) construir(); if (ac.state === 'suspended') ac.resume(); activo = true; P.master = 1; },
    toggle() { if (!iniciado) { construir(); activo = true; if (ac.state === 'suspended') ac.resume(); return true; } activo = !activo; if (ac.state === 'suspended') ac.resume(); return activo; },
    update(t) { h.tl = t; if (!iniciado) return; const v = auto(t); for (const k in v) P[k] = clamp(v[k]); },
  };
}
