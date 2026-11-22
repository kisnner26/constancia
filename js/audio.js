// sonido generado con webaudio, todo de composicion propia: sin muestras ni audio de terceros.
// capas: tono de habitacion y zumbido, musica apagada dentro de los audifonos, lluvia, tecleo, crujidos electricos,
// latido, organo con acordes lentos, viento y polvo, aleteo de polillas, y silencio casi total al final.
import { clamp, sstep, lerp, hash } from './util.js';

export function crearAudio(K, FIN) {
  let ac = null, master, comp, wet, dry;
  let activo = false, iniciado = false;
  const P = {}; // parametros objetivo 0..1
  const G = {}; // ganancias de cada capa
  let noiseBuf = null, brownBuf = null;
  let t0 = 0, tiempoLinea = 0, pasosMusica = 0, ultimoLatido = 0;

  function buffers() {
    const n = ac.sampleRate * 4;
    noiseBuf = ac.createBuffer(1, n, ac.sampleRate);
    brownBuf = ac.createBuffer(1, n, ac.sampleRate);
    const a = noiseBuf.getChannelData(0), b = brownBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      a[i] = w;
      last = (last + 0.02 * w) / 1.02;
      b[i] = last * 3.5;
    }
  }
  const ruido = (buf = noiseBuf) => { const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };

  function impulso(seg = 3.6) {
    const n = Math.floor(ac.sampleRate * seg);
    const buf = ac.createBuffer(2, n, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6) * (1 - Math.exp(-i / 90));
      }
    }
    return buf;
  }

  function capa(nombre, nodo, envio = 0.25) {
    const g = ac.createGain(); g.gain.value = 0;
    nodo.connect(g);
    g.connect(dry);
    const s = ac.createGain(); s.gain.value = envio; g.connect(s); s.connect(wet);
    G[nombre] = g; P[nombre] = 0;
    return g;
  }

  function iniciar() {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    buffers();
    master = ac.createGain(); master.gain.value = 0;
    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -22; comp.knee.value = 18; comp.ratio.value = 5; comp.attack.value = 0.01; comp.release.value = 0.3;
    dry = ac.createGain(); dry.gain.value = 1;
    wet = ac.createGain(); wet.gain.value = 0.7;
    const conv = ac.createConvolver(); conv.buffer = impulso();
    wet.connect(conv); conv.connect(comp); dry.connect(comp);
    comp.connect(master); master.connect(ac.destination);

    // habitacion: tono grave + zumbido electrico de 50 hz con armonicos
    const hab = ac.createGain();
    const br = ruido(brownBuf); const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220; br.connect(lp); lp.connect(hab);
    for (const [f, g] of [[50, 0.05], [100, 0.03], [150, 0.018], [250, 0.008]]) {
      const o = ac.createOscillator(); o.type = f === 50 ? 'sine' : 'sawtooth'; o.frequency.value = f;
      const og = ac.createGain(); og.gain.value = g; const lf = ac.createBiquadFilter(); lf.type = 'lowpass'; lf.frequency.value = 600;
      o.connect(lf); lf.connect(og); og.connect(hab); o.start();
    }
    const zum = ac.createBiquadFilter(); zum.type = 'bandpass'; zum.frequency.value = 7400; zum.Q.value = 8; const zg = ac.createGain(); zg.gain.value = 0.0035; ruido().connect(zum); zum.connect(zg); zg.connect(hab);
    capa('hab', hab, 0.12);

    // lluvia fuera
    const rn = ruido(); const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1200;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 5200; bp.Q.value = 0.35;
    const am = ac.createGain(); am.gain.value = 0.5;
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.21; const lg = ac.createGain(); lg.gain.value = 0.18; lfo.connect(lg); lg.connect(am.gain); lfo.start();
    rn.connect(hp); hp.connect(bp); bp.connect(am);
    capa('lluvia', am, 0.35);

    // musica lejana dentro de los audifonos: apagada, comprimida
    const mus = ac.createBiquadFilter(); mus.type = 'lowpass'; mus.frequency.value = 760; mus.Q.value = 0.7;
    const hpm = ac.createBiquadFilter(); hpm.type = 'highpass'; hpm.frequency.value = 180; mus.connect(hpm);
    capa('musica', hpm, 0.1);
    G.musicaIn = mus;

    // tecleo, crujidos: bus de transitorios
    const tr = ac.createGain(); capa('tecleo', tr, 0.12); G.trIn = tr;
    const cr = ac.createGain(); capa('crujido', cr, 0.4); G.crIn = cr;

    // latido grave
    const lat = ac.createGain(); capa('latido', lat, 0.3); G.latIn = lat;

    // organo: sumas aditivas con tremolo y filtro; frecuencias reajustadas por acorde
    const org = ac.createGain();
    const olp = ac.createBiquadFilter(); olp.type = 'lowpass'; olp.frequency.value = 1500; olp.Q.value = 0.3;
    G.orgOsc = [];
    for (let v = 0; v < 5; v++) {
      for (const [mult, amp] of [[1, 0.5], [2, 0.28], [3, 0.14], [4, 0.1], [6, 0.05]]) {
        const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = 55 * mult; o.detune.value = (hash(v * 7 + mult) - 0.5) * 8;
        const og = ac.createGain(); og.gain.value = 0.05 * amp;
        o.connect(og); og.connect(olp); o.start();
        G.orgOsc.push({ o, mult, v });
      }
    }
    const tremolo = ac.createOscillator(); tremolo.frequency.value = 5.2; const tg = ac.createGain(); tg.gain.value = 0.04; tremolo.connect(tg); tg.connect(olp.detune); tremolo.start();
    olp.connect(org);
    capa('organo', org, 0.9);

    // viento y polvo
    const vn = ruido(); const vb = ac.createBiquadFilter(); vb.type = 'bandpass'; vb.frequency.value = 420; vb.Q.value = 0.8;
    const vl = ac.createOscillator(); vl.frequency.value = 0.09; const vlg = ac.createGain(); vlg.gain.value = 260; vl.connect(vlg); vlg.connect(vb.frequency); vl.start();
    vn.connect(vb);
    capa('viento', vb, 0.5);
    const dn = ruido(); const dh = ac.createBiquadFilter(); dh.type = 'highpass'; dh.frequency.value = 3800; const dg = ac.createGain(); dg.gain.value = 0.2;
    const dl = ac.createOscillator(); dl.frequency.value = 0.13; const dlg = ac.createGain(); dlg.gain.value = 0.12; dl.connect(dlg); dlg.connect(dg.gain); dl.start();
    dn.connect(dh); dh.connect(dg);
    capa('polvo', dg, 0.3);

    // aleteo de polillas
    const al = ac.createGain(); capa('polillas', al, 0.4); G.alIn = al;

    P.master = 1;
    iniciado = true;
    setInterval(planificar, 40);
  }

  // ------------------------------------------------------------ transitorios planificados
  function chasquido(destino, tiempo, gain, freq, q, dur) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loopStart = Math.random() * 3; s.loop = false;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
    const g = ac.createGain(); g.gain.setValueAtTime(0, tiempo); g.gain.linearRampToValueAtTime(gain, tiempo + 0.001); g.gain.exponentialRampToValueAtTime(0.0001, tiempo + dur);
    s.connect(bp); bp.connect(g); g.connect(destino); s.start(tiempo, Math.random() * 3, dur + 0.02);
  }
  function nota(destino, tiempo, f, dur, gain, tipo = 'triangle') {
    const o = ac.createOscillator(); o.type = tipo; o.frequency.value = f;
    const g = ac.createGain(); g.gain.setValueAtTime(0, tiempo); g.gain.linearRampToValueAtTime(gain, tiempo + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, tiempo + dur);
    o.connect(g); g.connect(destino); o.start(tiempo); o.stop(tiempo + dur + 0.05);
  }
  function golpe(tiempo, f, gain) {
    const o = ac.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f * 1.8, tiempo); o.frequency.exponentialRampToValueAtTime(f, tiempo + 0.08);
    const g = ac.createGain(); g.gain.setValueAtTime(0, tiempo); g.gain.linearRampToValueAtTime(gain, tiempo + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, tiempo + 0.32);
    o.connect(g); g.connect(G.latIn); o.start(tiempo); o.stop(tiempo + 0.4);
  }

  // composicion propia: pentatonica menor en la, patron de ocho tiempos
  const ESCALA = [220, 261.63, 293.66, 329.63, 392, 440, 523.25];
  const PATRON = [0, 2, 3, 2, 4, 3, 2, 1, 0, 3, 5, 4, 3, 2, 1, 2];
  let sigMus = 0, sigTec = 0, sigCru = 0, sigLat = 0, sigAla = 0, acordeAct = -1;
  // progresion lenta del organo (cada acorde: notas en hz). tonalidad de re menor, sin citar nada
  const ACORDES = [
    [73.42, 110, 130.81, 164.81, 174.61],   // re menor 9
    [58.27, 87.31, 110, 146.83, 174.61],    // si bemol mayor 7
    [49, 73.42, 98, 116.54, 146.83],        // sol menor
    [65.41, 98, 123.47, 164.81, 196],       // do 6/9
    [73.42, 110, 146.83, 185, 220],         // re mayor con la 9 (resuelve arriba)
  ];

  function planificar() {
    if (!ac || !iniciado) return;
    const now = ac.currentTime;
    // suavizado de parametros hacia las ganancias
    const gmax = { hab: 0.55, lluvia: 0.2, musica: 0.5, tecleo: 0.7, crujido: 0.5, latido: 0.9, organo: 0.5, viento: 0.5, polvo: 0.12, polillas: 0.35 };
    for (const k in gmax) G[k].gain.setTargetAtTime(P[k] * gmax[k], now, 0.4);
    master.gain.setTargetAtTime(activo ? P.master * 0.85 : 0, now, 0.6);
    // musica en los audifonos
    if (P.musica > 0.03) {
      while (sigMus < now + 0.3) {
        if (sigMus < now - 0.5) sigMus = now;
        const i = pasosMusica++;
        const nt = ESCALA[PATRON[i % PATRON.length]] * (i % 32 >= 16 ? 1.5 : 1);
        nota(G.musicaIn, sigMus, nt, 0.9, 0.18);
        if (i % 4 === 0) { nota(G.musicaIn, sigMus, nt / 2, 1.8, 0.14, 'sine'); }
        sigMus += 0.45;
      }
    } else sigMus = now;
    // tecleo
    if (P.tecleo > 0.08) {
      while (sigTec < now + 0.15) {
        if (sigTec < now - 0.3) sigTec = now;
        const rafaga = Math.random() < 0.2;
        const f = 1800 + Math.random() * 2600;
        chasquido(G.trIn, sigTec, (0.25 + Math.random() * 0.35) * P.tecleo, f, 1.3, 0.018);
        chasquido(G.trIn, sigTec + 0.035, 0.12 * P.tecleo, 600, 1.2, 0.02);
        sigTec += rafaga ? 0.07 + Math.random() * 0.05 : 0.14 + Math.random() * (0.5 - 0.3 * P.tecleo);
      }
    } else sigTec = now;
    // crujidos electricos
    if (P.crujido > 0.05) {
      while (sigCru < now + 0.1) {
        if (sigCru < now - 0.3) sigCru = now;
        const n = 1 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) chasquido(G.crIn, sigCru + i * 0.008, 0.4 * P.crujido, 3000 + Math.random() * 5000, 0.8, 0.006 + Math.random() * 0.012);
        sigCru += 0.05 + Math.random() * (1.1 - P.crujido);
      }
    } else sigCru = now;
    // latido
    if (P.latido > 0.05) {
      while (sigLat < now + 0.2) {
        if (sigLat < now - 0.5) sigLat = now;
        golpe(sigLat, 52, 0.7); golpe(sigLat + 0.26, 44, 0.45);
        sigLat += 0.86;
      }
    } else sigLat = now;
    // aleteo
    if (P.polillas > 0.05) {
      while (sigAla < now + 0.12) {
        if (sigAla < now - 0.3) sigAla = now;
        for (let i = 0; i < 4; i++) chasquido(G.alIn, sigAla + i * 0.025, 0.12 * P.polillas, 900 + Math.random() * 900, 2, 0.02);
        sigAla += 0.07 + Math.random() * 0.12;
      }
    } else sigAla = now;
    // organo: cambia de acorde cada 14 s de linea de tiempo
    const idx = Math.floor(tiempoLinea / 14) % ACORDES.length;
    if (idx !== acordeAct) {
      acordeAct = idx;
      const ch = ACORDES[idx];
      for (const n of G.orgOsc) n.o.frequency.setTargetAtTime(ch[n.v] * n.mult, now, 2.2);
    }
  }

  // parametros por momento de la linea de tiempo
  function mezcla(t) {
    tiempoLinea = t;
    if (!iniciado) return;
    const sal = (a, b) => 1 - sstep(a, b, t);
    const ent = (a, b) => sstep(a, b, t);
    const cuarto = ent(K.cuarto - 1, K.cuarto + 2) * sal(K.mente - 3, K.mente + 2);
    P.hab = 0.12 + 0.88 * cuarto + 0.4 * ent(K.push, K.mente) * sal(K.mente, K.mente + 6);
    P.lluvia = 0.75 * cuarto + 0.2 * ent(K.regreso, K.regreso + 3) * sal(FIN - 6, FIN - 1);
    P.musica = 0.8 * cuarto * sal(K.push, K.mente - 2);
    P.tecleo = cuarto * ((t > K.whipC && t < K.whipA) ? 1 : 0.28 * (t < K.push ? 1 : 0));
    P.crujido = 0.9 * ent(K.mente - 2, K.mente + 0.5) * sal(K.mente + 6, K.mente + 14) + 0.5 * ent(K.edades - 10, K.edades - 4) * sal(K.edades - 1, K.edades + 1);
    P.latido = 0.8 * ent(K.mente + 3, K.mente + 10) * sal(K.edades - 5, K.edades + 1) + 0.5 * ent(K.edades + 2, K.edades + 6) * sal(K.ojo - 6, K.ojo - 2);
    P.organo = 0.55 * ent(K.edades, K.edades + 12) * sal(K.regreso, K.regreso + 5) + 0.3 * ent(K.mente + 14, K.edades);
    P.viento = 0.9 * ent(K.planeta - 2, K.planeta + 4) * sal(K.regreso + 2, FIN - 3) + 0.5 * ent(K.agujero, K.agujero + 4) * sal(K.planeta, K.planeta + 2);
    P.polvo = 0.8 * ent(K.planeta, K.planeta + 5) * sal(K.regreso, K.regreso + 4);
    P.polillas = 0.8 * ent(K.ojo - 9, K.ojo - 5) * sal(K.ojo - 1, K.ojo) + 0.35 * ent(K.planeta + 8, K.planeta + 14) * sal(K.regreso - 2, K.regreso + 1);
    // silencio casi total al final
    P.master = 1 - 0.93 * ent(FIN - 9, FIN - 2);
  }

  return {
    get activo() { return activo; },
    iniciar() {
      if (!iniciado) iniciar();
      if (ac.state === 'suspended') ac.resume();
      activo = true; P.master = 1;
    },
    alternar() {
      if (!iniciado) { iniciar(); activo = true; return true; }
      activo = !activo;
      if (ac.state === 'suspended') ac.resume();
      return activo;
    },
    mezcla,
  };
}
