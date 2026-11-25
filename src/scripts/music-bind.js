// Connects the score engine to the page: sound toggle, boot reveal, volume and the terminal / palette commands.
import { SC, state, root } from './lib.js';
import { audioHandle } from './sfx.js';
import { createMusic } from './music.js';

let m = null, wanted = true, vol = 0.8, soundOn = false;
function ensure() {
  const h = audioHandle(); if (!h) return null;
  if (!m || m.ac !== h.ac) { m = createMusic(h.ac, h.out, h.rv, () => ({ p: SC.p, vel: Math.min(SC.vel, 4), warp: state.warp })); m.volume(vol); }
  if (h.samples.music && h.samples.music[0]) m.useSample(h.samples.music[0]);
  return m;
}
function sync() { const mm = ensure(); if (!mm) return; if (soundOn && wanted) mm.start(!root.classList.contains('boot')); else mm.stop(); }
addEventListener('sfx:toggle', (e) => { soundOn = !!e.detail; sync(); });
addEventListener('boot:done', () => { if (m) m.open(); });
addEventListener('music:set', (e) => {
  const d = e.detail || {};
  if (typeof d.on === 'boolean') wanted = d.on;
  if (typeof d.volume === 'number') { vol = Math.max(0, Math.min(1, d.volume)); if (m) m.volume(vol); }
  sync();
});
window.__musicRunning = () => !!(m && m.running); // small hook for tests
