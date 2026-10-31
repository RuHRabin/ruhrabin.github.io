// Entry stays tiny on purpose: CSS + loader + cursor + sound + social + theme.
// GSAP/Lenis (scroll chunk), ASCII art, background field, terminal and chat are loaded lazily and
// download in the background WHILE the loader plays.
import './styles/tokens.css';
import './styles/base.css';
import './styles/ui.css';
import './styles/sections.css';
import './styles/chat.css';

import { sound } from './modules/sound.js';
import { initCursor } from './modules/cursor.js';
import { runLoader } from './modules/loader.js';
import { initSocial } from './modules/social.js';
import { initTheme } from './modules/theme.js';

const html = document.documentElement;
const lite = html.classList.contains('is-lite');
const idle = (fn) => (window.requestIdleCallback || ((f) => setTimeout(f, 200)))(fn);

function initSoundToggle() {
  const btn = document.querySelector('[data-sound-toggle]');
  const label = document.querySelector('[data-sound-label]');
  if (!btn) return;
  const FRAMES = ['.:|:.', ':|:.:', '|:.:|', ':.:|:'];
  let i = 0, timer = 0;
  const render = (on) => {
    const sr = btn.querySelector('[data-sound-sr]');
    if (sr) sr.textContent = on ? 'Mute sound' : 'Enable sound';
    clearInterval(timer);
    if (on) {
      const draw = () => { label.textContent = `[SND:ON ${FRAMES[i++ % FRAMES.length]}]`; };
      draw();
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) timer = setInterval(() => { if (!document.hidden) draw(); }, 220);
    } else label.textContent = '[SND:OFF]';
  };
  sound.onChange(render);
  render(sound.isOn());
  btn.addEventListener('click', () => sound.toggle());
}

function initMenu() {
  const btn = document.querySelector('[data-menu-toggle]');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const open = html.classList.toggle('menu-open');
    btn.setAttribute('aria-expanded', String(open));
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') html.classList.remove('menu-open'); });
  document.querySelectorAll('[data-menu] [data-chat-open]').forEach((b) => b.addEventListener('click', () => html.classList.remove('menu-open')));
}

// Chat is a separate chunk: fetched on first click / ?chat=open / long idle.
let chatPromise = null;
function chatApi() {
  if (!chatPromise) chatPromise = import('./modules/chat.js').then((m) => m.initChat({ sound }));
  return chatPromise;
}
function wireChatLoader() {
  const openers = [...document.querySelectorAll('[data-chat-open]')];
  const first = (e) => {
    e.stopImmediatePropagation();
    openers.forEach((o) => o.removeEventListener('click', first, true));
    chatApi().then((c) => c.open());
  };
  openers.forEach((o) => o.addEventListener('click', first, true));
  openers.forEach((o) => o.addEventListener('pointerenter', () => chatApi(), { once: true }));
}

// Terminal chunk loads when its section is near the viewport (or when a chip is pressed).
function wireTerminal() {
  const sec = document.getElementById('terminal');
  if (!sec) return;
  let p = null;
  const load = () => (p ||= import('./modules/terminal.js').then((m) => m.initTerminal({ sound, openChat: () => chatApi().then((c) => c.open()) })));
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); load(); } }, { rootMargin: '1400px 0px' });
    io.observe(sec);
  } else load();
}

async function boot() {
  initTheme();
  sound.init();
  initCursor({ sound });
  initSocial({ sound });
  initSoundToggle();
  initMenu();
  wireChatLoader();
  wireTerminal();

  // Start downloading the heavy chunks right now, in parallel with the loader.
  // (the modules are only downloaded + parsed while the loader plays; their setup runs AFTER it, so the main
  //  thread stays free during loading and ScrollTrigger measures the real, visible page)
  const scrollMod = import('./modules/scroll.js');
  const asciiMod = import('./modules/ascii.js');

  await runLoader({ sound, tasks: [scrollMod, asciiMod] });
  const scroll = (await scrollMod).initScroll({ sound });

  const ascii = await asciiMod;
  ascii.initAscii();           // lazy: each canvas builds itself near the viewport
  ascii.initDecode({ sound });

  scroll.start();
  scroll.intro();

  // background starfield (idle): reacts to scroll velocity
  idle(() => import('./modules/bg.js').then((m) => { const bg = m.initBg({ lite }); scroll.onVelocity((v) => bg.push(v)); }));

  if (new URLSearchParams(location.search).get('chat') === 'open') setTimeout(() => chatApi().then((c) => c.open()), 900);
  if (!lite) idle(() => setTimeout(chatApi, 4000)); // warm the chat chunk when the browser is idle
}

boot().catch((err) => {
  console.error('[signal] boot failed', err);
  document.getElementById('loader')?.remove();
  html.classList.remove('is-loading');
  html.classList.add('hero-ready');
});
