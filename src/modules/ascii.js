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

/** Hero background: sparse character field that lights up around the pointer. */
export function initHeroField(canvas) {
  const hero = canvas.parentElement;
  const GLY = '.:-=+*#';
  let w, h, cw, ch, cols, rows, heat, dpr, raf = 0, visible = false, last = 0;
  const p = { x: -999, y: -999 };
  const ctx = canvas.getContext('2d');

  const size = () => {
    w = canvas.clientWidth; h = canvas.clientHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cw = w < 700 ? 18 : 22; ch = cw * 1.6;
    cols = Math.ceil(w / cw); rows = Math.ceil(h / ch);
    heat = new Float32Array(cols * rows);
    paintStatic();
  };

  const paintStatic = () => {
    ctx.clearRect(0, 0, w, h);
    ctx.font = `500 ${cw * 0.7}px "Martian Mono", monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(235,232,222,0.10)';
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) ctx.fillText('+', x * cw + cw / 2, y * ch + ch / 2);
  };

  const move = (e) => {
    const r = hero.getBoundingClientRect();
    p.x = (e.clientX - r.left) / cw; p.y = (e.clientY - r.top) / ch;
  };

  const frame = (now) => {
    if (!visible) return;
    raf = requestAnimationFrame(frame);
    if (now - last < 33) return;
    last = now;
    ctx.clearRect(0, 0, w, h);
    ctx.font = `600 ${cw * 0.8}px "Martian Mono", monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // idle sparks
    for (let n = 0; n < 6; n++) heat[(Math.random() * heat.length) | 0] = 0.55;
    const R = 7;
    const x0 = Math.max(0, Math.floor(p.x - R)), x1 = Math.min(cols - 1, Math.ceil(p.x + R));
    const y0 = Math.max(0, Math.floor(p.y - R)), y1 = Math.min(rows - 1, Math.ceil(p.y + R));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - p.x, (y - p.y) * 1.6);
      if (d < R) { const i = y * cols + x; heat[i] = Math.max(heat[i], 1 - d / R); }
    }
    for (let i = 0; i < heat.length; i++) {
      const hv = heat[i];
      if (hv < 0.04) { heat[i] = 0; continue; }
      heat[i] = hv * 0.9;
      const x = i % cols, y = (i / cols) | 0;
      ctx.fillStyle = hv > 0.6 ? '#ff4a1c' : `rgba(235,232,222,${0.15 + hv * 0.6})`;
      ctx.fillText(GLY[Math.min(GLY.length - 1, (hv * GLY.length) | 0)], x * cw + cw / 2, y * ch + ch / 2);
    }
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

/** Animated ASCII waveform lines: <pre data-wave>. Runs only while visible. */
export function initWaves() {
  const els = [...document.querySelectorAll('[data-wave]')];
  if (!els.length) return;
  const chars = ' .:-=+*#*+=-:.';
  const reduceNow = reduced();
  const state = new Map();
  const io = new IntersectionObserver((entries) => entries.forEach((e) => state.set(e.target, e.isIntersecting)), { rootMargin: '50px' });
  els.forEach((el, k) => { state.set(el, false); el.dataset.phase = (k * 1.7).toFixed(2); io.observe(el); });

  const render = (el, t) => {
    const n = Math.max(24, Math.floor(el.clientWidth / 6.6));
    const ph = parseFloat(el.dataset.phase);
    let s = '';
    for (let i = 0; i < n; i++) {
      const v = Math.sin(i * 0.28 + t * 2.2 + ph) * 0.5 + Math.sin(i * 0.11 - t * 1.3) * 0.35 + Math.sin(i * 0.9 + t * 4) * 0.15;
      s += chars[Math.floor(((v + 1) / 2) * (chars.length - 1) + 0.5) % chars.length];
    }
    el.textContent = s;
  };

  if (reduceNow) { els.forEach((el) => render(el, 0)); return; }
  let last = 0;
  const tick = (now) => {
    requestAnimationFrame(tick);
    if (now - last < 60) return;
    last = now;
    els.forEach((el) => state.get(el) && render(el, now / 1000));
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
