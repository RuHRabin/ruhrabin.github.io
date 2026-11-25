// Sound engine. Uses real recordings when listed in /audio/manifest.json,
// otherwise synthesises believable sounds live (layered keyboard switches, room reverb, drive/fan, space drone).
import { $ } from './lib.js';

const BASE = import.meta.env.BASE_URL || '/';
const R = (a, b) => a + Math.random() * (b - a);
let ac, mg, rv, nb, brown, amb = null, wind = null, on = false, lastH = 0, lastW = -1;
const samples = {};

function init() {
  if (ac) return true;
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return false;
  ac = new C();
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -20; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
  comp.connect(ac.destination);
  mg = ac.createGain(); mg.gain.value = 0.9; mg.connect(comp);
  const n = ac.sampleRate * 2; nb = ac.createBuffer(1, n, ac.sampleRate);
  const d = nb.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  brown = ac.createBuffer(1, ac.sampleRate * 4, ac.sampleRate);
  const e = brown.getChannelData(0); let l = 0; for (let i = 0; i < e.length; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; e[i] = l * 3.5; }
  const len = ac.sampleRate * 2.4, ir = ac.createBuffer(2, len, ac.sampleRate); // generated room / hall impulse
  for (let c = 0; c < 2; c++) { const x = ir.getChannelData(c); for (let i = 0; i < len; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.4); }
  rv = ac.createConvolver(); rv.buffer = ir;
  const wet = ac.createGain(); wet.gain.value = 0.3; rv.connect(wet); wet.connect(mg);
  loadSamples();
  return true;
}
async function loadSamples() {
  try {
    const m = await (await fetch(BASE + 'audio/manifest.json')).json();
    for (const [name, files] of Object.entries(m.files || {})) {
      samples[name] = [];
      for (const f of files) {
        try { samples[name].push(await ac.decodeAudioData(await (await fetch(BASE + 'audio/' + f)).arrayBuffer())); } catch {}
      }
    }
  } catch {}
}
function ctx() { if (!on || !init()) return null; if (ac.state === 'suspended') ac.resume(); return ac; }
function route(node, o) {
  let n = node;
  if (o.pan) { const p = ac.createStereoPanner(); p.pan.value = o.pan; n.connect(p); n = p; }
  n.connect(mg);
  if (o.verb) { const s = ac.createGain(); s.gain.value = o.verb; n.connect(s); s.connect(rv); }
}
function noise(o) {
  const a = ctx(); if (!a) return;
  const t = a.currentTime + (o.at || 0), s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = nb; f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.f || 2000, t);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + o.d);
  f.Q.value = o.q || 1;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.g || 0.1, t + (o.atk || 0.002)); g.gain.exponentialRampToValueAtTime(0.0001, t + o.d);
  s.connect(f); f.connect(g); route(g, o); s.start(t, Math.random() * 1.5); s.stop(t + o.d + 0.05);
}
function tone(o) {
  const a = ctx(); if (!a) return;
  const t = a.currentTime + (o.at || 0), os = a.createOscillator(), g = a.createGain();
  os.type = o.type || 'sine'; os.frequency.setValueAtTime(o.f, t);
  if (o.to) os.frequency.exponentialRampToValueAtTime(o.to, t + o.d);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.g || 0.1, t + (o.atk || 0.004)); g.gain.exponentialRampToValueAtTime(0.0001, t + o.d);
  os.connect(g); route(g, o); os.start(t); os.stop(t + o.d + 0.05);
}
function play(name, o = {}) {
  const a = ctx(); const list = samples[name]; if (!a || !list || !list.length) return false;
  const s = a.createBufferSource(), g = a.createGain();
  s.buffer = list[Math.floor(Math.random() * list.length)]; s.playbackRate.value = R(0.96, 1.04) * (o.rate || 1); g.gain.value = o.g || 0.6;
  s.connect(g); route(g, o); s.start(); return true;
}
const BIG = new Set([' ', 'Enter', 'Backspace', 'Tab']);
const typing = (k) => k && (k.length === 1 || BIG.has(k));

function ambStart() {
  const a = ctx(); if (!a || amb) return;
  const g = a.createGain(), nodes = []; g.gain.value = 0; g.connect(mg);
  const send = a.createGain(); send.gain.value = 0.5; g.connect(send); send.connect(rv);
  g.gain.linearRampToValueAtTime(0.55, a.currentTime + 3);
  if (samples.ambient && samples.ambient.length) {
    const s = a.createBufferSource(); s.buffer = samples.ambient[0]; s.loop = true; s.connect(g); s.start(); nodes.push(s);
  } else {
    const bs = a.createBufferSource(), lp = a.createBiquadFilter(), bg = a.createGain();
    bs.buffer = brown; bs.loop = true; lp.type = 'lowpass'; lp.frequency.value = 170; bg.gain.value = 0.6;
    bs.connect(lp); lp.connect(bg); bg.connect(g); bs.start(); nodes.push(bs);
    const br = a.createOscillator(), brg = a.createGain(); br.frequency.value = 0.05; brg.gain.value = 70; br.connect(brg); brg.connect(lp.frequency); br.start(); nodes.push(br); // slow "breathing"
    [[55, 0.05], [55.35, 0.05], [82.4, 0.03], [110.2, 0.014]].forEach((p) => { const o = a.createOscillator(), og = a.createGain(); o.frequency.value = p[0]; og.gain.value = p[1]; o.connect(og); og.connect(g); o.start(); nodes.push(o); });
    const hum = a.createBiquadFilter(), hg = a.createGain(); hum.type = 'lowpass'; hum.frequency.value = 700; hg.gain.value = 1; hum.connect(hg); hg.connect(g);
    [[100, 0.012], [200.4, 0.008], [301.1, 0.005]].forEach((p) => { const o = a.createOscillator(), og = a.createGain(); o.type = 'sawtooth'; o.frequency.value = p[0]; og.gain.value = p[1]; o.connect(og); og.connect(hum); o.start(); nodes.push(o); }); // ventilation hum
    const lfo = a.createOscillator(), lg = a.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 0.12; lfo.connect(lg); lg.connect(g.gain); lfo.start(); nodes.push(lfo);
  }
  const ws = a.createBufferSource(), wf = a.createBiquadFilter(); ws.buffer = nb; ws.loop = true; wf.type = 'bandpass'; wf.frequency.value = 700; wf.Q.value = 0.5;
  lastW = -1; wind = a.createGain(); wind.gain.value = 0; ws.connect(wf); wf.connect(wind); wind.connect(mg); ws.start(); nodes.push(ws);
  amb = { g, nodes, wf, iv: setInterval(() => { tone({ f: R(1800, 3800), d: 1.4, g: 0.012, atk: 0.3, verb: 0.8 }); for (let i = 0; i < 5; i++) noise({ d: 0.03, f: R(2500, 5200), q: 4, g: 0.011, at: Math.random() * 0.8, verb: 0.6 }); }, R(7000, 12000)) };
}
function ambStop() {
  if (!amb || !ac) return; const m = amb, t = ac.currentTime;
  m.g.gain.cancelScheduledValues(t); m.g.gain.setTargetAtTime(0, t, 0.3); clearInterval(m.iv);
  if (wind) wind.gain.setTargetAtTime(0, t, 0.1);
  setTimeout(() => m.nodes.forEach((n) => { try { n.stop(); } catch {} }), 1800); amb = null; wind = null;
}

export function audioHandle() { if (!init()) return null; return { ac, out: mg, rv, samples }; }
export const Sfx = {
  set(v) { on = v; if (v) { ctx(); ambStart(); } else ambStop(); window.dispatchEvent(new CustomEvent('sfx:toggle', { detail: v })); },
  get on() { return on; },
  // layered mechanical-switch model: click transient + bottom-out thock + case resonance + plate ping (+ stabiliser rattle)
  keyDown(k) {
    if (!typing(k) || !on) return; if (play(k === ' ' ? 'space' : k === 'Enter' ? 'enter' : 'key', { pan: R(-0.25, 0.25) })) return;
    const big = BIG.has(k), pan = R(-0.25, 0.25), body = big ? R(560, 720) : R(780, 1180), pitch = big ? R(92, 122) : R(125, 195);
    noise({ d: 0.009, f: R(2900, 4900), q: 2.2, g: R(0.08, 0.12), pan });                                   // switch click
    noise({ d: R(0.04, 0.06), type: 'lowpass', f: body, q: 0.6, g: big ? 0.22 : R(0.15, 0.19), pan, verb: 0.06 }); // bottom-out thock
    tone({ f: pitch, to: pitch * 0.55, d: big ? 0.12 : R(0.06, 0.085), g: big ? 0.2 : R(0.12, 0.16), pan });       // case resonance
    tone({ f: R(2400, 3600), d: 0.01, g: 0.012, pan });                                                          // plate ping
    if (Math.random() < 0.16) tone({ f: R(3800, 5200), d: 0.05, g: 0.011, at: 0.012, pan, verb: 0.2 });          // spring ping
    if (big) { noise({ d: 0.045, f: 1500, q: 1.2, g: 0.05, at: 0.012, pan }); noise({ d: 0.012, f: 2600, q: 3, g: 0.05, at: 0.03, pan }); }
  },
  keyUp(k) { if (!typing(k) || !on) return; const pan = R(-0.25, 0.25); noise({ d: 0.012, f: R(2200, 3200), q: 1.6, g: 0.045, pan }); tone({ f: R(190, 240), to: 120, d: 0.04, g: 0.05, pan }); },
  key() { this.keyDown('a'); setTimeout(() => this.keyUp('a'), 55); },
  enter() { this.keyDown('Enter'); tone({ f: 2200, d: 0.22, g: 0.02, type: 'triangle', at: 0.03, verb: 0.3 }); },
  click() { if (play('click', { g: 0.4 })) return; noise({ d: 0.022, f: 2800, q: 1.5, g: 0.11 }); tone({ f: 900, to: 600, d: 0.04, g: 0.035, type: 'triangle' }); },
  hover() { const n = performance.now(); if (n - lastH < 70) return; lastH = n; noise({ d: 0.01, type: 'highpass', f: 6000, q: 0.5, g: 0.025 }); },
  hdd() { noise({ d: 0.007, f: R(1200, 2300), q: 3, g: 0.09 }); if (Math.random() < 0.3) noise({ d: 0.05, f: 900, q: 4, g: 0.03, at: 0.01 }); },
  power() { tone({ f: 38, to: 190, d: 1, g: 0.14, verb: 0.2 }); noise({ d: 1.4, f: 90, to: 420, q: 0.7, g: 0.05 }); noise({ d: 0.015, f: 1800, q: 2, g: 0.12 }); },
  chime() { [784, 1175, 1568].forEach((f, i) => { tone({ f, d: 1.6, g: 0.06 / (i + 1), at: i * 0.09, atk: 0.01, verb: 0.6 }); tone({ f: f * 2.01, d: 0.9, g: 0.012, at: i * 0.09 }); }); },
  whoosh() { if (play('whoosh', { g: 0.6 })) return; noise({ d: 1.6, f: 180, to: 5200, q: 0.7, g: 0.16, atk: 0.5, verb: 0.3 }); tone({ f: 60, to: 28, d: 1.6, g: 0.1, atk: 0.4 }); },
  meteor() { noise({ d: 0.7, type: 'highpass', f: 5200, to: 1800, q: 0.5, g: 0.03, atk: 0.05, pan: R(-0.5, 0.5) }); },
  winClose() { noise({ d: 0.1, type: 'lowpass', f: 700, g: 0.2 }); tone({ f: 150, to: 60, d: 0.14, g: 0.16 }); noise({ d: 0.25, f: 1800, to: 400, q: 0.8, g: 0.05, at: 0.03 }); },
  winMin() { noise({ d: 0.3, f: 2600, to: 380, q: 0.9, g: 0.07 }); tone({ f: 520, to: 260, d: 0.18, g: 0.04, type: 'triangle' }); },
  winMax() { noise({ d: 0.32, f: 380, to: 2800, q: 0.9, g: 0.07 }); tone({ f: 260, to: 640, d: 0.2, g: 0.04, type: 'triangle' }); noise({ d: 0.012, f: 3000, q: 2, g: 0.08, at: 0.3 }); },
  tick() { tone({ f: R(1300, 1700), d: 0.09, g: 0.03, type: 'triangle', verb: 0.4 }); noise({ d: 0.01, f: 5000, q: 2, g: 0.03 }); },
  chapter() { tone({ f: 523.25, d: 1.4, g: 0.045, atk: 0.02, verb: 0.9 }); tone({ f: 783.99, d: 1.1, g: 0.02, at: 0.07, verb: 0.9 }); noise({ d: 0.5, f: 900, to: 200, q: 0.7, g: 0.03 }); },
  boom() { tone({ f: 62, to: 26, d: 2.2, g: 0.32, atk: 0.01, verb: 0.5 }); noise({ d: 1.8, type: 'lowpass', f: 900, to: 60, q: 0.6, g: 0.22, atk: 0.01, verb: 0.4 }); noise({ d: 0.12, f: 2400, q: 1, g: 0.1 }); },
  wind(v) { if (!wind || !ac) return; const q = Math.round(Math.min(3, v) * 40); if (q === lastW) return; lastW = q; const t = ac.currentTime; wind.gain.setTargetAtTime(Math.min(0.07, v * 0.03), t, 0.1); if (amb) amb.wf.frequency.setTargetAtTime(450 + Math.min(3, v) * 450, t, 0.1); },
};

export function syncSnd() { const b = $('#snd'); if (!b) return; b.textContent = Sfx.on ? 'Sound on' : 'Sound off'; b.setAttribute('aria-pressed', String(Sfx.on)); }
export function setSound(v) { Sfx.set(v); syncSnd(); if (v) Sfx.chime(); }
$('#snd')?.addEventListener('click', () => setSound(!Sfx.on));
document.addEventListener('click', (e) => { if (Sfx.on && e.target.closest && e.target.closest('button,a.btn,.nl,.qk a')) Sfx.click(); });
document.addEventListener('pointerover', (e) => { if (Sfx.on && e.target.closest && e.target.closest('.btn,.nl,.sbtn,.qs button,.mrow,.skin button,.qk a,.qk button,#menu a,.tl,.chip')) Sfx.hover(); });
