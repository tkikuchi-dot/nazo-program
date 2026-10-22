'use strict';

// オリジナルのチップチューン。BGM は短いループ、効果音は命令ごとの短い音。
const Sound = (() => {
  const KEY = 'nazo-program:volume';
  const BPM = 96;
  const LOOP = 32;
  const LEAD = [
    64, 67, 69, 67, 64, 60, 62, 64,
    67, 64, 60, null, 62, 64, 67, 69,
    72, 69, 67, 64, 67, 69, 67, 64,
    60, 64, 67, 64, 62, 60, 62, null,
  ];
  const BASS = [
    48, null, 48, null, 45, null, 45, null,
    43, null, 43, null, 41, null, 43, null,
    48, null, 48, null, 45, null, 43, null,
    41, null, 43, null, 45, null, 48, null,
  ];

  let ctx = null;
  let master = null;
  let seBus = null;
  let bgmBus = null;
  let leadFilter = null;
  let noise = null;
  let volume = 70;
  let nextNote = 0;
  let index = 0;
  let pump = 0;
  let lastPreview = 0;

  function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  function loadVolume() {
    try {
      const n = Number(localStorage.getItem(KEY));
      if (Number.isFinite(n)) volume = Math.max(0, Math.min(100, Math.round(n)));
    } catch (e) { /* 読めなくても初期音量 */ }
  }

  function masterGain(v) {
    return Math.pow(Math.max(0, Math.min(100, v)) / 100, 1.6);
  }

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = masterGain(volume);
    master.connect(ctx.destination);
    seBus = ctx.createGain();
    seBus.gain.value = 0.55;
    seBus.connect(master);
    bgmBus = ctx.createGain();
    bgmBus.gain.value = 0.2;
    bgmBus.connect(master);
    leadFilter = ctx.createBiquadFilter();
    leadFilter.type = 'lowpass';
    leadFilter.frequency.value = 1800;
    leadFilter.connect(bgmBus);
    const len = Math.floor(ctx.sampleRate * 0.05);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return true;
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function start() {
    if (!ensure()) return;
    resume();
    if (pump) return;
    nextNote = ctx.currentTime + 0.06;
    pump = window.setInterval(schedule, 60);
    schedule();
  }

  function tone(dest, when, freq, dur, type, gain, slideTo) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, when + dur);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), when + Math.min(0.012, dur * 0.4));
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(when);
    osc.stop(when + dur + 0.03);
  }

  function hat(when, gain) {
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    src.buffer = noise;
    filter.type = 'highpass';
    filter.frequency.value = 5000;
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
    src.connect(filter);
    filter.connect(g);
    g.connect(bgmBus);
    src.start(when);
    src.stop(when + 0.05);
  }

  function schedule() {
    if (!ctx) return;
    if (volume <= 0) {
      nextNote = ctx.currentTime + 0.05;
      return;
    }
    if (ctx.state !== 'running') {
      if (nextNote < ctx.currentTime) nextNote = ctx.currentTime + 0.05;
      return;
    }
    const step = 60 / BPM / 2;
    while (nextNote < ctx.currentTime + 0.28) {
      const i = index % LOOP;
      const when = nextNote;
      if (LEAD[i] != null) tone(leadFilter, when, midi(LEAD[i]), step * 0.82, 'square', 0.34);
      if (BASS[i] != null) tone(bgmBus, when, midi(BASS[i]), step * 1.5, 'triangle', 0.5);
      if (i % 2 === 1) hat(when, 0.045);
      nextNote += step;
      index++;
    }
  }

  function now() {
    return ctx.currentTime;
  }

  const cues = {
    tap() { tone(seBus, now(), 660, 0.05, 'square', 0.16); },
    place() {
      const t = now();
      tone(seBus, t, 523, 0.06, 'square', 0.18);
      tone(seBus, t + 0.05, 784, 0.08, 'square', 0.14);
    },
    remove() {
      const t = now();
      tone(seBus, t, 392, 0.07, 'square', 0.14);
      tone(seBus, t + 0.05, 262, 0.09, 'triangle', 0.12);
    },
    play() {
      const t = now();
      tone(seBus, t, 392, 0.07, 'square', 0.16);
      tone(seBus, t + 0.07, 523, 0.07, 'square', 0.16);
      tone(seBus, t + 0.14, 659, 0.1, 'square', 0.16);
    },
    pause() { tone(seBus, now(), 440, 0.09, 'triangle', 0.16); },
    move() { tone(seBus, now(), 784, 0.04, 'square', 0.1); },
    scan() {
      const t = now();
      tone(seBus, t, 988, 0.04, 'square', 0.12);
      tone(seBus, t + 0.045, 1318, 0.06, 'square', 0.1);
    },
    say() {
      const t = now();
      [523, 659, 784].forEach((f, i) => tone(seBus, t + i * 0.06, f, 0.08, 'square', 0.14));
    },
    call() {
      const t = now();
      tone(seBus, t, 330, 0.05, 'square', 0.12);
      tone(seBus, t + 0.05, 494, 0.07, 'square', 0.12);
    },
    if() { tone(seBus, now(), 620, 0.035, 'square', 0.08); },
    ifno() { tone(seBus, now(), 340, 0.04, 'triangle', 0.07); },
    jump() { tone(seBus, now(), 520, 0.08, 'square', 0.1, 980); },
    copy() { tone(seBus, now(), 494, 0.05, 'square', 0.1); },
    add() { tone(seBus, now(), 587, 0.06, 'triangle', 0.12); },
    ok() {
      const t = now();
      [523, 659, 784].forEach((f, i) => tone(seBus, t + i * 0.07, f, 0.1, 'square', 0.16));
    },
    ng() {
      const t = now();
      tone(seBus, t, 220, 0.12, 'square', 0.16);
      tone(seBus, t + 0.1, 165, 0.16, 'triangle', 0.14);
    },
    clear() {
      const t = now();
      bgmBus.gain.cancelScheduledValues(t);
      bgmBus.gain.setValueAtTime(bgmBus.gain.value, t);
      bgmBus.gain.linearRampToValueAtTime(0.05, t + 0.08);
      bgmBus.gain.setValueAtTime(0.05, t + 0.95);
      bgmBus.gain.linearRampToValueAtTime(0.2, t + 1.6);
      [60, 64, 67, 72, 76, 79].forEach((n, i) => tone(seBus, t + i * 0.1, midi(n), 0.16, 'square', 0.2));
    },
  };

  function se(name) {
    if (volume <= 0 || !ensure() || !cues[name]) return;
    start();
    cues[name]();
  }

  function setVolume(v, preview) {
    volume = Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
    if (master) master.gain.value = masterGain(volume);
    try { localStorage.setItem(KEY, String(volume)); } catch (e) { /* 保存できなくても音量は変わる */ }
    document.querySelectorAll('[data-volume]').forEach((el) => {
      if (el.value !== String(volume)) el.value = String(volume);
    });
    if (!preview) return;
    const t = performance.now();
    if (t - lastPreview < 140) return;
    lastPreview = t;
    se('tap');
  }

  function bind() {
    loadVolume();
    document.querySelectorAll('[data-volume]').forEach((el) => {
      el.value = String(volume);
      el.addEventListener('input', () => setVolume(el.value, true));
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else resume();
  });

  return { start, se, setVolume, bind };
})();
