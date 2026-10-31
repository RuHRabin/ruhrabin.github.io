// Theme: "linux" (dark terminal) or "mac" (light glass). Saved in localStorage, set before first paint
// by the inline script in index.html. Switching uses a circular reveal (View Transitions API) when available.
const KEY = 'sig:theme';
const html = document.documentElement;
const META = { linux: '#070a0e', mac: '#e8ecf3' };

export const theme = {
  get: () => (html.dataset.theme === 'mac' ? 'mac' : 'linux'),
  /** apply without animation */
  apply(v) {
    const t = v === 'mac' ? 'mac' : 'linux';
    html.dataset.theme = t;
    document.querySelectorAll('[data-theme-toggle]').forEach((b) => b.setAttribute('aria-checked', String(t === 'mac')));
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META[t]);
    try { localStorage.setItem(KEY, t); } catch { /* private mode */ }
    window.dispatchEvent(new CustomEvent('sig:theme', { detail: t }));
  },
  /** switch with a circular reveal from (x, y) */
  set(v, origin) {
    const next = v === 'mac' ? 'mac' : 'linux';
    if (next === this.get()) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || reduced || !origin) { this.apply(next); return; }
    const r = Math.hypot(Math.max(origin.x, innerWidth - origin.x), Math.max(origin.y, innerHeight - origin.y));
    const vt = document.startViewTransition(() => this.apply(next));
    vt.ready.then(() => {
      html.animate(
        { clipPath: [`circle(0px at ${origin.x}px ${origin.y}px)`, `circle(${r}px at ${origin.x}px ${origin.y}px)`] },
        { duration: 850, easing: 'cubic-bezier(.65,0,.25,1)', pseudoElement: '::view-transition-new(root)' }
      );
    }).catch(() => {});
  },
  toggle(origin) { this.set(this.get() === 'mac' ? 'linux' : 'mac', origin); }
};

export function initTheme() {
  theme.apply(theme.get()); // sync aria + meta with what the inline script chose
  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const r = btn.getBoundingClientRect();
      theme.toggle({ x: e.clientX || r.left + r.width / 2, y: e.clientY || r.top + r.height / 2 });
    });
  });
}
