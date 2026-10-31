// Background field: a quiet starfield you "fly through". Scrolling pushes it faster (warp streaks);
// the pointer shifts the vanishing point. Reads colours from the active theme. Pauses when hidden.
export function initBg({ lite = false } = {}) {
  const c = document.querySelector('[data-bg]');
  if (!c) return { push() {} };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ctx = c.getContext('2d');
  const N = lite ? 0 : innerWidth < 700 ? 42 : 96;
  let w = 0, h = 0, dpr = 1, fg = '#dbe6f0', a1 = '#3ddc97', a2 = '#59c8ff', light = false;
  const P = Array.from({ length: N }, () => ({ x: (Math.random() * 2 - 1), y: (Math.random() * 2 - 1), z: Math.random() * 0.98 + 0.02, k: Math.random() }));
  let vel = 0, boost = 0, px = 0, py = 0, tx = 0, ty = 0, last = 0, running = false;

  const readColors = () => {
    const cs = getComputedStyle(document.documentElement);
    fg = cs.getPropertyValue('--fg').trim() || fg; a1 = cs.getPropertyValue('--accent').trim() || a1; a2 = cs.getPropertyValue('--accent-2').trim() || a2;
    light = document.documentElement.dataset.theme === 'mac';
  };
  const resize = () => {
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    w = innerWidth; h = innerHeight;
    c.width = w * dpr; c.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!running) frame(performance.now(), true);
  };
  const frame = (now, still) => {
    const dt = Math.min(48, now - last || 16); last = now;
    boost += (Math.abs(vel) - boost) * 0.08; vel *= 0.9;
    px += (tx - px) * 0.05; py += (ty - py) * 0.05;
    const speed = (reduced || still ? 0 : 0.00022 * dt) * (1 + boost * 0.9);
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2 + px * 40, cy = h * 0.46 + py * 30, f = Math.max(w, h) * 0.62;
    ctx.lineCap = 'round';
    for (let i = 0; i < N; i++) {
      const p = P[i];
      const zPrev = p.z;
      p.z -= speed * (0.4 + p.k);
      if (p.z < 0.03) { p.z = 1; p.x = Math.random() * 2 - 1; p.y = Math.random() * 2 - 1; continue; }
      const sx = cx + (p.x / p.z) * f * 0.5, sy = cy + (p.y / p.z) * f * 0.5;
      if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) { p.z = 1; p.x = Math.random() * 2 - 1; p.y = Math.random() * 2 - 1; continue; }
      const depth = 1 - p.z;
      const size = 0.5 + depth * 2.1;
      ctx.globalAlpha = Math.min(1, depth * 1.5) * (light ? 0.55 : 0.8);
      ctx.strokeStyle = ctx.fillStyle = p.k > 0.86 ? a1 : p.k > 0.7 ? a2 : fg;
      if (boost > 1.2) {
        const sx0 = cx + (p.x / zPrev) * f * 0.5, sy0 = cy + (p.y / zPrev) * f * 0.5;
        const L = Math.min(1, boost / 14);
        ctx.lineWidth = size * 0.9; ctx.beginPath(); ctx.moveTo(sx - (sx - sx0) * (1 + L * 14), sy - (sy - sy0) * (1 + L * 14)); ctx.lineTo(sx, sy); ctx.stroke();
      } else { ctx.beginPath(); ctx.arc(sx, sy, size, 0, 6.2832); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  };
  const loop = (now) => {
    if (!running) return;
    requestAnimationFrame(loop);
    if (now - last < 30) return; // ~30fps is plenty for a soft background
    frame(now);
  };
  const start = () => { if (running || !N || reduced) return; running = true; last = performance.now(); requestAnimationFrame(loop); };
  const stop = () => { running = false; };

  readColors(); resize();
  addEventListener('resize', resize);
  addEventListener('sig:theme', () => { readColors(); if (!running) frame(performance.now(), true); });
  addEventListener('pointermove', (e) => { tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5; }, { passive: true });
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  start();
  return { push(v) { vel = Math.max(-30, Math.min(30, v)); }, start, stop };
}
