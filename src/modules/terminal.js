// Interactive terminal (lazy chunk). Everything it prints comes from profile.json.
// Commands: help, whoami, about, skills, stack, ls, cd <section>, links, contact, github, x, neofetch,
// theme [linux|mac], sound [on|off], ask [question], clear, date, echo, uname, sudo ...
import profile from '../data/profile.json';
import { theme } from './theme.js';

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const LOGO = `██████╗ ██████╗
██╔══██╗██╔══██╗
██████╔╝██████╔╝
██╔══██╗██╔══██╗
██║  ██║██║  ██║
╚═╝  ╚═╝╚═╝  ╚═╝`;
const SECTIONS = ['focus', 'stack', 'archive', 'terminal', 'about', 'contact'];

export function initTerminal({ sound, openChat }) {
  const root = document.querySelector('[data-terminal]');
  if (!root) return;
  const log = root.querySelector('[data-term-log]');
  const form = root.querySelector('[data-term-form]');
  const input = root.querySelector('[data-term-input]');
  const prompt = root.dataset.prompt || 'rabin@ruhrbin';
  const hist = []; let hi = 0;

  const print = (html, cls = 'tl--out') => {
    const p = document.createElement('p');
    p.className = 'tl ' + cls;
    p.innerHTML = html;
    log.appendChild(p);
    log.scrollTop = log.scrollHeight;
  };
  const rows = (arr) => arr.forEach((r) => print(r));
  const go = (id) => { const a = document.createElement('a'); a.href = '#' + id; a.hidden = true; document.body.appendChild(a); a.click(); a.remove(); };
  const p = profile;
  const L = p.links;

  const C = {
    help: () => rows([
      '<span class="ok">help</span>       list commands',
      '<span class="ok">whoami</span>     who is this',
      '<span class="ok">about</span>      the short story',
      '<span class="ok">skills</span>     what I do best',
      '<span class="ok">stack</span>      tools I reach for',
      '<span class="ok">ls / cd</span>    sections (try: cd about)',
      '<span class="ok">links</span>      GitHub, X, email',
      '<span class="ok">neofetch</span>   system info, rabin edition',
      '<span class="ok">theme</span>      theme linux | mac',
      '<span class="ok">sound</span>      sound on | off',
      '<span class="ok">ask</span>        open the SIG assistant',
      '<span class="ok">clear</span>      clear the screen'
    ]),
    whoami: () => { print(`<span class="hl">${esc(p.name)}</span> (${esc(p.shortName)})`); print(esc((p.roles || []).join(' · '))); print(esc(p.location)); },
    about: () => print(esc(p.manifesto.text)),
    skills: () => p.channels.items.forEach((c) => { print(`<span class="ok">${esc(c.title)}</span>`); c.bullets.forEach((b) => print('  - ' + esc(b))); }),
    stack: () => p.stack.groups.forEach((g) => print(`<span class="ok">${esc(g.title.padEnd(14))}</span>${esc(g.items.join(', '))}`)),
    ls: () => print(SECTIONS.map((s) => s + '/').join('  ')),
    cd: (a) => {
      const id = (a[0] || '').replace(/\/$/, '');
      if (!id || id === '~') return go('hero');
      if (SECTIONS.includes(id)) { print(`moving to <span class="ok">${esc(id)}</span> ...`); go(id); } else print(`cd: no such section: ${esc(id)}. try: ls`);
    },
    links: () => {
      print(`github   <a href="${esc(L.github)}" target="_blank" rel="noopener">${esc(L.github)}</a>`);
      print(`x        <a href="${esc(L.x)}" target="_blank" rel="noopener">${esc(L.x)}</a>`);
      L.emails.forEach((m) => print(`email    <a href="mailto:${esc(m)}">${esc(m)}</a>`));
    },
    github: () => { print('opening GitHub ...'); window.open(L.github, '_blank', 'noopener'); },
    x: () => { print('opening X ...'); window.open(L.x, '_blank', 'noopener'); },
    neofetch: () => {
      print(`<pre>${esc(LOGO)}</pre>`);
      print(`<span class="ok">${esc(prompt)}</span>`);
      print(`<span class="ok">name</span>    ${esc(p.name)}`);
      print(`<span class="ok">role</span>    ${esc(p.role)}`);
      (p.about.facts || []).forEach(([k, v]) => print(`<span class="ok">${esc(k.toLowerCase().padEnd(7))}</span>${esc(v)}`));
      print(`<span class="ok">base</span>    ${esc(p.location)}`);
      print(`<span class="ok">theme</span>   ${theme.get() === 'mac' ? 'macOS glass' : 'Arch terminal'}`);
    },
    theme: (a) => {
      const want = a[0] === 'mac' || a[0] === 'macos' ? 'mac' : a[0] === 'linux' || a[0] === 'arch' ? 'linux' : null;
      if (a[0] && !want) return print('usage: theme [linux|mac]');
      const r = root.getBoundingClientRect();
      theme.set(want || (theme.get() === 'mac' ? 'linux' : 'mac'), { x: r.left + r.width / 2, y: r.top + r.height / 2 });
      print(`theme -> <span class="ok">${want || 'toggled'}</span>`);
    },
    sound: (a) => {
      if (a[0] === 'on') { sound.enable(); print('sound: <span class="ok">on</span>'); }
      else if (a[0] === 'off') { sound.disable(); print('sound: off'); }
      else print('usage: sound [on|off]');
    },
    ask: () => { print('opening SIG ...'); openChat(); },
    contact: () => C.links(),
    date: () => print(new Date().toString()),
    pwd: () => print('/home/rabin'),
    uname: () => print('RR/OS 1.0 dual-boot (linux, macOS) ruhrbin.site'),
    echo: (a) => print(esc(a.join(' '))),
    clear: () => { log.innerHTML = ''; },
    sudo: () => print('rabin is not in the sudoers file. This incident will be reported.'),
    rm: () => print('nice try.'),
    exit: () => print('there is no escape. try: cd contact'),
    vim: () => print('you are now stuck in vim. (just kidding. type: clear)'),
    cat: () => print('cat: use <span class="ok">about</span> or <span class="ok">whoami</span> instead')
  };

  const run = (line) => {
    const raw = line.trim();
    print(`<span class="tl__p">${esc(prompt)}:~$</span> ${esc(raw)}`, 'tl');
    if (!raw) return;
    hist.push(raw); hi = hist.length;
    const [cmd, ...args] = raw.split(/\s+/);
    const fn = C[cmd.toLowerCase()];
    if (fn) fn(args); else print(`command not found: ${esc(cmd)}. type <span class="ok">help</span>`);
    if (sound) sound.play('click');
  };

  form.addEventListener('submit', (e) => { e.preventDefault(); run(input.value); input.value = ''; });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); if (hi > 0) input.value = hist[--hi]; }
    else if (e.key === 'ArrowDown') { e.preventDefault(); input.value = hi < hist.length - 1 ? hist[++hi] : ((hi = hist.length), ''); }
    else if (e.key === 'Tab') {
      e.preventDefault();
      const v = input.value.trim().toLowerCase();
      const m = Object.keys(C).filter((k) => k.startsWith(v));
      if (m.length === 1) input.value = m[0];
    }
  });
  root.addEventListener('click', (e) => { if (!e.target.closest('a, button')) input.focus({ preventScroll: true }); });
  document.querySelectorAll('[data-term-run]').forEach((b) => b.addEventListener('click', () => run(b.dataset.termRun)));
}
