// SIG: terminal-style AI assistant with optional voice.
// - Online: POSTs {messages} to your Cloudflare Worker (VITE_CHAT_ENDPOINT). Gemini key stays secret there.
// - Offline/fallback: answers from profile.json (chat.answers), so it never feels broken.
// - Voice: Web Speech API (speech-to-text) + speechSynthesis (spoken replies). Feature-detected.
import profile from '../data/profile.json';

const ENDPOINT = import.meta.env.VITE_CHAT_ENDPOINT || '';
const MAX_HISTORY = 8;

function localAnswer(q) {
  const s = q.toLowerCase();
  const a = profile.chat.answers;
  if (/^(hi|hello|hey|yo)\b/.test(s)) return profile.chat.greeting;
  if (/work|project|github|repo|portfolio|code|open.?source/.test(s)) return a.work;
  if (/skill|stack|tech|what can|build|design|motion|sound|ai\b/.test(s)) return a.skills;
  if (/hire|contact|email|mail|reach|available|freelance|collab|twitter|\bx\b/.test(s)) return a.hire;
  if (/who|about|rabin|bio|yourself|name/.test(s)) return a.about;
  return a.fallback;
}

export function initChat({ sound }) {
  const root = document.querySelector('[data-chat]');
  if (!root) return { open() {}, close() {} };
  const log = root.querySelector('[data-chat-log]');
  const chips = root.querySelector('[data-chat-chips]');
  const form = root.querySelector('[data-chat-form]');
  const input = root.querySelector('[data-chat-input]');
  const micBtn = root.querySelector('[data-chat-mic]');
  const speakBtn = root.querySelector('[data-chat-speak]');
  const openers = [...document.querySelectorAll('[data-chat-open]')];
  root.setAttribute('data-lenis-prevent', '');

  let history = [], busy = false, isOpen = false, lastFocus = null, speakOn = false, typingTimer = 0;

  // ---------- voice ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const canTalk = 'speechSynthesis' in window;
  if (!SR) micBtn.hidden = true;
  if (!canTalk) speakBtn.hidden = true;
  let rec = null, listening = false;
  if (SR) {
    rec = new SR(); rec.lang = 'en-US'; rec.interimResults = true; rec.maxAlternatives = 1; rec.continuous = false;
    rec.onresult = (e) => {
      const t = [...e.results].map((r) => r[0].transcript).join(' ');
      input.value = t;
      if (e.results[e.results.length - 1].isFinal) { stopListen(); send(t); }
    };
    rec.onerror = () => stopListen();
    rec.onend = () => stopListen();
  }
  function startListen() { if (!rec || listening) return; try { rec.start(); listening = true; micBtn.classList.add('is-on'); micBtn.textContent = '[REC...]'; input.placeholder = 'listening...'; } catch { /* already started */ } }
  function stopListen() { listening = false; micBtn.classList.remove('is-on'); micBtn.textContent = '[MIC]'; input.placeholder = 'type or speak...'; try { rec?.stop(); } catch { /* ignore */ } }
  micBtn.addEventListener('click', () => (listening ? stopListen() : startListen()));
  speakBtn.addEventListener('click', () => {
    speakOn = !speakOn;
    speakBtn.setAttribute('aria-pressed', speakOn);
    speakBtn.classList.toggle('is-on', speakOn);
    speakBtn.textContent = speakOn ? '[VOX:ON]' : '[VOX:OFF]';
    if (!speakOn) speechSynthesis.cancel();
  });
  const speak = (text) => {
    if (!speakOn || !canTalk) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[#*_`]/g, ''));
    u.lang = 'en-US'; u.rate = 1.02; u.pitch = 0.95;
    speechSynthesis.speak(u);
  };

  // ---------- messages ----------
  const addMsg = (cls, text = '') => {
    const el = document.createElement('div');
    el.className = 'msg ' + cls;
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  };

  function typeOut(el, text) {
    return new Promise((resolve) => {
      clearInterval(typingTimer);
      log.setAttribute('aria-busy', 'true');
      let i = 0;
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) { el.textContent = text; log.removeAttribute('aria-busy'); return resolve(); }
      typingTimer = setInterval(() => {
        i += 2;
        el.textContent = text.slice(0, i);
        if (i % 4 === 0) sound.play('type');
        log.scrollTop = log.scrollHeight;
        if (i >= text.length) { clearInterval(typingTimer); el.textContent = text; log.removeAttribute('aria-busy'); resolve(); }
      }, 16);
    });
  }

  const typingIndicator = () => {
    const el = addMsg('msg--bot msg--typing', '');
    const f = ['|', '/', '-', '\\']; let i = 0;
    const t = setInterval(() => { el.textContent = f[i++ % 4] + ' thinking'; }, 110);
    return () => { clearInterval(t); el.remove(); };
  };

  async function ask(q) {
    history.push({ role: 'user', content: q });
    history = history.slice(-MAX_HISTORY);
    if (ENDPOINT) {
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 15000);
        const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history }), signal: ctrl.signal });
        clearTimeout(to);
        if (!res.ok) throw new Error('bad status ' + res.status);
        const data = await res.json();
        if (data?.reply) return String(data.reply);
      } catch { /* fall through to local answer */ }
    }
    await new Promise((r) => setTimeout(r, 450));
    return localAnswer(q);
  }

  async function send(text) {
    const q = (text || '').trim().slice(0, 300);
    if (!q || busy) return;
    busy = true; input.value = '';
    addMsg('msg--user', q);
    const stop = typingIndicator();
    const answer = await ask(q);
    stop();
    history.push({ role: 'assistant', content: answer });
    const el = addMsg('msg--bot', '');
    await typeOut(el, answer);
    speak(answer);
    busy = false;
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); send(input.value); });
  profile.chat.chips.forEach((c) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip-btn'; b.textContent = c;
    b.addEventListener('click', () => send(c));
    chips.appendChild(b);
  });

  // ---------- open / close + focus trap ----------
  const focusables = () => [...root.querySelectorAll('button:not([hidden]), input, [href]')].filter((el) => !el.disabled);
  function open() {
    if (isOpen) return;
    isOpen = true; lastFocus = document.activeElement;
    root.hidden = false; root.classList.add('is-open');
    openers.forEach((o) => o.setAttribute('aria-expanded', 'true'));
    if (!log.children.length) addMsg('msg--bot', profile.chat.greeting);
    sound.play('open');
    setTimeout(() => input.focus(), 50);
  }
  function close() {
    if (!isOpen) return;
    isOpen = false; stopListen(); speechSynthesis?.cancel?.();
    root.hidden = true; root.classList.remove('is-open');
    openers.forEach((o) => o.setAttribute('aria-expanded', 'false'));
    sound.play('close');
    lastFocus?.focus?.();
  }
  openers.forEach((o) => o.addEventListener('click', () => (isOpen ? close() : open())));
  root.querySelector('[data-chat-close]').addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (!isOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Tab') {
      const f = focusables(); if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  return { open, close };
}
