// Custom cursor: dot (fast) + ring (lerped). Behaviour inspired by ivan.technology (feel only).
// Tweak speed: CFG.ring (0.05 slow ... 0.4 snappy). Colours: mix-blend-mode difference (see ui.css).
// States via data attributes on any element:
//   data-cursor="link"   ring grows            (default for a / button)
//   data-cursor="view"   ring fills + label    (data-cursor-label="OPEN")
//   data-cursor="ascii"  ring morphs into a cycling ASCII glyph
//   inputs               ring becomes a text bar
const CFG = { ring: 0.17, dot: 0.6, glyphMs: 85 };
const GLYPHS = '@#%*+=-:.<>/\\|[]{}01';

export function initCursor({ sound } = {}) {
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.querySelector('.cursor');
  if (!root || !fine || reduced) { root?.remove(); return; }

  document.documentElement.classList.add('has-cursor');
  const ring = root.querySelector('.cursor__ring');
  const dot = root.querySelector('.cursor__dot');
  const tag = root.querySelector('.cursor__tag');
  const label = root.querySelector('[data-cursor-label]');
  const glyph = root.querySelector('[data-cursor-glyph]');

  let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my, dx = mx, dy = my;
  let current = null, glyphTimer = 0, seen = false;

  const setState = (state, text = '') => {
    root.dataset.state = state;
    label.textContent = text;
    clearInterval(glyphTimer);
    if (state === 'ascii') {
      glyphTimer = setInterval(() => { glyph.textContent = GLYPHS[(Math.random() * GLYPHS.length) | 0]; }, CFG.glyphMs);
    }
  };
  setState('default');

  addEventListener('pointermove', (e) => {
    mx = e.clientX; my = e.clientY; wake();
    if (!seen) { seen = true; rx = dx = mx; ry = dy = my; root.classList.add('is-on'); }
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => root.classList.remove('is-on'));
  document.documentElement.addEventListener('mouseenter', () => seen && root.classList.add('is-on'));

  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest?.('[data-cursor], a, button, input, textarea, [contenteditable="true"]');
    if (el === current) return;
    current = el;
    if (!el) return setState('default');
    const isText = el.matches('input, textarea, [contenteditable="true"]');
    const state = el.dataset.cursor || (isText ? 'text' : 'link');
    setState(state, el.dataset.cursorLabel || '');
  });

  addEventListener('pointerdown', () => { root.classList.add('is-down', 'is-pulse'); });
  addEventListener('pointerup', () => {
    root.classList.remove('is-down');
    setTimeout(() => root.classList.remove('is-pulse'), 480);
  });

  let running = false;
  const wake = () => { if (!running) { running = true; requestAnimationFrame(tick); } };
  const tick = () => {
    rx += (mx - rx) * CFG.ring; ry += (my - ry) * CFG.ring;
    dx += (mx - dx) * CFG.dot;  dy += (my - dy) * CFG.dot;
    ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
    tag.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
    dot.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    if (Math.abs(mx - rx) + Math.abs(my - ry) + Math.abs(mx - dx) + Math.abs(my - dy) > 0.3) requestAnimationFrame(tick);
    else running = false; // idle: no work at all
  };
  wake();
}
