// Sound: CLEAN + MINIMAL. Everything is synthesized with the Web Audio API (no audio files).
// Rules that keep it from getting "messy":
//   1. Only pure, soft sine tones (no noise, no buzz), all from one pentatonic scale, so any two always sound fine together.
//   2. One voice at a time: a new sound is ignored if another played less than 90ms ago.
//   3. Silence by default: no hover sounds, no drone, no typing ticks. Only presses and a few key moments.
//
// API: sound.init(), enable(), disable(), toggle(), play(name), isOn(), onChange(fn), preference()
// Names that make sound: click, enter, copy, open, close, themeMac, themeLinux, decrypt
// Silent no-ops (so other modules never break): hover, section, rise, type
//
// TWEAK: MASTER (overall loudness 0..1) and the gain numbers inside SOUNDS.
const KEY = 'sig:sound';
const MASTER = 0.5;
const GAP_MS = 90; // minimum time between two sounds

// C major pentatonic (Hz): C4 D4 E4 G4 A4 C5 D5 E5 G5 A5 C6
const N = { C4: 261.63, E4: 329.63, G4: 392.0, A4: 440.0, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.0, C6: 1046.5 };

let ctx = null, master = null, on = false, lastAny = 0;
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
  const comp = ctx.createDynamicsCompressor(); // safety limiter: nothing can ever be harsh
  comp.threshold.value = -22; comp.knee.value = 24; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.2;
  master.connect(comp); comp.connect(ctx.destination);
  return ctx;
}

function ramp(target, tc = 0.08) {
  if (!ctx) return;
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setTargetAtTime(target, ctx.currentTime, tc);
}

// One soft note: sine, 6ms attack, exponential decay, gentle low-pass.
function note(f, { dur = 0.16, gain = 0.08, at = 0, attack = 0.006, lp = 2400 } = {}) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = ctx.createGain(), bq = ctx.createBiquadFilter();
  o.type = 'sine';
  o.frequency.setValueAtTime(f, t);
  bq.type = 'lowpass'; bq.frequency.value = lp;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(bq); bq.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

const NOOP = () => {};

const SOUNDS = {
  // a soft "tap": one short high-ish note
  click() { note(N.E5, { dur: 0.09, gain: 0.07 }); },
  // booting in: two low notes, a calm rising fifth
  enter() {
    note(N.C4, { dur: 0.9, gain: 0.07, attack: 0.04, lp: 1200 });
    note(N.G4, { dur: 0.9, gain: 0.05, attack: 0.05, at: 0.14, lp: 1200 });
    note(N.C5, { dur: 1.0, gain: 0.035, attack: 0.06, at: 0.3, lp: 1400 });
  },
  // two quick taps = copied
  copy() { note(N.G5, { dur: 0.07, gain: 0.05 }); note(N.C6, { dur: 0.09, gain: 0.05, at: 0.08 }); },
  // chat panel
  open() { note(N.G4, { dur: 0.12, gain: 0.06 }); note(N.C5, { dur: 0.16, gain: 0.05, at: 0.07 }); },
  close() { note(N.C5, { dur: 0.1, gain: 0.05 }); note(N.G4, { dur: 0.14, gain: 0.045, at: 0.07 }); },
  // theme switch: rising for macOS (light), falling for Linux (dark)
  themeMac() { note(N.C5, { dur: 0.14, gain: 0.07 }); note(N.G5, { dur: 0.2, gain: 0.06, at: 0.09 }); },
  themeLinux() { note(N.G5, { dur: 0.14, gain: 0.06 }); note(N.C5, { dur: 0.22, gain: 0.07, at: 0.09 }); },
  // short ascending run that lands on a note (used by terminal / ASCII "decode")
  decrypt() {
    [N.C5, N.D5, N.E5, N.G5, N.A5].forEach((f, i) => note(f, { dur: 0.05, gain: 0.03, at: i * 0.045 }));
    note(N.C6, { dur: 0.2, gain: 0.05, at: 0.27 });
  },
  hover: NOOP, section: NOOP, rise: NOOP, type: NOOP
};
const THROTTLE = { click: 60, copy: 300, decrypt: 900, themeMac: 400, themeLinux: 400 };
// Elements that have their own sound (so the generic press "tap" must not fire on them too)
const OWN_SOUND = '[data-theme-toggle], [data-term-run], .os, [data-copy], [data-social="mail"]';

function emit() { subs.forEach((fn) => fn(on)); }

export const sound = {
  init() {
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
    document.addEventListener('pointerdown', (e) => {
      const el = e.target.closest?.('a, button');
      if (el && !el.closest(OWN_SOUND)) this.play('click');
    });
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
    if (!on || !ctx || ctx.state !== 'running' || !SOUNDS[name] || SOUNDS[name] === NOOP) return;
    const now = performance.now();
    if (now - (lastPlayed[name] || 0) < (THROTTLE[name] || 0)) return;
    if (name !== 'enter' && now - lastAny < GAP_MS) return; // one voice at a time
    lastPlayed[name] = lastAny = now;
    SOUNDS[name]();
  }
};
