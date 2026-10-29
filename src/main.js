// Entry stays tiny on purpose: CSS + loader + cursor + sound + social.
// GSAP/Lenis (scroll chunk), ASCII art and the chat are loaded lazily and
// downloaded in the background WHILE the loader plays.
import './styles/tokens.css';
import './styles/base.css';
import './styles/ui.css';
import './styles/sections.css';
import './styles/chat.css';

import { sound } from './modules/sound.js';
import { initCursor } from './modules/cursor.js';
import { runLoader } from './modules/loader.js';
import { initSocial } from './modules/social.js';

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
  // capture phase + removal => chat.js's own handlers never double-fire
  openers.forEach((o) => o.addEventListener('click', first, true));
  openers.forEach((o) => o.addEventListener('pointerenter', () => chatApi(), { once: true })); // warm up on hover
}

async function boot() {
  sound.init();
  initCursor({ sound });
  initSocial({ sound });
  initSoundToggle();
  wireChatLoader();

  // Start downloading the heavy chunks right now, in parallel with the loader.
  let scroll = null;
  const scrollReady = import('./modules/scroll.js').then((m) => { scroll = m.initScroll({ sound }); });
  const asciiMod = import('./modules/ascii.js');

  const lines = (document.getElementById('loader')?.dataset.lines || 'RUH|RABIN').split('|');
  await runLoader({ sound, lines, tasks: [scrollReady, asciiMod] });
  await scrollReady;

  const ascii = await asciiMod;
  ascii.initAscii();           // lazy: each canvas builds itself near the viewport
  ascii.initWaves();
  ascii.initDecode();
  const field = document.querySelector('.hero__field');
  if (field && !lite) ascii.initHeroField(field); // skipped on low-end / data-saver devices

  scroll.start();
  scroll.intro();

  if (new URLSearchParams(location.search).get('chat') === 'open') setTimeout(() => chatApi().then((c) => c.open()), 900);
  if (!lite) idle(() => setTimeout(chatApi, 4000)); // warm the chat chunk when the browser is idle
}

boot().catch((err) => {
  // Never leave the visitor stuck behind the loader or an invisible hero.
  console.error('[signal] boot failed', err);
  document.getElementById('loader')?.remove();
  html.classList.remove('is-loading');
  html.classList.add('hero-ready');
});
