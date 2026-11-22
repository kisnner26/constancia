// ambiente generado con webaudio: un drone grave y ruido filtrado. apagado por defecto.
export function crearAudio() {
  let ac = null, master, lp, ruidoG, bp;
  let encendido = false;
  const base = [55, 82.41, 110.0, 164.81];
  const osc = [];

  function iniciar() {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain();
    master.gain.value = 0;
    lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    lp.Q.value = 0.4;
    lp.connect(master);
    master.connect(ac.destination);
    base.forEach((f, i) => {
      const o = ac.createOscillator();
      o.type = i === 2 ? 'triangle' : 'sine';
      o.frequency.value = f;
      o.detune.value = (i - 1.5) * 4;
      const g = ac.createGain();
      g.gain.value = [0.5, 0.32, 0.12, 0.05][i];
      const lfo = ac.createOscillator();
      lfo.frequency.value = 0.05 + i * 0.037;
      const lg = ac.createGain();
      lg.gain.value = g.gain.value * 0.5;
      lfo.connect(lg);
      lg.connect(g.gain);
      o.connect(g);
      g.connect(lp);
      o.start();
      lfo.start();
      osc.push(o);
    });
    // ruido blanco filtrado
    const buf = ac.createBuffer(1, ac.sampleRate * 3, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const ruido = ac.createBufferSource();
    ruido.buffer = buf;
    ruido.loop = true;
    bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 500;
    bp.Q.value = 0.7;
    ruidoG = ac.createGain();
    ruidoG.gain.value = 0.05;
    const lf = ac.createOscillator();
    lf.frequency.value = 0.07;
    const lfg = ac.createGain();
    lfg.gain.value = 260;
    lf.connect(lfg);
    lfg.connect(bp.frequency);
    lf.start();
    ruido.connect(bp);
    bp.connect(ruidoG);
    ruidoG.connect(master);
    ruido.start();
  }

  return {
    get activo() { return encendido; },
    alternar() {
      if (!ac) iniciar();
      encendido = !encendido;
      if (ac.state === 'suspended') ac.resume();
      master.gain.cancelScheduledValues(ac.currentTime);
      master.gain.setTargetAtTime(encendido ? 0.32 : 0, ac.currentTime, 0.8);
      return encendido;
    },
    // el color del sonido sigue a la escena
    escena(i) {
      if (!ac) return;
      const t = ac.currentTime;
      const lpf = [300, 520, 800, 420, 650, 520, 260][i] ?? 400;
      const ru = [0.02, 0.07, 0.03, 0.02, 0.045, 0.055, 0.03][i] ?? 0.04;
      const cambio = [0, 0, 7, -5, 0, 5, -9][i] ?? 0;
      lp.frequency.setTargetAtTime(lpf, t, 2.5);
      ruidoG.gain.setTargetAtTime(ru, t, 2.5);
      osc.forEach((o, k) => o.detune.setTargetAtTime((k - 1.5) * 4 + cambio * 10, t, 3));
    },
  };
}
