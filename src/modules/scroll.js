// Scroll: Lenis smooth scroll synced to GSAP ScrollTrigger.
// Feel inspired by igloo.inc / jesperlandberg.com: pinned horizontal band, mask reveals,
// clip-path reveals, velocity skew, ASCII progress bar. Heavy parts are disabled on
// touch-narrow screens and for prefers-reduced-motion.
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function splitChars(el) {
  const text = el.textContent;
  el.textContent = '';
  const chars = [...text].map((c) => {
    const s = document.createElement('span');
    s.className = 'char';
    s.textContent = c;
    el.appendChild(s);
    return s;
  });
  return chars;
}

export function initScroll({ sound }) {
  const html = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || html.classList.contains('is-bot');
  let lenis = null;

  // ---------- smooth scroll ----------
  if (!reduced) {
    lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.95, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    lenis.stop(); // locked until the loader finishes
  }

  // anchor links
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href');
    const target = id === '#' ? null : document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(target, { duration: 1.5, easing: (t) => 1 - Math.pow(1 - t, 4) });
    else target.scrollIntoView({ behavior: 'auto' });
  });

  // ---------- hero: split characters ----------
  const heroLines = [...document.querySelectorAll('[data-split]')];
  const heroChars = heroLines.flatMap(splitChars);
  if (!reduced) gsap.set(heroChars, { yPercent: 115, rotate: 6 });
  html.classList.add('hero-ready');

  // ---------- ASCII progress bar ----------
  const bar = document.querySelector('[data-progress]');
  let lastBar = '';
  const updateBar = () => {
    if (!bar) return;
    const max = document.documentElement.scrollHeight - innerHeight;
    const p = max > 0 ? clamp(scrollY / max, 0, 1) : 0;
    const f = Math.round(p * 20);
    const s = `[${'#'.repeat(f)}${'-'.repeat(20 - f)}] ${String(Math.round(p * 100)).padStart(3, '0')}%`;
    if (s !== lastBar) { bar.textContent = s; lastBar = s; }
    const f2 = document.getElementById('footer');
    if (f2) bar.parentElement.classList.toggle('is-hidden', f2.getBoundingClientRect().top < innerHeight * 0.7);
  };
  addEventListener('scroll', updateBar, { passive: true });
  updateBar();

  // ---------- hero scroll cue + clock ----------
  const cue = document.querySelector('[data-scroll-cue]');
  if (cue && !reduced) { const f = ['v', 'V', 'v', '.']; let i = 0; setInterval(() => { cue.textContent = f[i++ % f.length]; }, 420); }
  const clock = document.querySelector('[data-clock]');
  if (clock) {
    const tz = clock.dataset.tz;
    const fmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: tz });
    const tick = () => { clock.textContent = fmt.format(new Date()) + ' ' + (tz.split('/')[1] || 'LOCAL').toUpperCase(); };
    tick(); setInterval(tick, 1000);
  }

  // ---------- section-change sound + social visibility ----------
  document.querySelectorAll('[data-sound-section]').forEach((sec) => {
    ScrollTrigger.create({ trigger: sec, start: 'top 55%', end: 'bottom 55%', onEnter: () => sound.play('section'), onEnterBack: () => sound.play('section') });
  });
  const socials = document.querySelector('.socials');
  ScrollTrigger.create({ trigger: '#contact', start: 'top 55%', onToggle: (s) => socials?.classList.toggle('is-hidden', s.isActive || s.progress > 0) });
  const prog = document.querySelector('.progress');
  ScrollTrigger.create({ trigger: '#footer', start: 'top 70%', onToggle: (s) => { if (s.isActive) socials?.classList.add('is-hidden'); prog?.classList.toggle('is-hidden', s.isActive); } });

  // ---------- reveals + pin (responsive) ----------
  const mm = gsap.matchMedia();

  mm.add('(prefers-reduced-motion: no-preference)', () => {
    if (reduced) return;
    // mask headings
    gsap.utils.toArray('[data-reveal="mask"]').forEach((h) => {
      const inners = h.querySelectorAll('.mask__in');
      gsap.set(inners, { yPercent: 110 });
      ScrollTrigger.create({
        trigger: h, start: 'top 88%', once: true,
        onEnter: () => gsap.to(inners, { yPercent: 0, duration: 1.1, ease: 'expo.out', stagger: 0.09 })
      });
    });
    // fade-up groups
    gsap.utils.toArray('[data-reveal="fade"]').forEach((el) => {
      const kids = el.hasAttribute('data-stagger') ? [...el.children] : [el];
      gsap.set(kids, { opacity: 0, y: 28 });
      ScrollTrigger.create({
        trigger: el, start: 'top 88%', once: true,
        onEnter: () => gsap.to(kids, { opacity: 1, y: 0, duration: 0.9, ease: 'expo.out', stagger: 0.09 })
      });
    });
    // clip-path image/panel reveal + inner scale
    gsap.utils.toArray('[data-reveal="clip"]').forEach((el) => {
      const inner = el.querySelector('canvas');
      gsap.set(el, { clipPath: 'inset(100% 0% 0% 0%)' });
      if (inner) gsap.set(inner, { scale: 1.18 });
      ScrollTrigger.create({
        trigger: el, start: 'top 85%', once: true,
        onEnter: () => {
          gsap.to(el, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.3, ease: 'expo.inOut' });
          if (inner) gsap.to(inner, { scale: 1, duration: 1.6, ease: 'expo.out' });
        }
      });
    });
    // hero parallax
    gsap.to('.hero__title', { yPercent: -14, ease: 'none', scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true } });
    gsap.to('.hero__field', { opacity: 0.2, ease: 'none', scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true } });
  });

  // desktop: pinned horizontal channels band
  mm.add('(min-width: 900px) and (prefers-reduced-motion: no-preference)', () => {
    if (reduced) return;
    const sec = document.querySelector('#channels');
    const track = sec.querySelector('[data-track]');
    sec.classList.add('is-pinned');
    ScrollTrigger.refresh();
    const dist = () => Math.max(0, track.scrollWidth - innerWidth + parseFloat(getComputedStyle(track).paddingRight) * 0 + 40);
    const tween = gsap.to(track, {
      x: () => -dist(), ease: 'none',
      scrollTrigger: { trigger: sec, pin: true, scrub: 0.6, start: 'top top', end: () => '+=' + dist(), invalidateOnRefresh: true, anticipatePin: 1 }
    });
    gsap.utils.toArray('[data-panel-big]').forEach((big) => {
      gsap.fromTo(big, { xPercent: 7 }, { xPercent: -7, ease: 'none', scrollTrigger: { trigger: big.closest('.panel'), containerAnimation: tween, start: 'left right', end: 'right left', scrub: true } });
    });
    return () => { sec.classList.remove('is-pinned'); gsap.set(track, { clearProps: 'all' }); };
  });

  // velocity skew (desktop, motion allowed)
  mm.add('(min-width: 900px) and (prefers-reduced-motion: no-preference)', () => {
    if (reduced) return;
    const els = gsap.utils.toArray('[data-skew]');
    const setters = els.map((el) => gsap.quickTo(el, 'skewY', { duration: 0.5, ease: 'power3.out' }));
    const onScroll = ({ velocity }) => { const v = clamp(velocity * 0.1, -3.5, 3.5); setters.forEach((s) => s(v)); };
    lenis?.on('scroll', onScroll);
    return () => { lenis?.off('scroll', onScroll); gsap.set(els, { skewY: 0 }); };
  });

  // refresh after fonts settle (they change heights)
  document.fonts.ready.then(() => ScrollTrigger.refresh());
  let rT;
  addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => ScrollTrigger.refresh(), 200); });

  return {
    lenis,
    start() { lenis?.start(); },
    stop() { lenis?.stop(); },
    scrollTo(t) { lenis ? lenis.scrollTo(t) : document.querySelector(t)?.scrollIntoView(); },
    intro() {
      if (reduced || !heroChars.length) return;
      gsap.to(heroChars, { yPercent: 0, rotate: 0, duration: 1.4, ease: 'expo.out', stagger: { each: 0.045, from: 'start' } });
      gsap.from('.hero__meta, .hero__foot', { opacity: 0, y: 16, duration: 1, ease: 'expo.out', delay: 0.5, stagger: 0.1 });
    }
  };
}
