import GH from '../data/github.json';
import BN from '../data/banner.json';
import { $, $$, h, reduce, state, REPOS, ago } from './lib.js';
import { Sfx } from './sfx.js';
import { fetchLive } from './live.js';

const GL = ['·', '░', '▒', '▓', '█'], MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], SCR = ' .:-=+*#%@░▒▓█', DAY = 864e5;
const abn = $('#abn'), ahm = $('#ahm'), tip = $('#tip');
let cells = [], revealed = false;
abn.textContent = BN.join('\n');

function stats(w) {
  let days = 0, best = 0, run = 0, long = 0, total = 0;
  w.forEach((wk) => wk.forEach((c) => { if (!c) return; total += c[1]; if (c[1] > 0) { days++; run++; if (run > long) long = run; } else run = 0; if (c[1] > best) best = c[1]; }));
  return { days, long, best, total };
}
function setN(id, n, animate) {
  const el = $(id); if (!el) return; n = +n; const from = +el.dataset.n || 0; el.dataset.n = n;
  if (!animate || reduce || from === n) { el.textContent = n; return; }
  const t0 = performance.now(); (function f(t) { const k = Math.min(1, (t - t0) / 900); el.textContent = Math.round(from + (n - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(f); })(t0);
}
function build(d) {
  const W = d.w, start = new Date(d.s + 'T00:00:00Z'), ml = new Array(4 + W.length * 2 + 2).join(' ').split(''), names = ['   ', 'Mon', '   ', 'Wed', '   ', 'Fri', '   '];
  let pm = -1, pe = 0, html;
  W.forEach((wk, c) => { const m = new Date(start.getTime() + c * 7 * DAY).getUTCMonth(); if (m !== pm && 4 + c * 2 >= pe) { const s = MO[m]; for (let i = 0; i < 3; i++) ml[4 + c * 2 + i] = s[i]; pe = 4 + c * 2 + 5; } pm = m; });
  html = ml.join('') + '\n';
  for (let r = 0; r < 7; r++) { html += names[r] + ' '; W.forEach((wk, c) => { const e = wk[r]; html += e ? '<span class="c l' + e[0] + '" style="--cx:' + c + '" data-n="' + e[1] + '" data-d="' + new Date(start.getTime() + (c * 7 + r) * DAY).toISOString().slice(0, 10) + '">' + GL[e[0]] + ' </span>' : '  '; }); html += '\n'; }
  ahm.innerHTML = html.replace(/\n$/, '');
  cells = $$('.c', ahm).map((el) => ({ el, lv: +el.className.charAt(el.className.indexOf(' l') + 2), ft: +el.style.getPropertyValue('--cx') * 26 + Math.random() * 500 }));
  ahm.setAttribute('aria-label', 'Contribution heatmap for the last year on GitHub, ' + d.total + ' contributions in total');
}
function applyStats(d, animate) {
  const s = stats(d.w);
  setN('#st-total', d.total || s.total, animate); setN('#st-days', s.days, animate); setN('#st-long', s.long, animate); setN('#st-best', s.best, animate);
  state.gh = Object.assign(state.gh || {}, { days: s.days, long: s.long, best: s.best, total: d.total || s.total });
}
function reveal() {
  const t0 = performance.now(); let k = 0;
  const iv = setInterval(() => {
    const t = performance.now() - t0; let done = true; if (k++ % 2 === 0) Sfx.hdd();
    cells.forEach((c) => { if (t > c.ft) { if (!c.ok) { c.ok = true; c.el.textContent = GL[c.lv] + ' '; } } else { done = false; c.el.textContent = SCR[Math.random() * SCR.length | 0] + ' '; } });
    if (done) clearInterval(iv);
  }, 60);
}
function line(kind, repo, msg, when) {
  const li = h('li'), t = h('time', 'ft', when);
  li.append(h('b', 'fk', kind), h('span', 'fr', repo), h('span', 'fm', msg), t); return li;
}
function feed(events, repos) {
  const ol = $('#flog'); if (!ol) return; ol.textContent = '';
  if (events && events.length) {
    const seen = new Set();
    events.forEach((e) => {
      if (ol.children.length >= 5) return; const repo = (e.repo && e.repo.name || '').replace(USERPFX, ''), p = e.payload || {}; let kind = e.type.replace('Event', '').toLowerCase(), msg = '';
      if (e.type === 'PushEvent') { kind = 'push'; msg = (p.commits && p.commits[p.commits.length - 1] && p.commits[p.commits.length - 1].message || '').split('\n')[0].slice(0, 64); }
      else if (e.type === 'CreateEvent') { kind = 'create'; msg = p.ref_type + (p.ref ? ' ' + p.ref : ''); }
      else if (e.type === 'WatchEvent') { kind = 'star'; msg = 'starred'; }
      else if (e.type === 'PullRequestEvent') { kind = 'pr'; msg = (p.action || '') + ' ' + (p.pull_request && p.pull_request.title || '').slice(0, 56); }
      else if (e.type === 'IssuesEvent') { kind = 'issue'; msg = (p.action || '') + ' ' + (p.issue && p.issue.title || '').slice(0, 56); }
      const key = kind + repo + msg; if (seen.has(key)) return; seen.add(key);
      ol.appendChild(line(kind, repo, msg, ago(e.created_at)));
    });
  }
  if (!ol.children.length && repos) repos.slice(0, 5).forEach((r) => ol.appendChild(line('updated', r.n, r.l || 'repository', ago(r.u))));
}
const USERPFX = /^RuHRabin\//;
function setLive(on, label) {
  const f = $('#flive'); if (f) f.dataset.live = on ? '1' : '0'; const s = $('#fstate'); if (s) s.textContent = on ? 'Live' : 'Snapshot';
  const u = $('#fupd'); if (u && label) u.textContent = label;
}
let busy = false;
async function refresh() {
  if (busy || document.hidden) return; busy = true;
  try {
    const L = await fetchLive();
    if (!L) { setLive(false); return; }
    if (L.cal) { build(L.cal); applyStats(L.cal, true); if (revealed) cells.forEach((c) => { c.el.textContent = GL[c.lv] + ' '; }); }
    if (L.user) { setN('#st-fol', L.user.followers, true); setN('#st-repos', L.user.repos, true); state.gh.followers = L.user.followers; state.gh.repos = L.user.repos; }
    if (L.repos && L.repos.length) { REPOS.length = 0; L.repos.slice(0, 8).forEach((r) => REPOS.push({ n: r.n, l: r.l || 'code', u: r.u })); }
    feed(L.events, L.repos || null);
    setLive(true, 'synced ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ', live from GitHub');
  } catch { setLive(false); } finally { busy = false; }
}
build(GH); applyStats(GH, false);
const gh = $('#gh');
function onView() {
  if (!revealed) { revealed = true; window.__count && window.__count($('#gst')); if (!reduce) reveal(); }
}
if ('IntersectionObserver' in window) {
  new IntersectionObserver((en, o) => { if (en[0].isIntersecting) { onView(); o.disconnect(); } }, { threshold: 0.25 }).observe(gh);
  new IntersectionObserver((en, o) => { if (en[0].isIntersecting) { refresh(); o.disconnect(); setInterval(refresh, 5 * 60e3); document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); }); } }, { rootMargin: '900px 0px' }).observe(gh);
} else { onView(); refresh(); }
ahm.addEventListener('pointermove', (e) => {
  const c = e.target.closest('.c'); if (!c) { tip.style.opacity = 0; return; } const n = +c.dataset.n, r = c.getBoundingClientRect();
  tip.textContent = (n ? n + ' contribution' + (n > 1 ? 's' : '') : 'No contributions') + ', ' + new Date(c.dataset.d + 'T00:00:00').toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  tip.style.left = r.left + r.width / 2 + 'px'; tip.style.top = r.top + 'px'; tip.style.opacity = 1;
});
ahm.addEventListener('pointerleave', () => { tip.style.opacity = 0; });
