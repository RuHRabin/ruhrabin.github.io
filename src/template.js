// Build-time HTML template. Runs in Node (inside vite.config.js), NOT in the browser.
// Content comes from src/data/profile.json, so the page is real static HTML (good for SEO).
import figlet from 'figlet';

const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** *word* -> <em>word</em> (italic serif accent) */
const rich = (s = '') => esc(s).replace(/\*(.+?)\*/g, '<em>$1</em>');

/** "A|B|C" -> masked lines (for scroll mask-reveal) */
const lines = (s = '') =>
  s.split('|').map((l) => `<span class="mask"><span class="mask__in">${rich(l)}</span></span>`).join(' ');

const art = (text, font = 'ANSI Shadow') => {
  try { return figlet.textSync(text, { font }).replace(/\s+$/gm, '').replace(/^\n+|\n+$/g, ''); } catch { return text; }
};

const isExternal = (u = '') => /^https?:\/\//i.test(u) && !u.includes('ruhrbin.site');
const linkAttrs = (u) => (isExternal(u) ? ' target="_blank" rel="noopener"' : '');

const ICONS = {
  github: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.14c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.11 3.04.74.8 1.19 1.83 1.19 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117Z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M3 5.500h18v13H3zM3.500 6l8.500 7 8.500-7"/></svg>'
};

// Sections shown in the top bar, mobile menu and footer. Edit labels here.
const NAV = [
  ['focus', 'Focus'], ['stack', 'Stack'], ['archive', 'Archive'], ['terminal', 'Terminal'], ['about', 'About'], ['contact', 'Contact']
];

/** A window frame. `tl` / `tm` = title in the Linux / macOS theme. */
const win = ({ tl, tm, body, cls = '', attrs = '', tag = 'div' }) => `
<${tag} class="win ${cls}" ${attrs}>
  <div class="win__bar" aria-hidden="true"><span class="win__dots"><i></i><i></i><i></i></span><span class="win__title" data-linux="${esc(tl)}" data-mac="${esc(tm)}"></span><span class="win__spacer"></span></div>
  <div class="win__body">${body}</div>
</${tag}>`;

const tswitch = () => `<button class="tswitch" type="button" data-theme-toggle role="switch" aria-checked="false" aria-label="Switch theme: Linux or macOS style">
  <i class="tswitch__thumb"></i>
  <span class="tswitch__opt" data-v="linux"><span class="full">LINUX</span><span class="short">&gt;_</span></span>
  <span class="tswitch__opt" data-v="mac"><span class="full">macOS</span><span class="short">&#9680;</span></span>
</button>`;

export function renderPage(p) {
  const { github, x, emails } = p.links;
  const mail1 = emails[0];
  const lineNames = p.heroLines;
  const handleGh = github.split('/').pop();
  const handleX = x.split('/').pop();
  const roles = p.roles || [];
  const stackItems = (p.stack?.groups || []).flatMap((g) => g.items);
  const marq = [...stackItems, ...p.channels.items.map((c) => c.title)];
  const half = Math.ceil(marq.length / 2);
  const row = (arr) => [...arr, ...arr].map((w) => `<span>${esc(w)}</span>`).join('');
  const words = (p.manifesto.text || '').split(/\s+/).map((w) => `<span class="w">${esc(w)}</span>`).join(' ');

  const projects = (p.projects || []).length
    ? `<ul class="projects" data-reveal="fade" data-stagger>
        ${p.projects.map((pr, i) => `<li><a href="${esc(pr.url)}" target="_blank" rel="noopener" data-cursor="view" data-cursor-label="OPEN">
          <span class="projects__n">${String(i + 1).padStart(2, '0')}</span><strong>${esc(pr.title)}</strong><span>${esc(pr.text || '')}</span></a></li>`).join('')}
      </ul>` : '';

  // ----- footer columns (all editable from profile.json) -----
  const f = p.footer || {};
  const col = (title, links) => `<nav class="footer__col" aria-label="${esc(title)}"><h3>${esc(title)}</h3><ul>${links
    .map((l) => `<li><a href="${esc(l.url)}"${linkAttrs(l.url)}${l.rel ? ` rel="${esc(l.rel)}"` : ''}>${esc(l.label)}</a></li>`).join('')}</ul></nav>`;
  const colsList = [
    col('Navigate', NAV.map(([id, label]) => ({ url: '#' + id, label }))),
    col('Connect', [
      { label: 'GitHub', url: github, rel: 'me noopener' },
      { label: 'X / Twitter', url: x, rel: 'me noopener' },
      ...emails.map((m) => ({ label: m, url: 'mailto:' + m }))
    ]),
    (f.pages || []).length ? col('Pages', f.pages) : '',
    ...(f.columns || []).filter((c) => (c.links || []).length).map((c) => col(c.title, c.links))
  ].filter(Boolean);
  const footCols = colsList.join('');
  const colCount = colsList.length;
  const legal = (f.legal || []).length
    ? `<ul>${f.legal.map((l) => `<li><a href="${esc(l.url)}"${linkAttrs(l.url)}>${esc(l.label)}</a></li>`).join('')}</ul>` : '';

  return /* html */ `
<a class="skip" href="#main">Skip to content</a>

<div class="loader" id="loader" role="status" aria-live="polite" data-name="${esc(p.shortName)}">
  <div class="loader__top" aria-hidden="true"><span><b>RR</b> BOOT MANAGER</span><span data-loader-clock>--:--:--</span></div>
  <div class="loader__core" aria-hidden="true">
    <svg class="loader__ring" viewBox="0 0 200 200"><circle class="r-base" cx="100" cy="100" r="90"/><circle class="r-dash" cx="100" cy="100" r="98"/><circle class="r-dash2" cx="100" cy="100" r="80"/><circle class="r-prog" data-ring cx="100" cy="100" r="90" stroke-dasharray="565.49" stroke-dashoffset="565.49"/></svg>
    <div class="loader__pct"><b data-loader-count>000</b><i>PERCENT</i></div>
  </div>
  <div class="loader__status" data-loader-status aria-hidden="true">BOOTING</div>
  <div class="loader__log" data-loader-log aria-hidden="true"></div>
  <div class="loader__menu" data-loader-enter hidden>
    <p class="loader__ask">SELECT OPERATING MODE</p>
    <div class="loader__opts" role="group" aria-label="Choose a theme and enter">
      <button class="os" type="button" data-os="linux"><span class="os__ico">&gt;_</span><strong>ARCH LINUX</strong><em>dark &middot; terminal</em><span class="os__go">BOOT &rarr;</span></button>
      <button class="os" type="button" data-os="mac"><span class="os__ico">&#9680;</span><strong>macOS</strong><em>light &middot; glass</em><span class="os__go">BOOT &rarr;</span></button>
    </div>
    <label class="loader__snd"><input type="checkbox" data-snd checked> <span>SOUND</span></label>
    <p class="loader__hint">you can switch anytime from the top bar</p>
  </div>
  <noscript><style>.loader{display:none!important}</style></noscript>
</div>

<div class="cursor" aria-hidden="true">
  <div class="cursor__ring"><i></i></div>
  <div class="cursor__dot"></div>
  <div class="cursor__tag"><span data-cursor-label></span><b data-cursor-glyph></b></div>
</div>

<div class="bg" aria-hidden="true">
  <div class="bg__aurora"></div>
  <div class="bg__grid"></div>
  <canvas class="bg__canvas" data-bg></canvas>
  <div class="bg__fx"></div>
</div>

<header class="bar">
  <div class="bar__in">
    <a class="bar__logo" href="#hero"><span>R<b>R</b></span><span>~/rabin</span></a>
    <nav class="bar__nav" aria-label="Sections">
      ${NAV.map(([id, label], i) => `<a href="#${id}" data-n="${i + 1}" data-nav="${id}">${esc(label)}</a>`).join('')}
    </nav>
    <div class="bar__right">
      ${tswitch()}
      <button class="chip-btn" type="button" data-chat-open aria-haspopup="dialog"><span>[ ASK SIG ]</span></button>
      <button class="chip-btn" type="button" data-sound-toggle><span class="sr-only" data-sound-sr>Enable sound</span><span data-sound-label aria-hidden="true">[SND:OFF]</span></button>
      <button class="bar__menu" type="button" data-menu-toggle aria-label="Open menu" aria-expanded="false"><i></i></button>
    </div>
  </div>
</header>
<div class="menu" data-menu>
  ${NAV.map(([id, label], i) => `<a href="#${id}"><small>0${i + 1}</small>${esc(label)}</a>`).join('')}
  <button class="menu__ask" type="button" data-chat-open>Ask SIG &rarr;</button>
</div>

<div class="progress" aria-hidden="true"><span data-progress>[--------------------] 000%</span></div>

<aside class="socials" aria-label="Social links">
  <a class="social" href="${esc(github)}" target="_blank" rel="me noopener" data-magnetic data-social="github" aria-label="GitHub">
    <span class="social__icon">${ICONS.github}</span><span class="social__ascii" aria-hidden="true">&lt;/&gt;</span><span class="social__tip">GITHUB</span>
  </a>
  <a class="social" href="${esc(x)}" target="_blank" rel="me noopener" data-magnetic data-social="x" aria-label="X (Twitter)">
    <span class="social__icon">${ICONS.x}</span><span class="social__ascii" aria-hidden="true">[X]</span><span class="social__tip">X / TWITTER</span>
  </a>
  <a class="social" href="mailto:${esc(mail1)}" data-magnetic data-social="mail" data-email="${esc(mail1)}" aria-label="Copy email address ${esc(mail1)}. Hold or Shift-click to open mail app.">
    <span class="social__icon">${ICONS.mail}</span><span class="social__ascii" aria-hidden="true">@_@</span><span class="social__tip" data-tip-mail>COPY EMAIL</span>
  </a>
</aside>
<div class="toast" role="status" aria-live="polite" data-toast></div>

<main id="main">
  <!-- HERO -->
  <section class="hero" id="hero" aria-label="Introduction">
    <div class="hero__meta">
      <span class="hero__prompt"><b>${esc(p.terminal?.prompt || 'rabin@ruhrbin')}</b>:~$ ./hello</span>
      <span class="hero__live"><i class="dot"></i> ${esc(p.status.toUpperCase())}</span>
      <span class="hero__clock" data-clock data-tz="${esc(p.timezone)}">--:--:--</span>
    </div>
    <h1 class="hero__title" data-hero-title><span class="sr-only">${esc(p.name)} - ${esc(p.role)}</span>
      ${lineNames.map((l, i) => `<span class="hero__line hero__line--${i + 1}" data-split aria-hidden="true">${esc(l)}</span>`).join('')}
    </h1>
    <div class="hero__lower" data-hero-lower>
      <div class="hero__copy">
        <p class="hero__roles">${roles.map((r) => `<span>${esc(r)}</span>`).join('')}</p>
        <p class="hero__tag">${rich(p.tagline)}</p>
        <div class="hero__cta">
          <a class="btn btn--solid" href="#archive"><span>View work</span></a>
          <a class="btn" href="#contact"><span>Get in touch</span></a>
        </div>
      </div>
      ${win({
        tl: `${p.terminal?.prompt || 'rabin@ruhrbin'}:~`, tm: 'Terminal — rabin', cls: 'hero__term', attrs: 'data-tilt data-hero-term',
        body: `<p class="tl"><span class="tl__p">$</span> <span data-type>whoami</span></p>
<p class="tl tl--out" data-out>${esc(p.name.toLowerCase().replace(/\s+/g, '-'))}</p>
<p class="tl"><span class="tl__p">$</span> <span data-type>cat role.txt</span></p>
<p class="tl tl--out" data-out>${esc(roles.join(' · '))}</p>
<p class="tl"><span class="tl__p">$</span> <span data-type>echo $LOCATION</span></p>
<p class="tl tl--out" data-out>${esc(p.location)}</p>
<p class="tl"><span class="tl__p">$</span> <span class="caret"></span></p>`
      })}
    </div>
    <a class="hero__scroll" href="#manifesto" data-cursor="view" data-cursor-label="SCROLL"><span data-scroll-cue>v</span> SCROLL</a>
  </section>

  <!-- MANIFESTO -->
  <section class="manifesto" id="manifesto" aria-label="About in one line">
    <p class="label">${esc(p.manifesto.label)}</p>
    <p class="manifesto__text" data-words>${words}</p>
  </section>

  <!-- FOCUS (cards fly toward you on desktop) -->
  <section class="focus sec" id="focus" aria-labelledby="focus-h">
    <div class="focus__pin">
      <header class="focus__head">
        <p class="label">${esc(p.channels.label)} / 01</p>
        <h2 class="h2" id="focus-h" data-reveal="mask">${lines(p.channels.headline)}</h2>
      </header>
      <div class="focus__stage" data-stage>
        ${p.channels.items.map((c) => `
        <article class="card" data-card>
          ${win({
            tl: `rabin@ruhrbin:${c.path}`, tm: `${c.title[0] + c.title.slice(1).toLowerCase()} — Terminal`,
            body: `<div class="card__main">
              <span class="card__id">${esc(c.id)} / ${String(p.channels.items.length).padStart(2, '0')}</span>
              <h3 class="card__big">${esc(c.title)}</h3>
              <ul class="bullets">${c.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
            </div>
            <div class="code" aria-hidden="true">${(c.snippet || []).map((s) => `<p>${esc(s)}</p>`).join('')}</div>`
          })}
        </article>`).join('')}
      </div>
      <div class="focus__count" aria-hidden="true"><b data-count>01</b> / ${String(p.channels.items.length).padStart(2, '0')}</div>
    </div>
  </section>

  <!-- STACK -->
  <section class="stack-sec sec" id="stack" aria-labelledby="stack-h">
    <p class="label">${esc(p.stack.label)}</p>
    <h2 class="h2 h2--xl" id="stack-h" data-reveal="mask" data-skew>${lines(p.stack.headline)}</h2>
    <div class="marquee" aria-hidden="true">
      <div class="marquee__row" data-marquee="-1">${row(marq.slice(0, half))}</div>
      <div class="marquee__row" data-marquee="1">${row(marq.slice(half))}</div>
    </div>
    <div class="stack" data-reveal="fade" data-stagger>
      ${p.stack.groups.map((g) => win({
        tl: `rabin@ruhrbin:~/${g.title.toLowerCase().replace(/[^a-z]+/g, '-')}`, tm: g.title, cls: 'stack__group',
        body: `<div style="padding:16px 16px 18px"><h3>${esc(g.title)}</h3><ul class="chips">${g.items.map((i) => `<li class="chip">${esc(i)}</li>`).join('')}</ul></div>`
      })).join('')}
    </div>
  </section>

  <!-- ARCHIVE -->
  <section class="archive sec" id="archive" aria-labelledby="archive-h">
    <p class="label">${esc(p.archive.label)}</p>
    <h2 class="h2 h2--xl" id="archive-h" data-reveal="mask" data-skew>${lines(p.archive.headline)}</h2>
    <div class="archive__row">
      <a class="archive__link" href="${esc(p.archive.url)}" target="_blank" rel="noopener" data-cursor="ascii" data-reveal="clip" aria-label="${esc(p.archive.cta)}: ${esc(p.name)}'s projects on GitHub">
        ${win({
          tl: `git clone github.com/${handleGh}`, tm: `${handleGh} — GitHub`, cls: 'archive__panel', tag: 'div',
          body: `<canvas class="archive__art" data-ascii data-lines="GIT|HUB" data-cols="64" aria-hidden="true"></canvas><span class="archive__cta">${esc(p.archive.cta)} &rarr;</span>`
        })}
      </a>
      <div class="archive__side" data-reveal="fade" data-stagger>
        <p class="lead">${esc(p.archive.text)}</p>
        <ul class="bullets">${p.archive.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
        ${projects}
      </div>
    </div>
  </section>

  <!-- TERMINAL (interactive, loaded lazily) -->
  <section class="terminal sec" id="terminal" aria-labelledby="terminal-h">
    <p class="label">${esc(p.terminal.label)}</p>
    <h2 class="h2 h2--xl" id="terminal-h" data-reveal="mask" data-skew>${lines(p.terminal.headline)}</h2>
    <p class="lead" data-reveal="fade">${esc(p.terminal.text)}</p>
    <div data-reveal="fade" style="margin-top:26px">
      ${win({
        tl: `${p.terminal.prompt}:~`, tm: 'Terminal — zsh', cls: 'term', attrs: 'data-terminal data-prompt="' + esc(p.terminal.prompt) + '"',
        body: `<div class="term__log" data-term-log role="log" aria-live="polite" tabindex="-1" data-lenis-prevent>
            <p class="tl tl--out">Type <span class="hl">help</span> to see commands. Click here to focus.</p>
          </div>
          <form class="term__line" data-term-form autocomplete="off">
            <label for="term-input">${esc(p.terminal.prompt)}:~$</label>
            <input id="term-input" class="term__input" data-term-input type="text" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Terminal command" placeholder="help">
          </form>`
      })}
      <div class="term__chips">${(p.terminal.suggest || []).map((s) => `<button class="chip-btn" type="button" data-term-run="${esc(s)}">${esc(s)}</button>`).join('')}</div>
    </div>
  </section>

  <!-- ABOUT -->
  <section class="about sec" id="about" aria-labelledby="about-h">
    <p class="label">${esc(p.about.label)}</p>
    <h2 class="h2 h2--xl" id="about-h" data-reveal="mask" data-skew>${lines(p.about.headline)}</h2>
    <div class="about__grid">
      ${win({
        tl: `${p.terminal.prompt}:~$ neofetch`, tm: 'neofetch — about', cls: 'neo', attrs: 'data-reveal="fade"',
        body: `<pre class="neo__logo" aria-hidden="true">${esc(art('RR'))}</pre>
        <dl class="neo__list">
          <div class="user"><dt class="sr-only">User</dt><dd><b>rabin</b>@ruhrbin</dd></div>
          <div><dt>Name</dt><dd>${esc(p.name)}</dd></div>
          <div><dt>Role</dt><dd>${esc(p.role)}</dd></div>
          ${(p.about.facts || []).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}
          <div><dt>Base</dt><dd>${esc(p.location)}</dd></div>
          <div><dt>Status</dt><dd>${esc(p.status)}</dd></div>
          <div><dt>Email</dt><dd><a href="mailto:${esc(mail1)}">${esc(mail1)}</a></dd></div>
          <div><dt>Code</dt><dd><a href="${esc(github)}" target="_blank" rel="me noopener">github.com/${esc(handleGh)}</a></dd></div>
          <div><dt>Social</dt><dd><a href="${esc(x)}" target="_blank" rel="me noopener">x.com/${esc(handleX)}</a></dd></div>
          <div><dt>Site</dt><dd><a href="https://${esc(p.site.domain)}/">${esc(p.site.domain)}</a></dd></div>
          <div class="nf__colors" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
        </dl>`
      })}
      <div class="about__side">
        <ul class="bullets bullets--big" data-reveal="fade" data-stagger>${p.about.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
        <aside class="callout" data-reveal="fade">
          <span class="callout__label">${esc(p.about.callout.label)}</span>
          <p>${esc(p.about.callout.text)}</p>
        </aside>
      </div>
    </div>
  </section>

  <!-- CONTACT -->
  <section class="contact sec" id="contact" aria-labelledby="contact-h">
    <p class="label">${esc(p.contact.label)}</p>
    <h2 class="h2 h2--xl" id="contact-h" data-reveal="mask" data-skew>${lines(p.contact.headline)}</h2>
    <p class="lead" data-reveal="fade" style="margin-bottom:28px">${esc(p.contact.text)}</p>
    <ul class="mails" data-reveal="fade" data-stagger>
      ${emails.map((m) => `<li><button class="mail" type="button" data-copy="${esc(m)}" data-cursor="view" data-cursor-label="COPY"><span class="mail__addr">${esc(m)}</span><span class="mail__state" data-copy-state>COPY</span></button></li>`).join('')}
    </ul>
    <div class="contact__actions" data-reveal="fade">
      <a class="btn btn--solid" href="${esc(github)}" target="_blank" rel="noopener"><span>[ GITHUB ]</span></a>
      <a class="btn" href="${esc(x)}" target="_blank" rel="noopener"><span>[ X ]</span></a>
      <button class="btn" type="button" data-chat-open><span>[ TALK TO SIG ]</span></button>
    </div>
  </section>
</main>

<footer class="footer" id="footer">
  <div class="footer__cta">
    <h2 class="h2 h2--xl" data-reveal="mask">${lines(f.ctaTitle || "Got an idea?|Let's talk.")}</h2>
    <a class="btn btn--solid" href="mailto:${esc(mail1)}"><span>${esc(mail1)} &rarr;</span></a>
  </div>

  <div class="footer__grid" style="--cols:${colCount}">
    <div class="footer__brand">
      <div class="footer__logo">${esc(p.shortName)}<b>.</b></div>
      <p class="footer__blurb">${esc(f.blurb || p.seo.summary)}</p>
      <span class="pill"><i class="dot"></i> ${esc(p.status)}</span>
    </div>
    ${footCols}
  </div>

  <canvas class="footer__giant" data-ascii data-lines="${esc(lineNames.join(' '))}" data-cols="132" data-lines-m="${esc(lineNames.join('|'))}" data-cols-m="64" aria-hidden="true"></canvas>

  <div class="footer__legal">
    <span>&copy; ${p.site.year} ${esc(p.name)}. All rights reserved.</span>
    ${legal}
    <span data-clock data-tz="${esc(p.timezone)}">--:--:--</span>
    <div class="footer__tools">${tswitch()}<a class="totop" href="#hero" data-top>TOP &uarr;</a></div>
  </div>
</footer>

<section class="chat" data-chat hidden role="dialog" aria-modal="true" aria-labelledby="chat-title">
  <header class="chat__head">
    <h2 id="chat-title">SIG // ASSISTANT</h2>
    <button class="chat__close" type="button" data-chat-close aria-label="Close chat">[X]</button>
  </header>
  <div class="chat__log" data-chat-log aria-live="polite" aria-relevant="additions"></div>
  <div class="chat__chips" data-chat-chips></div>
  <form class="chat__form" data-chat-form autocomplete="off">
    <button class="chat__icon" type="button" data-chat-mic aria-label="Speak your question" title="Voice input">[MIC]</button>
    <input class="chat__input" type="text" name="q" maxlength="300" placeholder="type or speak..." aria-label="Your message" data-chat-input>
    <button class="chat__icon" type="button" data-chat-speak aria-pressed="false" aria-label="Read replies aloud" title="Spoken replies">[VOX:OFF]</button>
    <button class="chat__send" type="submit" aria-label="Send">[SEND]</button>
  </form>
</section>
`;
}
