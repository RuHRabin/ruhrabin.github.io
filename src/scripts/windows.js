// window manager: the red / yellow / green buttons actually close, minimize and maximize their window.
import { $, $$, h, reduce, lockScroll } from './lib.js';
import { Sfx } from './sfx.js';

const tasks = h('div'); tasks.id = 'tasks'; tasks.setAttribute('role', 'toolbar'); tasks.setAttribute('aria-label', 'Minimised windows');
document.body.appendChild(tasks);
let seq = 0, maxed = null;
const ttl = (w) => (($('.wtt', w) || {}).textContent || 'window').trim();
const wins = () => $$('.win[data-wm]');

function chips() {
  tasks.textContent = '';
  wins().filter((w) => w.classList.contains('wm-min')).forEach((w) => {
    const b = h('button', 'chip', ttl(w)); b.type = 'button'; b.prepend(h('i'));
    b.setAttribute('aria-label', 'Restore ' + ttl(w)); b.addEventListener('click', () => minimize(w, false)); tasks.appendChild(b);
  });
  tasks.classList.toggle('on', tasks.children.length > 0);
}
function flip(w, fn) {
  const a = w.offsetHeight; fn(); const b = w.offsetHeight;
  if (!reduce && a !== b) w.animate([{ height: a + 'px' }, { height: b + 'px' }], { duration: 340, easing: 'cubic-bezier(.2,.9,.2,1)' });
}
export function minimize(w, v) {
  if (w.classList.contains('wm-max')) maximize(w, false);
  const on = v === undefined ? !w.classList.contains('wm-min') : v;
  flip(w, () => w.classList.toggle('wm-min', on));
  on ? Sfx.winMin() : Sfx.winMax();
  const y = $('.tl.y', w); if (y) y.setAttribute('aria-pressed', String(on));
  chips();
}
export function close(w) {
  if (w.id === 'sig') { const x = $('#sigx'); if (x) x.click(); return; }
  if (w.classList.contains('wm-max')) maximize(w, false);
  Sfx.winClose();
  const t = ttl(w), ph = h('div', 'wm-ph'), b = h('button', '', 'REOPEN'); ph.dataset.for = w.dataset.wid; b.type = 'button';
  b.setAttribute('aria-label', 'Reopen ' + t); b.addEventListener('click', () => reopen(w)); ph.append(h('span', '', t + ', closed'), b); w.after(ph);
  const done = () => { w.classList.add('wm-closed'); w.classList.remove('wm-closing'); };
  if (reduce) done(); else { w.classList.add('wm-closing'); setTimeout(done, 300); }
  chips();
}
export function reopen(w) {
  const ph = document.querySelector('.wm-ph[data-for="' + w.dataset.wid + '"]'); if (ph) ph.remove();
  w.classList.remove('wm-closed', 'wm-min', 'wm-closing'); w.classList.add('wm-opening'); setTimeout(() => w.classList.remove('wm-opening'), 420);
  Sfx.winMax(); chips();
}
export function reopenAll() { const c = wins().filter((w) => w.classList.contains('wm-closed')); c.forEach(reopen); return c.length; }
export function listWindows() { return wins().map((w) => (w.classList.contains('wm-closed') ? '[closed]    ' : w.classList.contains('wm-min') ? '[minimised] ' : '[open]      ') + ttl(w)).join('\n'); }
export function maximize(w, v) {
  const on = v === undefined ? !w.classList.contains('wm-max') : v;
  if (on === w.classList.contains('wm-max')) return;
  if (on) {
    if (maxed && maxed !== w) maximize(maxed, false);
    if (w.classList.contains('wm-min')) minimize(w, false);
    const fixed = getComputedStyle(w).position === 'fixed', r = w.getBoundingClientRect();
    let anchor;
    if (fixed) anchor = document.createComment('wm');
    else { anchor = h('div', 'wm-ph2'); anchor.style.cssText = 'height:' + r.height + 'px;width:' + r.width + 'px;flex:0 0 ' + r.width + 'px'; }
    w.after(anchor); w._anchor = anchor;
    const ov = h('div', 'wm-ov'); ov.addEventListener('pointerdown', (e) => { if (e.target === ov) maximize(w, false); });
    document.body.appendChild(ov); ov.appendChild(w); w.classList.add('wm-max'); lockScroll(true); maxed = w; Sfx.winMax();
  } else {
    const a = w._anchor; if (a) a.replaceWith(w); w._anchor = null;
    const ov = $('.wm-ov'); if (ov) ov.remove(); w.classList.remove('wm-max'); lockScroll(false); maxed = null; Sfx.winMin();
  }
  const g = $('.tl.g', w); if (g) g.setAttribute('aria-pressed', String(on));
}
function setup(w) {
  const bar = $('.wt', w); if (!bar || w.dataset.wm) return;
  const dots = $$('.tl', bar); if (dots.length !== 3) return;
  w.dataset.wm = '1'; w.dataset.wid = w.id || 'w' + ++seq;
  const t = ttl(w), spec = [['r', close, 'Close'], ['y', minimize, 'Minimise'], ['g', maximize, 'Maximise']];
  const grp = h('span', 'tls'); grp.setAttribute('role', 'group'); grp.setAttribute('aria-label', 'Window controls');
  dots.forEach((el, i) => {
    const [c, fn, label] = spec[i], b = h('button', 'tl ' + c); b.type = 'button'; b.title = label; b.setAttribute('aria-label', label + ' window: ' + t);
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(w); }); grp.appendChild(b); el.remove();
  });
  bar.prepend(grp);
  bar.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) maximize(w); });
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && maxed) maximize(maxed, false); });
$$('.win').forEach(setup);
