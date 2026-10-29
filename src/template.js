// Build-time HTML template. Runs in Node (inside vite.config.js), NOT in the browser.
// Content comes from src/data/profile.json, so the page is real static HTML (good for SEO).
import figlet from 'figlet';

const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** *word* -> <em>word</em> (italic serif accent) */
const rich = (s = '') => esc(s).replace(/\*(.+?)\*/g, '<em>$1</em>');

/** "A|B|C" -> three masked lines (for scroll mask-reveal) */
const lines = (s = '') =>
  s
    .split('|')
    .map((l) => `<span class="mask"><span class="mask__in">${rich(l)}</span></span>`)
    .join(' ');

const art = (text, font = 'Small') => {
  try {
    return figlet.textSync(text, { font }).replace(/\s+$/gm, '').replace(/^\n+|\n+$/g, '');
  } catch {
    return text;
  }
};

const ICONS = {
  github:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2.14c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.11 3.04.74.8 1.19 1.83 1.19 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117Z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M3 5.500h18v13H3zM3.500 6l8.500 7 8.500-7"/></svg>'
};

const chip = (label, attrs = '') =>
  `<button class="chip-btn" type="button" ${attrs}><span>${esc(label)}</span></button>`;

export function renderPage(p) {
  const { github, x, emails } = p.links;
  const [mail1, mail2] = emails;
  const lineNames = p.heroLines;

  const projects = (p.projects || []).length
    ? `<ul class="projects" data-reveal="fade" data-stagger>
        ${p.projects
          .map(
            (pr, i) => `<li><a href="${esc(pr.url)}" target="_blank" rel="noopener" data-cursor="view" data-cursor-label="OPEN">
              <span class="projects__n">${String(i + 1).padStart(2, '0')}</span>
              <strong>${esc(pr.title)}</strong><span>${esc(pr.text || '')}</span></a></li>`
          )
          .join('')}
      </ul>`
    : '';

  return /* html */ `
<a class="skip" href="#main">Skip to content</a>

<div class="loader" id="loader" role="status" aria-live="polite" data-lines="${esc(lineNames.join('|'))}">
  <canvas class="loader__canvas" aria-hidden="true"></canvas>
  <div class="loader__hud" aria-hidden="true">
    <div class="loader__status" data-loader-status>BOOTING TRANSMITTER</div>
    <div class="loader__count"><span data-loader-count><b>0</b><b>0</b><b>0</b></span><i>%</i></div>
  </div>
  <div class="loader__enter" data-loader-enter hidden>
    <p class="loader__ask">// ENTER THE TRANSMISSION</p>
    <div class="loader__btns">
      <button class="btn btn--solid" type="button" data-enter="sound"><span>[ ENTER WITH SOUND ]</span></button>
      <button class="btn" type="button" data-enter="muted"><span>[ ENTER MUTED ]</span></button>
    </div>
  </div>
  <noscript><style>.loader{display:none!important}</style></noscript>
</div>

<div class="cursor" aria-hidden="true">
  <div class="cursor__ring"><i></i></div>
  <div class="cursor__dot"></div>
  <div class="cursor__tag"><span data-cursor-label></span><b data-cursor-glyph></b></div>
</div>

<div class="grain" aria-hidden="true"></div>

<header class="bar">
  <a class="bar__logo" href="#hero">RR<span>/SIG</span></a>
  <nav class="bar__nav" aria-label="Sections">
    <a href="#channels">CHANNELS</a>
    <a href="#archive">ARCHIVE</a>
    <a href="#about">ABOUT</a>
    <a href="#contact">CONTACT</a>
  </nav>
  <div class="bar__right">
    <button class="chip-btn" type="button" data-chat-open aria-haspopup="dialog"><span>[ ASK SIG ]</span></button>
    <button class="chip-btn" type="button" data-sound-toggle ><span class="sr-only" data-sound-sr>Enable sound</span><span data-sound-label aria-hidden="true">[SND:OFF]</span></button>
  </div>
</header>

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
  <section class="hero" id="hero" data-sound-section aria-label="Introduction">
    <canvas class="hero__field" aria-hidden="true"></canvas>
    <div class="hero__meta">
      <span>SIG—001 / TRANSMISSION</span>
      <span class="hero__live"><i class="dot"></i> ${esc(p.status.toUpperCase())}</span>
      <span class="hero__clock" data-clock data-tz="${esc(p.timezone)}">--:--:--</span>
    </div>
    <h1 class="hero__title" data-skew><span class="sr-only">${esc(p.name)} — ${esc(p.role)}</span>
      ${lineNames.map((l, i) => `<span class="hero__line hero__line--${i + 1}" data-split aria-hidden="true">${esc(l)}</span>`).join('')}
    </h1>
    <div class="hero__foot">
      <p class="hero__role">${esc(p.role)}<br><span>${esc(p.location)}</span></p>
      <p class="hero__tag">${rich(p.tagline)}</p>
      <a class="hero__scroll" href="#channels" data-cursor="view" data-cursor-label="SCROLL"><span data-scroll-cue>v</span> SCROLL</a>
    </div>
  </section>

  <!-- CHANNELS (pinned horizontal on desktop) -->
  <section class="channels" id="channels" data-sound-section aria-labelledby="channels-h">
    <div class="channels__pin">
      <header class="channels__head">
        <p class="label">${esc(p.channels.label)} / 000</p>
        <h2 class="h2" id="channels-h" data-reveal="mask">${lines(p.channels.headline)}</h2>
      </header>
      <div class="channels__track" data-track>
        ${p.channels.items
          .map(
            (c) => `
        <article class="panel" data-cursor="view" data-cursor-label="SCROLL">
          <div class="panel__top"><span>${esc(c.id)}</span><span>${esc(c.freq)} MHz</span></div>
          <h3 class="panel__big" data-panel-big>${esc(c.title)}</h3>
          <ul class="bullets">
            ${c.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}
          </ul>
          <pre class="wave" data-wave aria-hidden="true"></pre>
        </article>`
          )
          .join('')}
      </div>
    </div>
  </section>

  <!-- ARCHIVE -->
  <section class="archive" id="archive" data-sound-section aria-labelledby="archive-h">
    <p class="label">${esc(p.archive.label)}</p>
    <h2 class="h2 h2--xl" id="archive-h" data-reveal="mask" data-skew>${lines(p.archive.headline)}</h2>
    <div class="archive__row">
      <a class="archive__panel" href="${esc(p.archive.url)}" target="_blank" rel="noopener" data-cursor="ascii" data-reveal="clip" aria-label="${esc(p.archive.cta)}: ${esc(p.name)}'s projects on GitHub">
        <canvas class="archive__art" data-ascii data-lines="GIT|HUB" data-cols="64" aria-hidden="true"></canvas>
        <span class="archive__cta">${esc(p.archive.cta)} <b>-&gt;</b></span>
      </a>
      <div class="archive__side" data-reveal="fade" data-stagger>
        <p class="lead">${esc(p.archive.text)}</p>
        <ul class="bullets">${p.archive.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
        ${projects}
      </div>
    </div>
  </section>

  <!-- ABOUT -->
  <section class="about" id="about" data-sound-section aria-labelledby="about-h">
    <p class="label">${esc(p.about.label)}</p>
    <h2 class="h2 h2--xl" id="about-h" data-reveal="mask" data-skew>${lines(p.about.headline)}</h2>
    <div class="about__grid">
      <ul class="bullets bullets--big" data-reveal="fade" data-stagger>
        ${p.about.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}
      </ul>
      <aside class="callout" data-reveal="fade">
        <span class="callout__label">${esc(p.about.callout.label)}</span>
        <p>${esc(p.about.callout.text)}</p>
        <i class="callout__corner" aria-hidden="true">+</i>
      </aside>
    </div>
    <dl class="facts" data-reveal="fade" data-stagger>
      <div><dt>NAME</dt><dd>${esc(p.name)}</dd></div>
      <div><dt>ROLE</dt><dd>${esc(p.role)}</dd></div>
      <div><dt>BASED IN</dt><dd>${esc(p.location)}</dd></div>
      <div><dt>STATUS</dt><dd>${esc(p.status)}</dd></div>
      <div><dt>EMAIL</dt><dd><a href="mailto:${esc(mail1)}">${esc(mail1)}</a></dd></div>
      <div><dt>CODE</dt><dd><a href="${esc(github)}" target="_blank" rel="me noopener">github.com/${esc(github.split('/').pop())}</a></dd></div>
      <div><dt>SOCIAL</dt><dd><a href="${esc(x)}" target="_blank" rel="me noopener">x.com/${esc(x.split('/').pop())}</a></dd></div>
      <div><dt>SITE</dt><dd><a href="https://${esc(p.site.domain)}/">${esc(p.site.domain)}</a></dd></div>
    </dl>
  </section>

  <!-- CONTACT -->
  <section class="contact" id="contact" data-sound-section aria-labelledby="contact-h">
    <p class="label">${esc(p.contact.label)}</p>
    <h2 class="h2 h2--xl" id="contact-h" data-reveal="mask" data-skew>${lines(p.contact.headline)}</h2>
    <p class="lead" data-reveal="fade">${esc(p.contact.text)}</p>
    <ul class="mails" data-reveal="fade" data-stagger>
      ${emails
        .map(
          (m) => `<li><button class="mail" type="button" data-copy="${esc(m)}" data-cursor="view" data-cursor-label="COPY"><span class="mail__addr">${esc(m)}</span><span class="mail__state" data-copy-state>COPY</span></button></li>`
        )
        .join('')}
    </ul>
    <div class="contact__actions" data-reveal="fade">
      <a class="btn btn--solid" href="${esc(github)}" target="_blank" rel="noopener"><span>[ GITHUB ]</span></a>
      <a class="btn" href="${esc(x)}" target="_blank" rel="noopener"><span>[ X ]</span></a>
      <button class="btn" type="button" data-chat-open><span>[ TALK TO SIG ]</span></button>
    </div>
  </section>
</main>

<footer class="footer" id="footer" data-sound-section>
  <canvas class="footer__giant" data-ascii data-lines="${esc(lineNames.join('|'))}" data-cols="120" aria-hidden="true"></canvas>

  <nav class="footer__nav" aria-label="Footer">
    <a href="${esc(github)}" target="_blank" rel="noopener" data-decode><pre aria-hidden="true">${esc(art('GITHUB'))}</pre><span class="sr-only">GitHub</span></a>
    <a href="${esc(x)}" target="_blank" rel="noopener" data-decode><pre aria-hidden="true">${esc(art('X'))}</pre><span class="sr-only">X</span></a>
    <a href="mailto:${esc(mail1)}" data-decode><pre aria-hidden="true">${esc(art('EMAIL'))}</pre><span class="sr-only">Email</span></a>
    <a href="#hero" data-decode data-top><pre aria-hidden="true">${esc(art('TOP'))}</pre><span class="sr-only">Back to top</span></a>
  </nav>

  <div class="footer__marquee" aria-hidden="true">
    <div class="footer__marquee-in"><pre>${esc(art('AVAILABLE FOR WORK  *  ', 'Small'))}</pre><pre>${esc(art('AVAILABLE FOR WORK  *  ', 'Small'))}</pre></div>
  </div>

  <pre class="footer__wave" data-wave aria-hidden="true"></pre>

  <div class="footer__legal">
    <span>(C) ${p.site.year} ${esc(p.name.toUpperCase())}</span>
    <span>${esc(p.site.domain)}</span>
    <span>END OF TRANSMISSION</span>
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
