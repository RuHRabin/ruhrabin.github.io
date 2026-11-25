// scroll engine: caches geometry (no layout reads per frame), eased progress, hero break-apart, pinned gallery,
// marquees that react to speed, light parallax and a chapter rail. one rAF loop runs everything.
import { $, $$, h, reduce, SC } from './lib.js';
import { Sfx } from './sfx.js';

const prog = $('#prog'), hero = $('#hero'), pin = $('#focus'), hx = $('#hx'), cards = $$('#hx .win'), fc = $('#fc'), fb = $('.fbar');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const CH = [['hero', 'Home'], ['focus', 'Focus'], ['stack', 'Stack'], ['archive', 'Archive'], ['terminal', 'Terminal'], ['about', 'About'], ['contact', 'Contact']];
let vw = innerWidth, vh = innerHeight, pinTop = 0, pinH = 0, pd = 0, centers = [], tops = [], cur = -1, prevY = scrollY, last = 0, ready = false;
let lastP = -1, lastFp = -1, lastTx = NaN, lastFc = '', bw = 0, bh = 0; // guards so we only touch styles/text when a value actually changed
const railLinks = [];

const mq = $$('.mq').map((e) => { const inner = e.firstElementChild; e.appendChild(inner.cloneNode(true)); e.appendChild(inner.cloneNode(true)); return { e, w: 0, x: 0, dir: +e.dataset.dir, sp: +e.dataset.sp }; });
const pxs = $$('section > h2,section > .sub').filter((e) => !e.closest('.pin')).map((e) => ({ e, top: 0, k: e.matches('h2') ? 0.07 : 0.045, ty: 0 }));

// chapter rail (desktop only)
const rail = h('nav'); rail.id = 'rail'; rail.setAttribute('aria-label', 'Page chapters');
const rl = h('i', 'rl'); rl.appendChild(h('b')); rail.appendChild(rl);
CH.forEach(([id, label], i) => { const a = h('a'); a.href = '#' + id; a.setAttribute('aria-label', label); a.append(h('span', '', label), h('i')); a.dataset.i = i; rail.appendChild(a); });
document.body.appendChild(rail);
$$('#rail a').forEach((a) => railLinks.push(a));

function measureNow() {
  lastTx = NaN; lastFp = -1; lastFc = '';
  vw = innerWidth; vh = innerHeight; const sy = scrollY;
  mq.forEach((m) => { m.w = m.e.firstElementChild.offsetWidth; if (m.dir > 0 && m.x === 0) m.x = -m.w; });
  if (vw <= 760) { pin.style.height = ''; hx.style.transform = ''; cards.forEach((c) => { c.style.transform = ''; c.style.opacity = ''; }); pd = 0; }
  else { hx.style.transform = 'none'; pd = Math.max(0, hx.scrollWidth - hx.clientWidth); pin.style.height = vh + pd + 'px'; centers = cards.map((c) => c.offsetLeft + c.offsetWidth / 2); }
  pinTop = pin.getBoundingClientRect().top + sy; pinH = pin.offsetHeight;
  pxs.forEach((o) => { o.e.style.translate = ''; o.top = o.e.getBoundingClientRect().top + sy + o.e.offsetHeight / 2; });
  tops = CH.map(([id]) => { const e = document.getElementById(id); return e ? e.getBoundingClientRect().top + sy : 0; });
  ready = true;
}
function setRail(i) { railLinks.forEach((a) => a.classList.toggle('on', +a.dataset.i === i)); }
function loop(n) {
  const dt = Math.max(0.001, Math.min(0.05, (n - (last || n)) / 1000)); last = n; const y = scrollY;
  SC.ty = y; SC.y += (y - SC.y) * Math.min(1, dt * 12); SC.vel += (Math.abs(y - prevY) / (dt * 1000) - SC.vel) * 0.12; prevY = y;
  SC.p = clamp(y / Math.max(1, document.documentElement.scrollHeight - innerHeight), 0, 1);
  const pp = SC.p.toFixed(4); if (pp !== lastP) { lastP = pp; prog.style.setProperty('--p', pp); rail.style.setProperty('--rp', pp); }
  const hp = reduce ? 0 : clamp(SC.y / (vh * 0.9), 0, 1); if (Math.abs(hp - SC.hp) > 0.0005) { SC.hp = hp; hero.style.setProperty('--hp', hp.toFixed(4)); }
  if (ready && vw > 760 && pd) {
    const p = clamp((y - pinTop) / Math.max(1, pinH - vh), 0, 1), tx = -p * pd;
    const fpv = p.toFixed(4), fcv = '0' + (Math.min(3, Math.round(p * 3)) + 1); if (fpv !== lastFp) { lastFp = fpv; fb.style.setProperty('--fp', fpv); } if (fcv !== lastFc) { lastFc = fcv; fc.textContent = fcv; }
    if (tx !== lastTx) { lastTx = tx; hx.style.transform = 'translate3d(' + tx + 'px,0,0)'; if (!reduce) cards.forEach((c, i) => { const m = clamp((centers[i] + tx - vw / 2) / vw, -1, 1), a = Math.abs(m); c.style.transform = 'rotateY(' + (-m * 16).toFixed(2) + 'deg) translateZ(' + (-a * 70).toFixed(1) + 'px) scale(' + (1 - a * 0.07).toFixed(3) + ')'; c.style.opacity = (1 - a * 0.45).toFixed(3); }); }
  }
  if (!reduce) {
    mq.forEach((m) => { if (!m.w) return; m.x += m.dir * (m.sp + SC.vel * 140) * dt; if (m.dir < 0 && m.x <= -m.w) m.x += m.w; if (m.dir > 0 && m.x >= 0) m.x -= m.w; m.e.style.transform = 'translate3d(' + m.x.toFixed(1) + 'px,0,0) skewX(' + (-m.dir * Math.min(8, SC.vel * 3)).toFixed(2) + 'deg)'; });
    if (ready) { const mid = y + vh / 2; pxs.forEach((o) => { const d = mid - o.top; if (Math.abs(d) < vh) { const ty = (d * o.k).toFixed(1); if (o.ty !== ty) { o.e.style.translate = '0 ' + ty + 'px'; o.ty = ty; } } }); }
  }
  if (ready) { let idx = 0; for (let i = 0; i < tops.length; i++) if (tops[i] <= y + vh * 0.45) idx = i; if (idx !== cur) { if (cur !== -1) Sfx.chapter(); cur = idx; setRail(idx); } }
  Sfx.wind(SC.vel); requestAnimationFrame(loop);
}
let mq_ = 0; function measure() { if (mq_) return; mq_ = requestAnimationFrame(() => { mq_ = 0; measureNow(); }); }
measure(); addEventListener('resize', () => { measure(); }); addEventListener('load', measure);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
new ResizeObserver((en) => { const r = en[0].contentRect; if (Math.abs(r.width - bw) < 1 && Math.abs(r.height - bh) < 1) return; bw = r.width; bh = r.height; measure(); }).observe(document.body);
requestAnimationFrame(loop);
