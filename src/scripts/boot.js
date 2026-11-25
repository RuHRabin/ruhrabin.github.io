import { $, root, reduce } from './lib.js';
import { Sfx, syncSnd } from './sfx.js';
import { loaderEngine, sampleWordmark } from './bootfx.js';

const el = $('#boot');
const off = !el || !root.classList.contains('boot') || reduce;
const WEIGHT = { fonts: 0.08, engine: 0.22, galaxy: 0.38, shaders: 0.22, sys: 0.1 };
const prog = {}, t0 = performance.now(), sr = $('#bsr');
let target = 0, shown = 0, formed = false, skipped = false, lastMark = 0, revealRes = null, fx = null, cv = !off && $('#bootfx');
let lastPts = null, lastLabel = 'Initialising';

const onMsg = (m) => {
  if (m.t === 'st') {
    shown = m.shown; formed = m.formed; const v = Math.round(shown * 100);
    if (v >= lastMark + 10) { lastMark = v - (v % 10); if (sr) sr.textContent = 'Loading ' + lastMark + '%'; if (Sfx.tick) Sfx.tick(); }
  } else if (m.t === 'reveal' && revealRes) revealRes();
};
const sizeMsg = () => ({ t: 'size', w: innerWidth, h: innerHeight, d: devicePixelRatio || 1 });

function useMainThread(canvas) {
  const eng = loaderEngine(canvas, (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }, onMsg);
  fx = { send: (m) => eng.msg(m), close: () => eng.msg({ t: 'close' }) };
}
function startFx() {
  if (typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && 'transferControlToOffscreen' in cv) {
    try {
      const src = 'const E=' + loaderEngine.toString() + ';let eng=null;onmessage=function(e){var m=e.data;if(m.t==="init")eng=E(m.cv,function(w,h){return new OffscreenCanvas(w,h)},function(r){postMessage(r)});else if(eng)eng.msg(m)};';
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' })), w = new Worker(url), oc = cv.transferControlToOffscreen();
      w.onmessage = (e) => onMsg(e.data);
      w.onerror = () => { // worker blocked or crashed: swap in a fresh canvas and replay state on the main thread
        w.terminate(); const n = cv.cloneNode(false); cv.replaceWith(n); cv = n; useMainThread(n);
        fx.send(sizeMsg()); if (lastPts) fx.send(lastPts); fx.send({ t: 'label', v: lastLabel }); fx.send({ t: 'p', v: target });
      };
      w.postMessage({ t: 'init', cv: oc }, [oc]);
      fx = { send: (m, tr) => w.postMessage(m, tr || []), close: () => { w.terminate(); URL.revokeObjectURL(url); } };
      return;
    } catch (e) { /* fall through to the main thread */ }
  }
  useMainThread(cv);
}
async function sendWordmark() {
  try {
    const s = await sampleWordmark(innerWidth, innerHeight), msg = { t: 'pts', pts: s.pts, img: s.img, iw: s.iw, ih: s.ih, bwf: s.bwf, bwmax: s.bwmax };
    lastPts = { ...msg, pts: s.pts.slice() }; fx.send(msg, [s.pts.buffer, ...(typeof ImageBitmap !== 'undefined' && s.img instanceof ImageBitmap ? [s.img] : [])]);
  } catch (e) { console.warn('wordmark sampling failed', e); }
}

if (!off) {
  el.classList.add('on'); startFx(); fx.send(sizeMsg()); sendWordmark();
  let rt = 0, portrait = innerWidth < innerHeight * 0.9;
  addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { fx.send(sizeMsg()); const p = innerWidth < innerHeight * 0.9; if (p !== portrait) { portrait = p; sendWordmark(); } }, 120); });
  const cb = $('#bsnd'); if (cb) cb.addEventListener('change', () => { Sfx.set(cb.checked); syncSnd(); if (cb.checked) Sfx.power(); });
  const skip = () => { skipped = true; fx.send({ t: 'skip' }); };
  const sk = $('#bskip'); if (sk) sk.addEventListener('click', skip);
  document.addEventListener('keydown', (e) => { if (root.classList.contains('boot') && (e.key === 'Escape' || e.key === 'Enter')) skip(); });
  setTimeout(() => root.classList.remove('boot'), 25000); // safety net
}
const until = (fn) => new Promise((res) => { (function w() { if (fn()) res(); else setTimeout(w, 40); })(); });
const recompute = () => { let t = 0; for (const k in WEIGHT) t += WEIGHT[k] * (prog[k] || 0); target = Math.max(target, t); if (fx) fx.send({ t: 'p', v: target }); };

export const Loader = {
  begin(id, text) { prog[id] = prog[id] || 0; if (off || !fx) return; lastLabel = text; fx.send({ t: 'label', v: text }); },
  progress(id, f) { prog[id] = Math.max(prog[id] || 0, Math.min(1, f)); recompute(); },
  done(id) { prog[id] = 1; recompute(); },
  async finish() {
    if (off) { root.classList.remove('boot'); if (el) el.remove(); return; }
    for (const k in WEIGHT) prog[k] = 1; recompute(); lastLabel = 'Ready'; fx.send({ t: 'label', v: 'Ready' });
    await until(() => shown >= 0.995 && formed && (skipped || performance.now() - t0 > 3400)); // let the wordmark finish assembling, even on a fast connection
    Sfx.boom && Sfx.boom();
    const revealed = new Promise((res) => { revealRes = res; setTimeout(res, 3500); });
    fx.send({ t: 'ignite', skip: skipped }); await revealed; // resolves mid-flash, when the warp is at full speed
    Sfx.chime(); root.classList.remove('boot'); el.classList.add('out'); // reveal the scene under the fading overlay; the caller starts the 3D jump now
    setTimeout(() => { fx.close(); el.remove(); }, 1200);
  },
};
