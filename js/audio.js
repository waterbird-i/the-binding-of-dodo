'use strict';
// ============ synthesized sound effects (WebAudio, no assets) ============
const SFX = (() => {
  let ac = null, master = null;
  const last = {};

  function unlock() {
    if (!ac) {
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain();
        master.gain.value = 0.5;
        master.connect(ac.destination);
      } catch (e) { ac = null; return; }
    }
    if (ac.state === 'suspended') ac.resume();
  }

  function ready() { return ac && ac.state === 'running'; }

  // returns true when this sound should be skipped (played too recently)
  function throttled(name, ms) {
    const now = performance.now();
    if (last[name] && now - last[name] < ms) return true;
    last[name] = now;
    return false;
  }

  function tone({ type = 'sine', f0 = 440, f1 = 0, t = 0.1, vol = 0.2, delay = 0 }) {
    if (!ready()) return;
    const start = ac.currentTime + delay;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, start);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), start + t);
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + t);
    o.connect(g); g.connect(master);
    o.start(start); o.stop(start + t + 0.03);
  }

  // f1: optional filter-frequency sweep target — an explosion "settling" into
  // low rumble is a lowpass whose cutoff falls over the sound's lifetime
  function noise({ t = 0.15, vol = 0.2, f = 1000, f1 = 0, q = 1, delay = 0, type = 'bandpass' }) {
    if (!ready()) return;
    const start = ac.currentTime + delay;
    const len = Math.max(1, Math.floor(ac.sampleRate * t));
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const flt = ac.createBiquadFilter();
    flt.type = type; flt.Q.value = q;
    flt.frequency.setValueAtTime(f, start);
    if (f1) flt.frequency.exponentialRampToValueAtTime(Math.max(1, f1), start + t);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + t);
    src.connect(flt); flt.connect(g); g.connect(master);
    src.start(start);
  }

  return {
    unlock,
    shoot() {
      if (throttled('shoot', 40)) return;
      tone({ type: 'triangle', f0: 750 + Math.random() * 250, f1: 320, t: 0.07, vol: 0.09 });
    },
    splash() {
      if (throttled('splash', 60)) return;
      noise({ t: 0.07, vol: 0.045, f: 2600, q: 0.8 });
    },
    hit() {
      if (throttled('hit', 45)) return;
      tone({ type: 'square', f0: 230, f1: 140, t: 0.06, vol: 0.09 });
      noise({ t: 0.05, vol: 0.05, f: 900, q: 1 });
    },
    kill() {
      if (throttled('kill', 60)) return;
      noise({ t: 0.22, vol: 0.2, f: 500, q: 0.6 });
      tone({ type: 'sawtooth', f0: 280, f1: 55, t: 0.24, vol: 0.13 });
    },
    execute() {
      if (throttled('execute', 120)) return;
      // 处决: a fast upward slice over a wet crunch
      noise({ t: 0.1, vol: 0.2, f: 2200, f1: 350, q: 0.9 });
      tone({ type: 'square', f0: 210, f1: 42, t: 0.2, vol: 0.2 });
      tone({ type: 'sawtooth', f0: 920, f1: 130, t: 0.14, vol: 0.09, delay: 0.03 });
    },
    hurt() {
      tone({ type: 'sawtooth', f0: 180, f1: 65, t: 0.3, vol: 0.26 });
      noise({ t: 0.2, vol: 0.16, f: 300, q: 0.5 });
    },
    coin() {
      tone({ type: 'square', f0: 990, t: 0.06, vol: 0.09 });
      tone({ type: 'square', f0: 1320, t: 0.12, vol: 0.09, delay: 0.06 });
    },
    heart() {
      tone({ type: 'sine', f0: 520, f1: 800, t: 0.16, vol: 0.15 });
    },
    chest() {
      tone({ type: 'square', f0: 380, t: 0.08, vol: 0.09 });
      tone({ type: 'square', f0: 580, t: 0.14, vol: 0.09, delay: 0.08 });
    },
    item() {
      [523, 659, 784, 1046].forEach((f, i) =>
        tone({ type: 'triangle', f0: f, t: 0.16, vol: 0.13, delay: i * 0.09 }));
    },
    doorOpen() {
      if (throttled('doorOpen', 200)) return;
      tone({ type: 'square', f0: 150, f1: 300, t: 0.16, vol: 0.11 });
      noise({ t: 0.14, vol: 0.07, f: 700, q: 0.8 });
    },
    door() {
      if (throttled('door', 250)) return;
      tone({ type: 'square', f0: 110, f1: 70, t: 0.12, vol: 0.13 });
    },
    thud() {
      if (throttled('thud', 100)) return;
      tone({ type: 'sine', f0: 120, f1: 42, t: 0.22, vol: 0.28 });
      noise({ t: 0.14, vol: 0.13, f: 220, q: 0.5, type: 'lowpass' });
    },
    spit() {
      if (throttled('spit', 90)) return;
      noise({ t: 0.12, vol: 0.09, f: 620, q: 1.4 });
    },
    laser() {
      if (throttled('laser', 70)) return;
      // "pew": fast high-to-low sweep, a detuned twin under it, tiny zap of air
      tone({ type: 'sawtooth', f0: 2400, f1: 220, t: 0.16, vol: 0.11 });
      tone({ type: 'square', f0: 1600, f1: 170, t: 0.14, vol: 0.05 });
      noise({ t: 0.09, vol: 0.05, f: 3400, q: 0.9 });
    },
    boom() {
      if (throttled('boom', 80)) return;
      // layered like a real blast: instant high crack, a full-band burst whose
      // lowpass cutoff collapses into rumble, a sub-bass thump, then a tail
      noise({ t: 0.06, vol: 0.18, f: 2800, q: 0.7, type: 'highpass' });
      noise({ t: 0.55, vol: 0.34, f: 1400, f1: 70, q: 0.8, type: 'lowpass' });
      tone({ type: 'sine', f0: 150, f1: 26, t: 0.5, vol: 0.36 });
      tone({ type: 'sawtooth', f0: 110, f1: 30, t: 0.3, vol: 0.1 });
      noise({ t: 0.9, vol: 0.1, f: 220, f1: 60, q: 0.5, type: 'lowpass', delay: 0.1 });
    },
    stairs() {
      [300, 220, 160, 110].forEach((f, i) =>
        tone({ type: 'triangle', f0: f, t: 0.14, vol: 0.15, delay: i * 0.1 }));
    },
    death() {
      tone({ type: 'sawtooth', f0: 220, f1: 38, t: 0.9, vol: 0.24 });
      noise({ t: 0.6, vol: 0.18, f: 260, q: 0.4, type: 'lowpass' });
    },
    win() {
      [523, 659, 784, 1046, 1318].forEach((f, i) =>
        tone({ type: 'triangle', f0: f, t: 0.22, vol: 0.15, delay: i * 0.12 }));
    },
    bossDie() {
      noise({ t: 0.7, vol: 0.26, f: 380, q: 0.4, type: 'lowpass' });
      tone({ type: 'sawtooth', f0: 190, f1: 28, t: 0.8, vol: 0.22 });
    },
    start() {
      tone({ type: 'triangle', f0: 440, f1: 880, t: 0.2, vol: 0.14 });
    },
    pause(on) {
      if (on) {
        tone({ type: 'square', f0: 520, f1: 300, t: 0.1, vol: 0.1 });
        tone({ type: 'square', f0: 300, f1: 180, t: 0.14, vol: 0.08, delay: 0.08 });
      } else {
        tone({ type: 'square', f0: 300, f1: 520, t: 0.1, vol: 0.1 });
        tone({ type: 'square', f0: 520, f1: 760, t: 0.12, vol: 0.08, delay: 0.07 });
      }
    },
  };
})();
