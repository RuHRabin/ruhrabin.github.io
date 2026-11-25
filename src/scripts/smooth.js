// smooth inertial scrolling (Lenis), anchor navigation, word-by-word heading reveals and the custom cursor.
import Lenis from 'lenis';
import { $, $$, h, reduce, coarse } from './lib.js';

if (!reduce) {
  const l = new Lenis({ duration: 1.2, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
  window.__lenis = l;
  (function raf(t) { l.raf(t); requestAnimationFrame(raf); })(performance.now());
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href^="#"]'); if (!a) return;
    const id = a.getAttribute('href').slice(1), el = id ? document.getElementById(id) : null; if (id && !el) return;
    e.preventDefault(); l.scrollTo(el || 0, { offset: el ? -8 : 0, duration: 1.7 }); history.replaceState(null, '', id ? '#' + id : location.pathname);
  });
}
['#log', '#sigl', '.hm-s', '#menu'].forEach((s) => $$(s).forEach((e) => e.setAttribute('data-lenis-prevent', '')));

// split headings into words so each one can be masked and revealed
$$('h2.rv').forEach((hd) => {
  const words = hd.textContent.trim().split(/\s+/); hd.textContent = ''; hd.dataset.split = '1'; hd.setAttribute('aria-label', words.join(' '));
  words.forEach((w, i) => { const o = h('span', 'w'), s = h('span', '', w); o.setAttribute('aria-hidden', 'true'); s.style.setProperty('--wi', i); o.appendChild(s); hd.appendChild(o); hd.appendChild(document.createTextNode(' ')); });
});

if (!reduce && !coarse) {
  const c = h('div'), d = h('div'); c.id = 'cur'; d.id = 'cur2'; c.setAttribute('aria-hidden', 'true'); d.setAttribute('aria-hidden', 'true'); document.body.append(c, d);
  let x = innerWidth / 2, y = innerHeight / 2, cx = x, cy = y, shown = false;
  addEventListener('pointermove', (e) => { x = e.clientX; y = e.clientY; if (!shown) { shown = true; c.classList.add('on'); d.classList.add('on'); } d.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    c.classList.toggle('hot', !!(e.target.closest && e.target.closest('a,button,summary,input,.wt,.mrow,.c'))); }, { passive: true });
  document.addEventListener('pointerleave', () => { c.classList.remove('on'); d.classList.remove('on'); shown = false; });
  let run = false;
  function f() { cx += (x - cx) * 0.17; cy += (y - cy) * 0.17; c.style.transform = 'translate(' + cx + 'px,' + cy + 'px)'; if (Math.abs(x - cx) + Math.abs(y - cy) > 0.3) requestAnimationFrame(f); else run = false; }
  addEventListener('pointermove', () => { if (!run) { run = true; requestAnimationFrame(f); } }, { passive: true });
}
