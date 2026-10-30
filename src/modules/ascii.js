import { RAMP, measureRows, rasterText, hash, fitCanvas, ASPECT } from './ascii-core.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * AsciiArt: text rendered as characters on a canvas.
 * - Interior cells shimmer between dense glyphs.
 * - Pointer "heats" cells: they scramble through the ramp + turn accent colour, then settle back.
 * - A scanner wave sweeps across periodically (the "signal").
 * - Loop only runs while visible (IntersectionObserver).
 */
export class AsciiArt {
  constructor(canvas, { lines, cols = 100, font = 'Syne', weight = 800, widthRatio = 0.98, radius = 7, fps = 30 } = {}) {
    this.canvas = canvas;
    this.opts = { lines, cols, font, weight, widthRatio, radius, fps };
    this.heat = null;
    this.pointer = { x: -999, y: -999, on: false };
    this.visible = false;
    this.last = 0;
    this.build();
    this.bind();
  }

  build() {
    const { lines, cols, font, weight, widthRatio } = this.opts;
    this.rows = measureRows({ lines, cols, font, weight, widthRatio });
    this.grid = rasterText({ lines, cols, rows: this.rows, font, weight, widthRatio });
    this.heat = new Float32Array(cols * this.rows);
    this.resize();
  }

  resize() {
    const m = fitCanvas(this.canvas, this.opts.cols, this.rows);
    Object.assign(this, m);
    this.fontPx = Math.round(this.cw * 1.32 * 10) / 10;
    this.draw(performance.now());
  }

  bind() {
    const c = this.canvas;
    this.onMove = (e) => {
      const r = c.getBoundingClientRect();
      this.pointer.x = ((e.clientX - r.left) / r.width) * this.opts.cols;
      this.pointer.y = ((e.clientY - r.top) / r.height) * this.rows;
      this.pointer.on = true;
    };
    this.onLeave = () => { this.pointer.on = false; };
    c.addEventListener('pointermove', this.onMove, { passive: true });
    c.addEventListener('pointerleave', this.onLeave, { passive: true });
    // Also react when the pointer is over the parent link/panel
    const host = c.closest('a, .archive__panel') || c.parentElement;
    if (host && host !== c) {
      host.addEventListener('pointermove', this.onMove, { passive: true });
      host.addEventListener('pointerleave', this.onLeave, { passive: true });
      this.host = host;
    }
    this.ro = new ResizeObserver(() => { if (Math.abs(c.clientWidth - this.w) > 1) this.resize(); });
    this.ro.observe(c);
    this.io = new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      if (this.visible) this.loop();
    }, { rootMargin: '100px' });
    this.io.observe(c);
  }

  loop = () => {
    if (!this.visible || reduced()) return;
    const now = performance.now();
    if (now - this.last >= 1000 / this.opts.fps) { this.last = now; this.draw(now); }
    requestAnimationFrame(this.loop);
  };

  draw(now) {
    const { ctx, cw, ch, grid, heat } = this;
    const { cols, radius } = this.opts;
    const rows = this.rows;
    const t = now / 1000;
    const cs = getComputedStyle(this.canvas);
    const base = cs.color || '#ebe8de';
    const accent = cs.getPropertyValue('--accent').trim() || '#ff4a1c';
    const L = RAMP.length - 1;
    const animate = !reduced();
    const px = this.pointer.x, py = this.pointer.y, on = this.pointer.on && animate;
    const scan = ((t * 0.18) % 1.5) * cols - cols * 0.1;

    ctx.clearRect(0, 0, this.w, this.h);
    ctx.font = `700 ${this.fontPx}px "Martian Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const hot = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        let b = grid[i];
        let h = heat[i] * 0.88;
        if (animate) {
          if (on) {
            const dx = x - px, dy = (y - py) * ASPECT;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < radius) h = Math.max(h, 1 - d / radius);
          }
          const sd = Math.abs(x - scan);
          if (sd < 2.2) h = Math.max(h, 0.55 * (1 - sd / 2.2) * (b > 0.04 ? 1 : 0.25));
        }
        heat[i] = h < 0.03 ? 0 : h;
        if (b < 0.04 && h < 0.12) continue;

        let idx = Math.min(L, Math.floor(b * L + 0.5));
        let ch_;
        if (h > 0.08) {
          // scramble: random glyph, density loosely follows heat
          const r = hash(i * 31 + Math.floor(t * 24));
          const k = Math.min(L, Math.max(1, Math.floor(r * (2 + h * L))));
          ch_ = RAMP[b < 0.04 ? Math.min(k, 3) : k];
        } else if (animate && idx >= L - 2) {
          ch_ = RAMP[L - 2 + Math.floor((hash(i) * 3 + t * 0.9) % 3)];
        } else {
          ch_ = RAMP[idx];
        }
        if (ch_ === ' ') continue;
        const cx = x * cw + cw / 2, cy = y * ch + ch / 2;
        if (h > 0.5) { hot.push(ch_, cx, cy); continue; }
        ctx.globalAlpha = b < 0.04 ? 0.6 : 0.55 + b * 0.45;
        ctx.fillStyle = base;
        ctx.fillText(ch_, cx, cy);
      }
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = accent;
    for (let k = 0; k < hot.length; k += 3) ctx.fillText(hot[k], hot[k + 1], hot[k + 2]);
  }

  destroy() {
    this.visible = false;
    this.ro?.disconnect(); this.io?.disconnect();
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerleave', this.onLeave);
    this.host?.removeEventListener('pointermove', this.onMove);
    this.host?.removeEventListener('pointerleave', this.onLeave);
  }
}

/** Create AsciiArt lazily: only when a <canvas data-ascii data-lines="A|B" data-cols="100"> nears the viewport. */
export function initAscii() {
  const arts = [];
  const make = (c) => {
    const lines = (c.dataset.lines || '').split('|').filter(Boolean);
    if (!lines.length) return;
    arts.push(new AsciiArt(c, { lines, cols: +c.dataset.cols || 100, fps: document.documentElement.classList.contains('is-lite') ? 15 : 30 }));
  };
  const canvases = [...document.querySelectorAll('canvas[data-ascii]')];
  if (!('IntersectionObserver' in window)) { canvases.forEach(make); return arts; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      (window.requestIdleCallback || ((f) => setTimeout(f, 1)))(() => make(e.target));
    });
  }, { rootMargin: '1200px 0px' });
  canvases.forEach((c) => io.observe(c));
  return arts;
}

/** Hero background: a quiet grid of tiny dots; circles swell + change colour around the pointer. */
export function initHeroField(canvas) {
  const hero = canvas.parentElement;
  const TAU = Math.PI * 2;
  let w, h, cell, cols, rows, heat, dpr, raf = 0, visible = false, last = 0;
  const p = { x: -999, y: -999 };
  const ctx = canvas.getContext('2d');

  const paintStatic = () => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(235,232,222,0.13)';
    ctx.beginPath();
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { const cx = x * cell + cell / 2, cy = y * cell + cell / 2; ctx.moveTo(cx + 1.1, cy); ctx.arc(cx, cy, 1.1, 0, TAU); }
    ctx.fill();
  };

  const size = () => {
    w = canvas.clientWidth; h = canvas.clientHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cell = w < 700 ? 20 : 26;
    cols = Math.ceil(w / cell); rows = Math.ceil(h / cell);
    heat = new Float32Array(cols * rows);
    paintStatic();
  };

  const move = (e) => {
    const r = hero.getBoundingClientRect();
    p.x = (e.clientX - r.left) / cell; p.y = (e.clientY - r.top) / cell;
  };

  const frame = (now) => {
    if (!visible) return;
    raf = requestAnimationFrame(frame);
    if (now - last < 33) return;
    last = now;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(235,232,222,0.13)'; // keep the resting dot grid
    ctx.beginPath();
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { const cx = x * cell + cell / 2, cy = y * cell + cell / 2; ctx.moveTo(cx + 1.1, cy); ctx.arc(cx, cy, 1.1, 0, TAU); }
    ctx.fill();

    for (let n = 0; n < 5; n++) heat[(Math.random() * heat.length) | 0] = 0.7; // idle sparks
    const R = 6;
    const x0 = Math.max(0, Math.floor(p.x - R)), x1 = Math.min(cols - 1, Math.ceil(p.x + R));
    const y0 = Math.max(0, Math.floor(p.y - R)), y1 = Math.min(rows - 1, Math.ceil(p.y + R));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < R) { const i = y * cols + x; heat[i] = Math.max(heat[i], 1 - d / R); }
    }
    // three colour groups, one path each: white (cool), blue (warm), orange (hot)
    const groups = [[], [], []];
    for (let i = 0; i < heat.length; i++) {
      const hv = heat[i];
      if (hv < 0.05) { heat[i] = 0; continue; }
      heat[i] = hv * 0.9;
      const x = i % cols, y = (i / cols) | 0;
      groups[hv > 0.62 ? 2 : hv > 0.32 ? 1 : 0].push(x * cell + cell / 2, y * cell + cell / 2, 1.4 + hv * cell * 0.36);
    }
    [['#ebe8de', 0.5], ['#3b7bff', 0.9], ['#ff4a1c', 1]].forEach(([color, alpha], gi) => {
      const g = groups[gi]; if (!g.length) return;
      ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.beginPath();
      for (let k = 0; k < g.length; k += 3) { ctx.moveTo(g[k] + g[k + 2], g[k + 1]); ctx.arc(g[k], g[k + 1], g[k + 2], 0, TAU); }
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  };

  size();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return { destroy() {} };
  hero.addEventListener('pointermove', move, { passive: true });
  hero.addEventListener('pointerleave', () => { p.x = p.y = -999; }, { passive: true });
  new ResizeObserver(size).observe(canvas);
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    cancelAnimationFrame(raf);
    if (visible) raf = requestAnimationFrame(frame);
  }).observe(hero);
  return { destroy() { cancelAnimationFrame(raf); } };
}

/** Signal waves: <canvas data-wave>. A DOUBLE line (orange + blue) that flows; runs only while visible. */
export function initWaves() {
  const els = [...document.querySelectorAll('canvas[data-wave]')];
  if (!els.length) return;
  const reduceNow = reduced();
  const state = new Map();
  const io = new IntersectionObserver((entries) => entries.forEach((e) => state.set(e.target, e.isIntersecting)), { rootMargin: '50px' });

  const fit = (el) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = el.clientWidth, h = el.clientHeight || 32;
    el.width = Math.round(w * dpr); el.height = Math.round(h * dpr);
    const ctx = el.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    el._m = { ctx, w, h };
  };

  const render = (el, t) => {
    const { ctx, w, h } = el._m;
    const ph = parseFloat(el.dataset.phase);
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const mid = h / 2, amp = h * 0.32;
    // two lines, slightly different speed/phase = double-line signal
    [['#ff4a1c', 1.6, 0, 1], ['#3b7bff', 1.2, 1.1, 0.75]].forEach(([color, lw, off, mul]) => {
      ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath();
      for (let x = 0; x <= w; x += 3) {
        const env = 0.55 + 0.45 * Math.sin(x * 0.011 - t * 0.9 + ph);            // slow swelling envelope
        const v = Math.sin(x * 0.045 + t * 2.4 * mul + ph + off) * env + Math.sin(x * 0.13 - t * 1.7 + off) * 0.18;
        const y = mid + v * amp;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
  };

  els.forEach((el, k) => { state.set(el, false); el.dataset.phase = (k * 1.7).toFixed(2); fit(el); io.observe(el); });
  const ro = new ResizeObserver((es) => es.forEach((e) => { fit(e.target); if (reduceNow) render(e.target, 0); }));
  els.forEach((el) => ro.observe(el));
  if (reduceNow) { els.forEach((el) => render(el, 0)); return; }
  let lastT = 0;
  const tick = (now) => {
    requestAnimationFrame(tick);
    if (now - lastT < 33) return;
    lastT = now;
    els.forEach((el) => { if (state.get(el)) { if (el.clientWidth !== el._m.w) fit(el); render(el, now / 1000); } });
  };
  requestAnimationFrame(tick);
}

/** Footer ASCII links: "decode" scramble on hover, keep original art after. */
export function initDecode({ sound } = {}) {
  const SCR = '#%@*+=-:. /\\|_';
  document.querySelectorAll('[data-decode]').forEach((a) => {
    const pre = a.querySelector('pre');
    if (!pre) return;
    const original = pre.textContent;
    let timer = 0;
    const run = () => {
      if (reduced()) return;
      sound?.play('decrypt');
      clearInterval(timer);
      let step = 0;
      const total = 14;
      timer = setInterval(() => {
        step++;
        const keep = step / total;
        pre.textContent = [...original].map((c, i) => (c === '\n' || c === ' ' ? c : Math.random() < keep ? c : SCR[(Math.random() * SCR.length) | 0])).join('');
        if (step >= total) { clearInterval(timer); pre.textContent = original; }
      }, 32);
    };
    a.addEventListener('pointerenter', run);
    a.addEventListener('focus', run);
  });
}
