// Sound: everything is SYNTHESIZED with the Web Audio API. No audio files needed.
// API: sound.init(), enable(), disable(), toggle(), play(name), isOn(), onChange(fn), preference()
// Names: hover, click, section, rise, enter, open, close, type, copy
const KEY = 'sig:sound';
const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25]; // pentatonic-ish

let ctx = null, master = null, noise = null, droneStarted = false, on = false;
const subs = new Set();
const lastPlayed = {};

const ls = {
  get() { try { return localStorage.getItem(KEY); } catch { return null; } },
  set(v) { try { localStorage.setItem(KEY, v); } catch { /* private mode */ } }
};

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

function ramp(target, tc = 0.08) {
  if (!ctx) return;
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setTargetAtTime(target, ctx.currentTime, tc);
}

// Single enveloped oscillator (attack/decay) -> no clicks or pops.
function tone({ type = 'sine', f = 440, f2 = null, dur = 0.1, gain = 0.1, at = 0, attack = 0.004, filter = null }) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o;
  if (filter) {
    const bq = ctx.createBiquadFilter();
    bq.type = filter.type; bq.frequency.setValueAtTime(filter.f, t);
    if (filter.f2) bq.frequency.exponentialRampToValueAtTime(filter.f2, t + dur);
    bq.Q.value = filter.q || 1;
    o.connect(bq); node = bq;
  }
  node.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

function burst({ dur = 0.5, gain = 0.1, type = 'bandpass', f = 400, f2 = 2400, q = 1.2, at = 0 }) {
  const t = ctx.currentTime + at;
  const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
  const bq = ctx.createBiquadFilter(); bq.type = type; bq.Q.value = q;
  bq.frequency.setValueAtTime(f, t); bq.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(bq); bq.connect(g); g.connect(master);
  s.start(t); s.stop(t + dur + 0.05);
}

function startDrone() {
  if (droneStarted) return;
  droneStarted = true;
  const g = ctx.createGain(); g.gain.value = 0;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240; lp.Q.value = 0.7;
  const lfo = ctx.createOscillator(), lfoG = ctx.createGain();
  lfo.frequency.value = 0.07; lfoG.gain.value = 90; lfo.connect(lfoG); lfoG.connect(lp.frequency);
  [[55, 'sine', 0], [82.41, 'triangle', 6], [110.4, 'sine', -5]].forEach(([f, type, det]) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det;
    o.connect(lp); o.start();
  });
  lfo.start();
  lp.connect(g); g.connect(master);
  g.gain.setTargetAtTime(0.07, ctx.currentTime, 2.5); // slow fade-in
}

const SOUNDS = {
  hover() { tone({ f: SCALE[3 + ((Math.random() * 5) | 0)] * 2, dur: 0.055, gain: 0.05 }); },
  click() {
    tone({ type: 'triangle', f: 240, f2: 70, dur: 0.13, gain: 0.2 });
    burst({ dur: 0.04, gain: 0.05, type: 'highpass', f: 3000, f2: 6000, q: 0.5 });
  },
  section() { burst({ dur: 0.7, gain: 0.1, f: 280, f2: 2600 }); },
  rise() { tone({ type: 'sawtooth', f: 90, f2: 760, dur: 1.8, gain: 0.07, attack: 0.5, filter: { type: 'lowpass', f: 300, f2: 2400, q: 2 } }); },
  enter() { [0, 2, 3, 5].forEach((n, i) => tone({ f: SCALE[n], dur: 1.3, gain: 0.07, at: i * 0.07, attack: 0.02 })); burst({ dur: 0.9, gain: 0.08, f: 200, f2: 3000 }); },
  open() { tone({ f: 520, f2: 880, dur: 0.16, gain: 0.08 }); },
  close() { tone({ f: 880, f2: 480, dur: 0.14, gain: 0.07 }); },
  type() { tone({ type: 'square', f: 1800 + Math.random() * 400, dur: 0.018, gain: 0.014 }); },
  copy() { tone({ f: SCALE[4], dur: 0.09, gain: 0.09 }); tone({ f: SCALE[7], dur: 0.14, gain: 0.09, at: 0.08 }); }
};
const THROTTLE = { hover: 45, type: 28, section: 500, click: 40 };

function emit() { subs.forEach((fn) => fn(on)); }

export const sound = {
  init() {
    // If the user previously chose sound and skips the loader, unlock on first gesture.
    if (ls.get() === '1') {
      const unlock = () => { if (!on) this.enable(true); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
      window.addEventListener('pointerdown', unlock, { once: true });
      window.addEventListener('keydown', unlock, { once: true });
    }
    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (document.hidden) { ramp(0, 0.05); setTimeout(() => document.hidden && ctx.suspend(), 250); }
      else if (on) { ctx.resume().then(() => ramp(0.9, 0.12)); }
    });
    // Declarative hooks: any element with data-sound="click|hover|..."
    document.addEventListener('pointerover', (e) => {
      const el = e.target.closest?.('a, button, [data-sound]');
      if (el && !el.contains(e.relatedTarget)) this.play(el.dataset.sound || 'hover');
    });
    document.addEventListener('pointerdown', (e) => { if (e.target.closest?.('a, button')) this.play('click'); });
  },
  enable(fromGesture = true) {
    if (!ensure()) return false;
    on = true; ls.set('1');
    ctx.resume();
    startDrone();
    ramp(0.9, 0.1);
    emit();
    return true;
  },
  disable() { on = false; ls.set('0'); ramp(0, 0.06); emit(); },
  toggle() { on ? this.disable() : this.enable(); if (on) this.play('click'); return on; },
  isOn: () => on,
  preference: () => ls.get(),
  onChange(fn) { subs.add(fn); return () => subs.delete(fn); },
  play(name) {
    if (!on || !ctx || ctx.state !== 'running' || !SOUNDS[name]) return;
    const now = performance.now();
    if (now - (lastPlayed[name] || 0) < (THROTTLE[name] || 0)) return;
    lastPlayed[name] = now;
    SOUNDS[name]();
  }
};
