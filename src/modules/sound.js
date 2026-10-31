// Sound: soft + minimal. Everything is SYNTHESIZED with the Web Audio API (no audio files).
// Philosophy: silence is the default. Only tiny, dry, organic clicks on press, plus one warm
// "enter" breath and quiet chat taps. NO hover beeps, NO drone, NO whooshes, NO typing ticks.
//
// API: sound.init(), enable(), disable(), toggle(), play(name), isOn(), onChange(fn), preference()
// Names that make sound: click, enter, copy, open, close, decrypt
// Names kept as silent no-ops (so other modules never break): hover, section, rise, type
//
// TWEAK: MASTER (overall loudness 0..1) and the gain numbers inside SOUNDS.
const KEY = 'sig:sound';
const MASTER = 0.55;

let ctx = null, master = null, noise = null, on = false;
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
  // gentle safety limiter so nothing can ever be harsh
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -24; comp.knee.value = 20; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.15;
  master.connect(comp); comp.connect(ctx.destination);
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

const rand = (a, b) => a + Math.random() * (b - a);

// Enveloped oscillator (soft attack, exponential decay) -> no clicks or pops.
function tone({ type = 'sine', f = 440, f2 = null, dur = 0.1, gain = 0.05, at = 0, attack = 0.004, lp = 0 }) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o;
  if (lp) { const bq = ctx.createBiquadFilter(); bq.type = 'lowpass'; bq.frequency.value = lp; o.connect(bq); node = bq; }
  node.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

// Short filtered noise grain = the "dry, organic" part of a click.
function grain({ f = 2200, q = 2.5, dur = 0.022, gain = 0.1, at = 0, type = 'bandpass' }) {
  const t = ctx.currentTime + at;
  const s = ctx.createBufferSource(); s.buffer = noise;
  const bq = ctx.createBiquadFilter(); bq.type = type; bq.frequency.value = f; bq.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(bq); bq.connect(g); g.connect(master);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}

const NOOP = () => {};

const SOUNDS = {
  // Dry little tick with a tiny wooden body. Pitch varies slightly so it never feels repetitive.
  click() {
    const k = rand(0.9, 1.1);
    grain({ f: 2300 * k, q: 3, dur: 0.02, gain: 0.45 });
    tone({ f: 170 * k, f2: 95 * k, dur: 0.045, gain: 0.2, attack: 0.002, lp: 500 });
  },
  // One warm, slow breath when entering the site.
  enter() {
    tone({ f: 164.81, dur: 1.4, gain: 0.035, attack: 0.09, lp: 700 });          // E3
    tone({ f: 246.94, dur: 1.2, gain: 0.022, attack: 0.12, at: 0.05, lp: 800 }); // B3
    grain({ f: 600, q: 0.6, dur: 0.7, gain: 0.018, type: 'lowpass' });
  },
  // Two soft taps = copied.
  copy() {
    grain({ f: 1900, q: 3, dur: 0.018, gain: 0.35 });
    grain({ f: 2500, q: 3, dur: 0.018, gain: 0.35, at: 0.09 });
  },
  // Quiet chat panel taps.
  open() { grain({ f: 1500, q: 2, dur: 0.03, gain: 0.25 }); tone({ f: 140, f2: 110, dur: 0.06, gain: 0.12, lp: 400 }); },
  close() { grain({ f: 1200, q: 2, dur: 0.03, gain: 0.3 }); },
  // DECRYPT: ~0.45s of soft digital grains that get denser, a few quiet high "data" chirps,
  // then a low soft "lock" when the text resolves. Plays with the ASCII decode effect.
  // Match its length with the decode animation in ascii.js (14 steps x 32ms).
  decrypt() {
    let t = 0;
    for (let i = 0; i < 14; i++) {
      const gap = 0.036 - i * 0.0013;                         // ticks speed up
      grain({ f: rand(1800, 4200), q: 4, dur: 0.012, gain: rand(0.12, 0.2) + i * 0.006, at: t });
      if (i % 3 === 1) tone({ f: [880, 1175, 1568, 1760][(Math.random() * 4) | 0], dur: 0.03, gain: 0.02, at: t, attack: 0.002 });
      t += gap;
    }
    tone({ f: 329.63, dur: 0.16, gain: 0.04, at: t + 0.01, attack: 0.006, lp: 900 });   // "lock"
    grain({ f: 2600, q: 3, dur: 0.02, gain: 0.24, at: t + 0.01 });
  },
  // Intentionally silent:
  hover: NOOP, section: NOOP, rise: NOOP, type: NOOP
};
const THROTTLE = { click: 45, copy: 200, decrypt: 500 };

function emit() { subs.forEach((fn) => fn(on)); }

export const sound = {
  init() {
    // If the visitor previously chose sound and skips the loader, unlock on the first gesture.
    if (ls.get() === '1') {
      const unlock = () => { if (!on) this.enable(true); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
      window.addEventListener('pointerdown', unlock, { once: true });
      window.addEventListener('keydown', unlock, { once: true });
    }
    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (document.hidden) { ramp(0, 0.05); setTimeout(() => document.hidden && ctx.suspend(), 250); }
      else if (on) { ctx.resume().then(() => ramp(MASTER, 0.12)); }
    });
    // Only presses make sound (links and buttons). Hover is silent.
    document.addEventListener('pointerdown', (e) => { if (e.target.closest?.('a, button')) this.play('click'); });
  },
  enable() {
    if (!ensure()) return false;
    on = true; ls.set('1');
    ctx.resume();
    ramp(MASTER, 0.1);
    emit();
    return true;
  },
  disable() { on = false; ls.set('0'); ramp(0, 0.06); emit(); },
  toggle() { on ? this.disable() : this.enable(); return on; },
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
