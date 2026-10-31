// Scroll: Lenis smooth scroll synced to GSAP ScrollTrigger.
// Motion language (igloo.inc-inspired, original code): depth. The hero zooms past you, words light up as you
// read, focus cards fly out of the screen toward you, marquees speed up with your scroll, the background
// starfield warps. Heavy parts are desktop-only and disabled for prefers-reduced-motion / crawlers.
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function splitChars(el) {
  const text = el.textContent;
  el.textContent = '';
  return [...text].map((c) => {
    const s = document.createElement('span');
    s.className = 'char';
    s.textContent = c;
    el.appendChild(s);
    return s;
  });
}

export function initScroll({ sound }) {
  const html = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || html.classList.contains('is-bot');
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  let lenis = null;

  // ---------- smooth scroll ----------
  if (!reduced) {
    lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.95, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    lenis.stop(); // locked until the loader finishes
  }

  // anchor links (also closes the mobile menu)
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    html.classList.remove('menu-open');
    const id = a.getAttribute('href');
    const target = id === '#' ? null : $(id);
    if (!target) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(id === '#hero' ? 0 : target, { duration: 1.6, easing: (t) => 1 - Math.pow(1 - t, 4) });
    else target.scrollIntoView({ behavior: 'auto' });
  });

  // ---------- hero: split characters ----------
  const heroChars = $$('[data-split]').flatMap(splitChars);
  if (!reduced) {
    gsap.set(heroChars, { yPercent: 118, rotate: 7, opacity: 0 });
    gsap.set('.hero__meta, .hero__copy, .hero__term, .hero__scroll', { opacity: 0, y: 22 });
  }
  html.classList.add('hero-ready');

  // ---------- ASCII progress bar, scroll cue, clocks ----------
  const bar = $('[data-progress]');
  let lastBar = '';
  const updateBar = () => {
    if (!bar) return;
    const max = document.documentElement.scrollHeight - innerHeight;
    const p = max > 0 ? clamp(scrollY / max, 0, 1) : 0;
    const f = Math.round(p * 20);
    const s = `[${'#'.repeat(f)}${'-'.repeat(20 - f)}] ${String(Math.round(p * 100)).padStart(3, '0')}%`;
    if (s !== lastBar) { bar.textContent = s; lastBar = s; }
  };
  addEventListener('scroll', updateBar, { passive: true });
  updateBar();

  const cue = $('[data-scroll-cue]');
  if (cue && !reduced) { const f = ['v', 'V', 'v', '.']; let i = 0; setInterval(() => { if (!document.hidden) cue.textContent = f[i++ % f.length]; }, 420); }
  const clocks = $$('[data-clock]');
  if (clocks.length) {
    const tz = clocks[0].dataset.tz;
    const fmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: tz });
    const label = (tz.split('/')[1] || 'LOCAL').toUpperCase();
    const tick = () => { const s = fmt.format(new Date()) + ' ' + label; clocks.forEach((c) => { c.textContent = s; }); };
    tick(); setInterval(() => { if (!document.hidden) tick(); }, 1000);
  }

  // ---------- active section in the top bar (+ hide socials near contact/footer) ----------
  const navLinks = $$('[data-nav]').map((l) => ({ l, sec: $('#' + l.dataset.nav) })).filter((x) => x.sec);
  let navActive = null, navQ = 0;
  const updateNav = () => {
    navQ = 0;
    let cur = null;
    for (const x of navLinks) {
      const el = x.sec.parentElement?.classList.contains('pin-spacer') ? x.sec.parentElement : x.sec; // pinned sections live inside a spacer
      if (el.getBoundingClientRect().top <= innerHeight * 0.55) cur = x;
    }
    if (cur !== navActive) { navActive = cur; navLinks.forEach((x) => x.l.classList.toggle('is-active', x === cur)); }
  };
  addEventListener('scroll', () => { if (!navQ) navQ = requestAnimationFrame(updateNav); }, { passive: true });
  updateNav();
  const socials = $('.socials');
  const prog = $('.progress');
  ScrollTrigger.create({ trigger: '#contact', start: 'top 55%', onToggle: (s) => socials?.classList.toggle('is-hidden', s.isActive || s.progress > 0) });
  ScrollTrigger.create({ trigger: '#footer', start: 'top 70%', onToggle: (s) => { if (s.isActive) socials?.classList.add('is-hidden'); prog?.classList.toggle('is-hidden', s.isActive); } });

  // ---------- window glow follows the pointer ----------
  if (fine) {
    let q = null, pe = null;
    addEventListener('pointermove', (e) => {
      pe = e; if (q) return;
      q = requestAnimationFrame(() => {
        q = null;
        const w = pe.target.closest?.('.win');
        if (!w) return;
        const r = w.getBoundingClientRect();
        w.style.setProperty('--mx', pe.clientX - r.left + 'px'); w.style.setProperty('--my', pe.clientY - r.top + 'px');
      });
    }, { passive: true });
  }

  const mm = gsap.matchMedia();

  // ---------- reveals + hero/manifesto (motion allowed) ----------
  mm.add('(prefers-reduced-motion: no-preference)', () => {
    if (reduced) return;
    $$('[data-reveal="mask"]').forEach((h) => {
      const inners = $$('.mask__in', h);
      gsap.set(inners, { yPercent: 112 });
      ScrollTrigger.create({ trigger: h, start: 'top 88%', once: true, onEnter: () => gsap.to(inners, { yPercent: 0, duration: 1.15, ease: 'expo.out', stagger: 0.09 }) });
    });
    $$('[data-reveal="fade"]').forEach((el) => {
      const kids = el.hasAttribute('data-stagger') ? [...el.children] : [el];
      gsap.set(kids, { opacity: 0, y: 30 });
      ScrollTrigger.create({ trigger: el, start: 'top 90%', once: true, onEnter: () => gsap.to(kids, { opacity: 1, y: 0, duration: 0.95, ease: 'expo.out', stagger: 0.09 }) });
    });
    $$('[data-reveal="clip"]').forEach((el) => {
      const inner = $('canvas', el);
      gsap.set(el, { clipPath: 'inset(100% 0% 0% 0%)' });
      if (inner) gsap.set(inner, { scale: 1.15 });
      ScrollTrigger.create({ trigger: el, start: 'top 88%', once: true, onEnter: () => {
        gsap.to(el, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.3, ease: 'expo.inOut' });
        if (inner) gsap.to(inner, { scale: 1, duration: 1.6, ease: 'expo.out' });
      } });
    });

    // hero: the name zooms past you as you leave
    const heroEnd = { trigger: '#hero', start: 'top top', end: 'bottom 25%', scrub: true };
    gsap.to('[data-hero-title]', { scale: 1.45, yPercent: -10, opacity: 0, ease: 'none', scrollTrigger: heroEnd });
    gsap.to('.hero__copy, .hero__term', { y: -90, opacity: 0, ease: 'none', scrollTrigger: { ...heroEnd, end: 'bottom 45%' } });

    // manifesto: words light up as you read
    const words = $$('.manifesto .w');
    if (words.length) {
      gsap.set(words, { opacity: 0.45 });
      gsap.to(words, { opacity: 1, stagger: 0.12, ease: 'none', scrollTrigger: { trigger: '.manifesto__text', start: 'top 82%', end: 'bottom 48%', scrub: true } });
    }
  });

  // ---------- desktop: focus cards fly toward the camera ----------
  mm.add('(min-width: 900px) and (prefers-reduced-motion: no-preference)', () => {
    if (reduced) return;
    const sec = $('#focus');
    const cards = $$('[data-card]', sec);
    if (!sec || !cards.length) return;
    const n = cards.length;
    const countEl = $('[data-count]', sec);
    sec.classList.add('is-pinned');
    gsap.set(cards, { opacity: 0 });
    const tl = gsap.timeline({ defaults: { ease: 'none' } });
    cards.forEach((card, i) => {
      tl.fromTo(card, { opacity: 0, z: i === 0 ? -700 : -1800, y: 100, rotationX: 18, rotationY: i % 2 ? -14 : 14, scale: 0.9 },
        { opacity: 1, z: 0, y: 0, rotationX: 0, rotationY: 0, scale: 1, duration: i === 0 ? 0.6 : 1.1, ease: 'power2.out' }, i * 2);
      if (i < n - 1) tl.to(card, { opacity: 0, z: 950, y: -50, scale: 1.18, rotationX: -8, duration: 0.85, ease: 'power2.in' }, i * 2 + 1.3);
    });
    const total = (n - 1) * 2 + 1.1;
    ScrollTrigger.create({
      trigger: sec, pin: true, start: 'top top', end: () => '+=' + Math.round(innerHeight * 0.9 * n), scrub: 0.8, animation: tl, anticipatePin: 1, invalidateOnRefresh: true, refreshPriority: 10,
      onUpdate: (self) => {
        const idx = clamp(Math.floor((self.progress * total + 0.1) / 2), 0, n - 1);
        if (countEl && countEl.textContent !== '0' + (idx + 1)) countEl.textContent = '0' + (idx + 1);
      }
    });
    return () => { sec.classList.remove('is-pinned'); gsap.set(cards, { clearProps: 'all' }); };
  });

  // ---------- marquees speed up with scroll velocity ----------
  let measureMarquee = () => {};
  const rows = $$('[data-marquee]').map((el) => ({ el, dir: +el.dataset.marquee || -1, x: 0, w: 0 }));
  if (rows.length && !reduced) {
    const measure = () => rows.forEach((r) => { r.w = r.el.scrollWidth / 2; r.x = r.dir > 0 ? -r.w : 0; });
    measureMarquee = measure;
    document.fonts.ready.then(measure); measure();
    let vis = false;
    new IntersectionObserver(([e]) => { vis = e.isIntersecting; }, { rootMargin: '100px' }).observe(rows[0].el.parentElement);
    gsap.ticker.add((time, dt) => {
      if (!vis) return;
      const v = Math.abs(lenis?.velocity || 0);
      const step = (0.7 + v * 0.55) * (dt / 16.7);
      rows.forEach((r) => {
        if (!r.w) return;
        r.x += r.dir * step;
        if (r.dir < 0 && r.x <= -r.w) r.x += r.w;
        if (r.dir > 0 && r.x >= 0) r.x -= r.w;
        r.el.style.transform = `translate3d(${r.x.toFixed(1)}px,0,0)`;
      });
    });
  }

  // ---------- 3D tilt on the hero terminal (desktop pointer) ----------
  if (fine && !reduced) {
    $$('[data-tilt]').forEach((el) => {
      gsap.set(el, { transformPerspective: 900 });
      const rx = gsap.quickTo(el, 'rotationX', { duration: 0.6, ease: 'power3.out' });
      const ry = gsap.quickTo(el, 'rotationY', { duration: 0.6, ease: 'power3.out' });
      el.addEventListener('pointermove', (e) => { const r = el.getBoundingClientRect(); ry(((e.clientX - r.left) / r.width - 0.5) * 9); rx(-((e.clientY - r.top) / r.height - 0.5) * 9); });
      el.addEventListener('pointerleave', () => { rx(0); ry(0); });
    });
  }

  // ---------- velocity skew on big headings (desktop) ----------
  mm.add('(min-width: 900px) and (prefers-reduced-motion: no-preference)', () => {
    if (reduced) return;
    const els = $$('[data-skew]');
    const setters = els.map((el) => gsap.quickTo(el, 'skewY', { duration: 0.5, ease: 'power3.out' }));
    const onScroll = ({ velocity }) => { const v = clamp(velocity * 0.1, -3.5, 3.5); setters.forEach((s) => s(v)); };
    lenis?.on('scroll', onScroll);
    return () => { lenis?.off('scroll', onScroll); gsap.set(els, { skewY: 0 }); };
  });

  // ---------- hero terminal types itself ----------
  function typeHero() {
    const term = $('[data-hero-term]');
    if (!term || reduced) return;
    const lineEls = $$('.tl', term);
    const cmds = $$('[data-type]', term).map((el) => ({ el, text: el.textContent }));
    lineEls.forEach((l) => { l.style.visibility = 'hidden'; });
    cmds.forEach((c) => { c.el.textContent = ''; });
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    (async () => {
      await sleep(900);
      for (let i = 0; i < lineEls.length; i++) {
        const l = lineEls[i];
        l.style.visibility = 'visible';
        const c = cmds.find((x) => l.contains(x.el));
        if (c) { for (const ch of c.text) { c.el.textContent += ch; await sleep(32 + Math.random() * 40); } await sleep(260); }
        else await sleep(i === lineEls.length - 1 ? 0 : 340);
      }
    })();
  }

  // refresh after fonts settle / theme change (they change heights)
  document.fonts.ready.then(() => ScrollTrigger.refresh());
  addEventListener('sig:theme', () => setTimeout(() => ScrollTrigger.refresh(), 700));
  let rT;
  addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => ScrollTrigger.refresh(), 200); });

  return {
    lenis,
    start() { lenis?.start(); },
    stop() { lenis?.stop(); },
    refresh() { measureMarquee(); ScrollTrigger.refresh(); },
    scrollTo(t) { lenis ? lenis.scrollTo(t) : $(t)?.scrollIntoView(); },
    onVelocity(fn) { lenis?.on('scroll', ({ velocity }) => fn(velocity)); },
    intro() {
      typeHero();
      if (reduced || !heroChars.length) return;
      gsap.to(heroChars, { yPercent: 0, rotate: 0, opacity: 1, duration: 1.5, ease: 'expo.out', stagger: { each: 0.05, from: 'start' } });
      gsap.to('.hero__meta, .hero__copy, .hero__term, .hero__scroll', { opacity: 1, y: 0, duration: 1.1, ease: 'expo.out', delay: 0.45, stagger: 0.12 });
    }
  };
}
