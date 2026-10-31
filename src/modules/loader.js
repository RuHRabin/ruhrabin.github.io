// Loader: "RR BOOT MANAGER" (dual boot). ONLY a loading screen.
// - Progress is REAL: fonts + window load + lazy chunks are tracked; a boot log fills as it rises.
// - At 100% you pick the theme to boot into: ARCH LINUX (dark terminal) or macOS (light glass), plus sound.
//   That click also unlocks browser audio. Shown once per session.
import { theme } from './theme.js';

const MIN_MS = 2400;
const MAX_MS = 5200;
const STATUS = [[0, 'BOOTING'], [22, 'LOADING TYPEFACES'], [46, 'STARTING MOTION ENGINE'], [72, 'TUNING SIGNAL'], [92, 'LOCK ACQUIRED'], [100, 'AWAITING INPUT']];
const LOG = [
  [0, 'Starting rr-kernel'], [8, 'Mounting /home/rabin'], [18, 'Loading typefaces'], [30, 'Linking GitHub archive'],
  [42, 'Starting motion engine'], [54, 'Tuning audio synth'], [66, 'Waking SIG assistant'], [78, 'Compiling themes: linux, macOS'],
  [90, 'Checking dual-boot menu'], [98, 'Handing control to user']
];
const FONT_LOADS = ['800 120px "JetBrains Mono"', '500 14px "JetBrains Mono"', '600 16px "Inter"', 'italic 400 40px "Instrument Serif"'];
const CIRC = 565.49;

export async function runLoader({ sound, tasks: extra = [] }) {
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
  const ring = root.querySelector('[data-ring]');
  const countEl = root.querySelector('[data-loader-count]');
  const statusEl = root.querySelector('[data-loader-status]');
  const logEl = root.querySelector('[data-loader-log]');
  const clockEl = root.querySelector('[data-loader-clock]');
  const menu = root.querySelector('[data-loader-enter]');
  const snd = root.querySelector('[data-snd]');
  const opts = [...menu.querySelectorAll('.os')];
  opts.find((o) => o.dataset.os === theme.get())?.classList.add('is-default');

  // ---------- real progress manager ----------
  const tasks = [];
  const add = (weight, p) => { const t = { weight, done: false }; tasks.push(t); p.catch(() => {}).finally(() => { t.done = true; }); };
  FONT_LOADS.forEach((f) => add(15, document.fonts.load(f)));
  add(15, new Promise((res) => (document.readyState === 'complete' ? res() : addEventListener('load', res, { once: true }))));
  add(25, finishFonts().then(() => new Promise((r) => requestAnimationFrame(() => r()))));
  extra.forEach((p) => add(30 / extra.length, p)); // lazy chunks load in the background WHILE the loader plays
  const realProgress = () => { const tot = tasks.reduce((a, t) => a + t.weight, 0); return tasks.reduce((a, t) => a + (t.done ? t.weight : 0), 0) / tot; };

  // ---------- loop (DOM only: a few attribute writes per frame, no canvas) ----------
  const t0 = performance.now();
  let shown = 0, done = false, raf = 0, lastPct = -1, lastStatus = -1, logIdx = 0, lastClock = 0;
  const pad2 = (n) => String(n).padStart(2, '0');
  const addLog = (text) => {
    const p = document.createElement('p');
    p.innerHTML = '<b>[ OK ]</b>';
    p.append(text);
    logEl.appendChild(p);
    while (logEl.children.length > 9) logEl.firstChild.remove();
  };

  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const el = now - t0;
    const forced = el > MAX_MS;
    const target = forced ? 1 : Math.min(realProgress(), el / MIN_MS);
    shown += (target - shown) * (forced ? 0.2 : 0.09);
    if (target >= 1 && shown > 0.995) shown = 1;
    const pct = Math.round(shown * 100);
    if (pct !== lastPct) {
      lastPct = pct;
      countEl.textContent = String(pct).padStart(3, '0');
      ring.setAttribute('stroke-dashoffset', (CIRC * (1 - shown)).toFixed(1));
      while (logIdx < LOG.length && pct >= LOG[logIdx][0]) addLog(LOG[logIdx++][1]);
      let si = 0; STATUS.forEach((s, i) => { if (pct >= s[0]) si = i; });
      if (si !== lastStatus) { lastStatus = si; statusEl.textContent = STATUS[si][1]; }
    }
    if (now - lastClock > 500) { lastClock = now; const d = new Date(); clockEl.textContent = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; }

    if (shown >= 1 && !done) {
      done = true;
      root.classList.add('is-ready');
      menu.hidden = false;
      menu.animate([{ opacity: 0, transform: 'translate(-50%, calc(-50% + 18px))' }, { opacity: 1, transform: 'translate(-50%, -50%)' }], { duration: 900, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' });
      (opts.find((o) => o.classList.contains('is-default')) || opts[0]).focus({ preventScroll: true });
    }
  };
  raf = requestAnimationFrame(frame);

  // ---------- wait for the user's choice ----------
  menu.addEventListener('keydown', (e) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const i = opts.indexOf(document.activeElement);
    opts[(i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : opts.length - 1)) % opts.length].focus();
  });
  const choice = await new Promise((resolve) => {
    menu.addEventListener('click', (e) => { const b = e.target.closest('[data-os]'); if (b) resolve(b.dataset.os); });
  });

  theme.apply(choice, true);                                       // page behind the loader switches instantly
  if (snd.checked) { sound.enable(true); sound.play('enter'); } else sound.disable();
  try { sessionStorage.setItem('sig:seen', '1'); } catch { /* ignore */ }

  // ---------- exit: CRT power-off (Linux) / soft zoom-fade (macOS), via Web Animations API ----------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  menu.animate([{ opacity: 1 }, { opacity: 0, transform: 'translate(-50%, calc(-50% - 14px))' }], { duration: 320, easing: 'ease-in', fill: 'forwards' });
  setTimeout(() => html.classList.remove('is-loading'), reduced ? 0 : 380); // hero starts under the closing screen
  let out;
  if (reduced) out = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 10, fill: 'forwards' });
  else if (choice === 'linux') {
    await sleep(220);
    out = root.animate([
      { clipPath: 'inset(0% 0% 0% 0%)', filter: 'brightness(1)' },
      { clipPath: 'inset(48.5% 0% 48.5% 0%)', filter: 'brightness(2.4)', offset: 0.5 },
      { clipPath: 'inset(49.7% 40% 49.7% 40%)', filter: 'brightness(3)', offset: 0.8 },
      { clipPath: 'inset(50% 50% 50% 50%)', filter: 'brightness(3)' }
    ], { duration: 950, easing: 'cubic-bezier(.7,0,.3,1)', fill: 'forwards' });
  } else {
    await sleep(120);
    out = root.animate([
      { opacity: 1, transform: 'scale(1)', filter: 'blur(0px) brightness(1)' },
      { opacity: 1, filter: 'blur(0px) brightness(2.6)', offset: 0.35 },
      { opacity: 0, transform: 'scale(1.06)', filter: 'blur(14px) brightness(3)' }
    ], { duration: 900, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
  }
  await out.finished;
  cancelAnimationFrame(raf);
  root.remove();
  return { skipped: false, sound: snd.checked };
}
