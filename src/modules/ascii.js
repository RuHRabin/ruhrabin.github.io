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
  constructor(canvas, { lines, cols = 100, font = 'JetBrains Mono', weight = 800, widthRatio = 0.98, radius = 7, fps = 30 } = {}) {
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
    const base = cs.color || '#dbe6f0';
    const accent = cs.getPropertyValue('--accent').trim() || '#3ddc97';
    const L = RAMP.length - 1;
    const animate = !reduced();
    const px = this.pointer.x, py = this.pointer.y, on = this.pointer.on && animate;
    const scan = ((t * 0.18) % 1.5) * cols - cols * 0.1;

    ctx.clearRect(0, 0, this.w, this.h);
    ctx.font = `700 ${this.fontPx}px "JetBrains Mono", monospace`;
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
  const fontReady = document.fonts.load('800 100px "JetBrains Mono"').catch(() => {});
  const make = (c) => {
    const small = innerWidth < 700 && c.dataset.linesM;     // phones: a stacked, bigger version
    const lines = ((small ? c.dataset.linesM : c.dataset.lines) || '').split('|').filter(Boolean);
    if (!lines.length) return;
    arts.push(new AsciiArt(c, { lines, cols: (small ? +c.dataset.colsM : +c.dataset.cols) || 100, fps: document.documentElement.classList.contains('is-lite') ? 15 : 30 }));
  };
  const canvases = [...document.querySelectorAll('canvas[data-ascii]')];
  if (!('IntersectionObserver' in window)) { canvases.forEach(make); return arts; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      fontReady.then(() => (window.requestIdleCallback || ((f) => setTimeout(f, 1)))(() => make(e.target)));
    });
  }, { rootMargin: '1200px 0px' });
  canvases.forEach((c) => io.observe(c));
  return arts;
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
