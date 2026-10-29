// Loader: ONLY a loading screen (no page transitions elsewhere).
// - Progress is REAL: fonts + window load + ASCII raster are tracked.
// - Visual: noise characters resolve into the name as progress rises.
// - Shown once per session. The "Enter" click also unlocks browser audio.
import { RAMP, ASPECT, measureRows, rasterText, hash } from './ascii-core.js';

const MIN_MS = 2200;
const MAX_MS = 5000;
const STATUS = [
  [0, 'BOOTING TRANSMITTER'], [20, 'LOADING TYPEFACES'], [45, 'TUNING FREQUENCY'],
  [70, 'RENDERING SIGNAL'], [92, 'LOCK ACQUIRED'], [100, 'SIGNAL LOCKED']
];

const FONT_LOADS = ['800 120px "Syne"', '500 14px "Martian Mono"', '700 14px "Martian Mono"', 'italic 400 40px "Instrument Serif"'];

export async function runLoader({ sound, lines, tasks: extra = [] }) {
  const root = document.getElementById('loader');
  const html = document.documentElement;
  const finishFonts = () => document.fonts.ready.catch(() => {});

  if (!root || html.classList.contains('is-seen')) {
    await Promise.all(FONT_LOADS.map((f) => document.fonts.load(f).catch(() => {})));
    await finishFonts();
    root?.remove();
    html.classList.remove('is-loading');
    return { skipped: true };
  }

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = root.querySelector('.loader__canvas');
  const ctx = canvas.getContext('2d');
  const countEl = root.querySelector('[data-loader-count]');
  const statusEl = root.querySelector('[data-loader-status]');
  const digits = countEl.querySelectorAll('b');
  let lastPct = -1;
  const enterBox = root.querySelector('[data-loader-enter]');

  // ---------- real progress manager ----------
  const tasks = [];
  const add = (weight, p) => { const t = { weight, done: false }; tasks.push(t); p.catch(() => {}).finally(() => { t.done = true; }); };
  FONT_LOADS.forEach((f) => add(15, document.fonts.load(f)));
  add(15, new Promise((res) => (document.readyState === 'complete' ? res() : addEventListener('load', res, { once: true }))));
  add(25, finishFonts().then(() => new Promise((r) => requestAnimationFrame(() => r()))));
  extra.forEach((p) => add(30 / extra.length, p)); // lazy chunks (GSAP, Lenis, ASCII) load in the background WHILE the loader plays
  const realProgress = () => { const tot = tasks.reduce((a, t) => a + t.weight, 0); return tasks.reduce((a, t) => a + (t.done ? t.weight : 0), 0) / tot; };

  // ---------- grid ----------
  let cols, rows, cw, ch, mask, thresh, cur, resolvedAt, dpr, fontPx;
  const build = () => {
    const w = innerWidth, h = innerHeight;
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.max(48, Math.min(150, Math.floor(w / (w < 700 ? 9 : 12))));
    cw = w / cols; ch = cw * ASPECT; rows = Math.ceil(h / ch);
    fontPx = cw * 1.32;
    // fit the name into the grid (stacked lines), centered
    const nameCols = Math.round(cols * (w < 700 ? 0.9 : 0.6));
    const nameRows = measureRows({ lines, cols: nameCols, widthRatio: 0.98 });
    const r = rasterText({ lines, cols: nameCols, rows: nameRows, widthRatio: 0.98 });
    mask = new Float32Array(cols * rows);
    const ox = Math.floor((cols - nameCols) / 2), oy = Math.floor((rows - nameRows) / 2);
    for (let y = 0; y < nameRows; y++) for (let x = 0; x < nameCols; x++) {
      const X = x + ox, Y = y + oy;
      if (X >= 0 && X < cols && Y >= 0 && Y < rows) mask[Y * cols + X] = r[y * nameCols + x];
    }
    thresh = new Float32Array(cols * rows);
    cur = new Uint8Array(cols * rows);
    resolvedAt = new Float32Array(cols * rows).fill(-1);
    for (let i = 0; i < thresh.length; i++) { thresh[i] = 0.7 * hash(i + 7) + 0.3 * ((i % cols) / cols); cur[i] = 1 + ((Math.random() * 4) | 0); }
  };
  build();
  addEventListener('resize', build);

  // ---------- loop ----------
  const t0 = performance.now();
  let shown = 0, exitT = 0, exitStart = 0, done = false, entered = false, raf = 0, lastStatus = -1, lastFrame = 0;
  const L = RAMP.length - 1;

  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    if (now - lastFrame < 32) return; // ~30fps keeps the main thread free for downloads
    lastFrame = now;
    if (exitStart) exitT = Math.min(1, ((now - exitStart) / 800) ** 2);
    const el = now - t0;
    const forced = el > MAX_MS;
    const target = forced ? 1 : Math.min(realProgress(), el / MIN_MS);
    shown += (target - shown) * (forced ? 0.2 : 0.09);
    if (target >= 1 && shown > 0.995) shown = 1;
    const pct = Math.round(shown * 100);
    if (pct !== lastPct) { lastPct = pct; const d = String(pct).padStart(3, '0'); for (let k = 0; k < 3; k++) if (digits[k].textContent !== d[k]) digits[k].textContent = d[k]; }
    let si = 0; STATUS.forEach((s, i) => { if (pct >= s[0]) si = i; });
    if (si !== lastStatus) { lastStatus = si; statusEl.textContent = STATUS[si][1]; }

    if (shown >= 1 && !done) {
      done = true;
      enterBox.hidden = false;
      enterBox.animate([{ opacity: 0, transform: 'translate(-50%, 16px)' }, { opacity: 1, transform: 'translate(-50%, 0)' }], { duration: 800, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' });
      enterBox.querySelector('button').focus({ preventScroll: true });
    }

    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.font = `700 ${fontPx}px "Martian Mono", monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const p = shown * 1.12;
    for (let y = 0; y < rows; y++) {
      const rowGone = exitT > 0 && (y / rows) < exitT * 1.2 - 0.1 * hash(y);
      if (rowGone) continue;
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const b = mask[i];
        const inMask = b > 0.04;
        const resolved = p > thresh[i];
        const cx = x * cw + cw / 2, cy = y * ch + ch / 2;
        if (resolved && inMask) {
          if (resolvedAt[i] < 0) resolvedAt[i] = now;
          const fresh = now - resolvedAt[i] < 220;
          ctx.fillStyle = fresh ? '#ff4a1c' : '#ebe8de';
          ctx.globalAlpha = 0.5 + b * 0.5;
          ctx.fillText(RAMP[Math.min(L, Math.floor(b * L + 0.5))], cx, cy);
        } else {
          if (!reduced && hash(i * 13 + ((now / 70) | 0)) < 0.16) cur[i] = 1 + ((Math.random() * 5) | 0);
          const fade = inMask ? 0.38 : 0.16 * (1 - shown) + 0.03;
          if (hash(i) > (inMask ? 0.2 : 0.55 - shown * 0.4)) continue;
          ctx.fillStyle = '#ebe8de';
          ctx.globalAlpha = fade;
          ctx.fillText(RAMP[cur[i]], cx, cy);
        }
      }
    }
    ctx.globalAlpha = 1;
  };
  raf = requestAnimationFrame(frame);

  // ---------- wait for the user's choice ----------
  const choice = await new Promise((resolve) => {
    enterBox.addEventListener('click', (e) => {
      const b = e.target.closest('[data-enter]');
      if (b) resolve(b.dataset.enter);
    });
  });
  entered = true;

  if (choice === 'sound') { sound.enable(true); sound.play('rise'); sound.play('enter'); }
  else sound.disable();

  try { sessionStorage.setItem('sig:seen', '1'); } catch { /* ignore */ }

  // ---------- exit: characters wipe away, then the panel lifts (Web Animations API, no library) ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  enterBox.animate([{ opacity: 1 }, { opacity: 0, transform: 'translate(-50%, -12px)' }], { duration: 350, easing: 'ease-in', fill: 'forwards' });
  root.querySelector('.loader__hud').animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' });
  exitStart = performance.now();
  await sleep(reduced ? 10 : 650);
  const lift = root.animate([{ clipPath: 'inset(0 0 0 0)' }, { clipPath: 'inset(0 0 100% 0)' }], { duration: reduced ? 10 : 900, easing: 'cubic-bezier(.87,0,.13,1)', fill: 'forwards' });
  setTimeout(() => html.classList.remove('is-loading'), reduced ? 0 : 300); // hero starts under the lifting panel
  await lift.finished;
  cancelAnimationFrame(raf);
  removeEventListener('resize', build);
  root.remove();
  return { skipped: false, sound: choice === 'sound' };
}
