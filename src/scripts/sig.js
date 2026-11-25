// SIG, the visitor assistant. answers from the local FAQ by default, and streams from a free AI endpoint if PUBLIC_SIG_ENDPOINT is set
// (see worker/sig-worker.js, a free Cloudflare Workers AI proxy, so no API key ever reaches the browser).
import { $, $$, h, root, state, REPOS } from './lib.js';
import { Sfx } from './sfx.js';
import { faq } from '../data/site.js';

const ENDPOINT = import.meta.env.PUBLIC_SIG_ENDPOINT || '';
const box = $('#sig'), log = $('#sigl'), inp = $('#sigi'), title = $('.wtt', box);
const history = []; let busy = false, asked = 0, lastAt = 0;
const STOP = new Set('a an the is are was be to of in on for and or he his him she her it its what who how does do did can i you me my about with this that tell'.split(' '));
const tok = (s) => s.toLowerCase().replace(/[^a-z0-9+#. ]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w));
if (title) title.textContent = ENDPOINT ? 'SIG, AI assistant' : 'SIG, local helper';

function local(q) {
  const t = tok(q), s = q.toLowerCase();
  if (/^(hi|hello|hey)\b/.test(s)) return 'Hi, I’m SIG. Ask me about Rabin’s skills, projects, availability or how to contact him.';
  if (/thank/.test(s)) return 'You’re welcome!';
  if (/project|built|build|repo|github|ship/.test(s)) { const g = state.gh || {}; return 'Rabin made ' + (g.total || 'many') + ' GitHub contributions in the last year' + (g.days ? ' on ' + g.days + ' different days' : '') + '. Recent repos: ' + REPOS.slice(0, 4).map((r) => r.n + ' (' + r.l + ')').join(', ') + '. The Archive section draws his real activity.'; }
  let best = null, bs = 0;
  faq.forEach((f) => { const ft = new Set(tok(f.q + ' ' + f.a)); const sc = t.reduce((a, w) => a + (ft.has(w) ? 1 : 0), 0) + t.reduce((a, w) => a + (tok(f.q).includes(w) ? 1 : 0), 0); if (sc > bs) { bs = sc; best = f; } });
  return best && bs >= 1 ? best.a : 'I only know what’s on this site: skills, projects, availability and contact details. Try one of those.';
}
function add(t, u) { const d = h('div', 'm' + (u ? ' u' : ''), t); log.appendChild(d); log.scrollTop = log.scrollHeight; return d; }
async function remote(msgs, bubble) {
  const ac = new AbortController(), to = setTimeout(() => ac.abort(), 20000);
  try {
    const r = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: msgs }), signal: ac.signal });
    if (!r.ok) throw new Error(String(r.status));
    if ((r.headers.get('content-type') || '').includes('json')) { const j = await r.json(); bubble.textContent = j.reply || j.response || ''; return bubble.textContent; }
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '', out = '';
    for (;;) {
      const { done, value } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop();
      for (const l of lines) {
        if (!l.startsWith('data:')) continue; const d = l.slice(5).trim(); if (d === '[DONE]') return out;
        try { const j = JSON.parse(d); const x = j.response ?? (j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content) ?? ''; if (x) { out += x; bubble.textContent = out; log.scrollTop = log.scrollHeight; } } catch {}
      }
    }
    return out;
  } finally { clearTimeout(to); }
}
async function ask(q) {
  q = q.trim().slice(0, 300); if (!q || busy) return;
  if (Date.now() - lastAt < 1500) return; lastAt = Date.now(); add(q, true); history.push({ role: 'user', content: q });
  if (++asked > 25) { add('That’s plenty for one visit. Email rabin@ruhrbin.site for more.'); return; }
  busy = true; const b = add('…');
  try {
    let a = '';
    if (ENDPOINT) { try { b.textContent = ''; a = await remote(history.slice(-8), b); } catch { a = ''; } }
    if (!a) { a = local(q); b.textContent = a; }
    history.push({ role: 'assistant', content: a }); Sfx.click();
  } finally { busy = false; }
}
function open(v) {
  box.classList.toggle('open', v);
  if (v) { if (!log.children.length) add('Hi, I’m SIG. I can answer questions about Rabin’s work, skills and availability. What would you like to know?'); setTimeout(() => inp.focus(), 60); }
}
$$('[data-sig]').forEach((b) => b.addEventListener('click', () => open(!box.classList.contains('open'))));
$('#sigx').addEventListener('click', () => open(false));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && box.classList.contains('open') && !root.classList.contains('boot') && !document.querySelector('.wm-ov,#pal.open')) open(false); });
$('#sigf').addEventListener('submit', (e) => { e.preventDefault(); const v = inp.value; inp.value = ''; ask(v); });
inp.addEventListener('keydown', (e) => Sfx.keyDown(e.key));
inp.addEventListener('keyup', (e) => Sfx.keyUp(e.key));
$$('.sq button').forEach((b) => b.addEventListener('click', () => ask(b.textContent)));
