// command palette: press Ctrl/Cmd + K (or /) to jump somewhere or run a command.
import { $, h, reduce, state } from './lib.js';
import { Sfx, setSound } from './sfx.js';
import { skin } from './ui.js';
import { reopenAll } from './windows.js';
import { site } from '../data/site.js';

const go = (id) => () => { const e = document.getElementById(id); if (!e) return; if (window.__lenis) window.__lenis.scrollTo(e, { offset: -8, duration: 1.7 }); else e.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); };
const items = [
  ['Go to home', 'navigate', go('hero')], ['Go to focus', 'navigate', go('focus')], ['Go to stack', 'navigate', go('stack')], ['Go to archive (GitHub)', 'navigate', go('archive')],
  ['Go to terminal', 'navigate', go('terminal')], ['Go to about and FAQ', 'navigate', go('about')], ['Go to contact', 'navigate', go('contact')],
  ['Ask SIG', 'assistant', () => $('[data-sig]').click()], ['Toggle sound', 'action', () => setSound(!Sfx.on)], ['Music on', 'sound', () => window.dispatchEvent(new CustomEvent('music:set', { detail: { on: true } }))], ['Music off', 'sound', () => window.dispatchEvent(new CustomEvent('music:set', { detail: { on: false } }))], ['Music louder', 'sound', () => window.dispatchEvent(new CustomEvent('music:set', { detail: { volume: 1 } }))], ['Music quieter', 'sound', () => window.dispatchEvent(new CustomEvent('music:set', { detail: { volume: 0.4 } }))],
  ['Switch to macOS style', 'theme', () => skin('mac')], ['Switch to Arch / Linux style', 'theme', () => skin('linux')],
  ['Copy email address', 'action', () => { if (navigator.clipboard) navigator.clipboard.writeText(site.email); }],
  ['Open GitHub profile', 'link', () => window.open(site.github, '_blank', 'noopener')], ['Open X profile', 'link', () => window.open(site.x, '_blank', 'noopener')],
  ['Toggle constellations', 'action', () => { if (window.__const) window.__const(); }], ['Engage warp', 'action', () => { state.warp = 1; Sfx.whoosh(); }], ['Reopen closed windows', 'action', () => reopenAll()],
];
let el, input, list, sel = 0, shown = [], last = null;
function build() {
  el = h('div'); el.id = 'pal'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Command palette');
  const box = h('div', 'pal-box'); input = h('input'); input.type = 'text'; input.placeholder = 'Type a command or a section…'; input.setAttribute('role', 'combobox'); input.setAttribute('aria-expanded', 'true'); input.setAttribute('aria-controls', 'pal-list'); input.setAttribute('aria-label', 'Command');
  list = h('ul'); list.id = 'pal-list'; list.setAttribute('data-lenis-prevent', ''); list.setAttribute('role', 'listbox'); box.append(input, list); el.appendChild(box); document.body.appendChild(el);
  el.addEventListener('pointerdown', (e) => { if (e.target === el) close(); });
  input.addEventListener('input', () => { sel = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { sel = Math.min(shown.length - 1, sel + 1); render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); render(); e.preventDefault(); }
    else if (e.key === 'Enter') { run(shown[sel]); e.preventDefault(); }
    else if (e.key === 'Escape') close();
  });
}
function render() {
  const q = input.value.trim().toLowerCase();
  shown = items.filter((i) => !q || (i[0] + ' ' + i[1]).toLowerCase().includes(q)); list.textContent = '';
  shown.forEach((it, i) => {
    const li = h('li', '', it[0]); li.append(h('span', '', it[1])); li.setAttribute('role', 'option'); li.setAttribute('aria-selected', String(i === sel));
    li.addEventListener('click', () => run(it)); list.appendChild(li);
  });
}
function run(it) { if (!it) return; close(); setTimeout(it[2], 60); }
function open() { if (!el) build(); last = document.activeElement; el.classList.add('open'); input.value = ''; sel = 0; render(); input.focus(); Sfx.click(); }
function close() { if (el) el.classList.remove('open'); if (last && last.focus) last.focus(); }
document.addEventListener('keydown', (e) => {
  const typing = /^(input|textarea|select)$/i.test((e.target.tagName || '')) || e.target.isContentEditable;
  if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); el && el.classList.contains('open') ? close() : open(); }
  else if (e.key === '/' && !typing) { e.preventDefault(); open(); }
  else if ((e.key === 'c' || e.key === 'C') && !typing && !e.ctrlKey && !e.metaKey && window.__const) window.__const();
});
const kbd = $('#kbd'); if (kbd) kbd.addEventListener('click', open);
