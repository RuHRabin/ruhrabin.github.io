import { reduce, state } from './lib.js';
import './sfx.js';
import './music-bind.js';
import './ui.js';
import './windows.js';
import './ascii.js';
import './terminal.js';
import './sig.js';
import './palette.js';
import './smooth.js';
import './scroll.js';
import { Loader } from './boot.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function webgl2() { try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; } }
const conn = navigator.connection || {};
const want3d = !reduce && !conn.saveData && (navigator.deviceMemory || 8) >= 2 && webgl2();

(async function start() {
  let scene = null;
  const enginePromise = want3d ? import('./scene3d.js') : null;
  if (enginePromise) enginePromise.catch(() => {});
  Loader.begin('fonts', 'Loading typefaces');
  await Promise.race([document.fonts ? document.fonts.ready : 0, sleep(1800)]);
  Loader.done('fonts');
  if (want3d) {
    try {
      Loader.begin('engine', 'Loading 3D engine');
      const m = await enginePromise; Loader.done('engine');
      Loader.begin('galaxy', 'Baking the Milky Way');
      await m.init((p) => Loader.progress('galaxy', p)); Loader.done('galaxy');
      Loader.begin('shaders', 'Compiling shaders');
      await m.warmup(); Loader.done('shaders');
      if (m.ok()) scene = m; else throw new Error('shader compile failed');
    } catch (e) { console.warn('3D disabled, using 2D space:', e); const gl = document.getElementById('gl'); if (gl) gl.remove(); }
  }
  Loader.begin('sys', 'Starting systems');
  if (!scene) await import('./space.js');
  Loader.done('sys');
  await Loader.finish();
  if (scene) scene.jump(); else state.warp = 1;
  window.dispatchEvent(new Event('boot:done'));
})();
