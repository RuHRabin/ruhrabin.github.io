// Builds the deployable site into the repository root (GitHub Pages serves the root).
//
//   src/        sources you edit (index.template.html, css/, js/)
//   data/       github-sync.json, refreshed by the sync workflow
//   ->  index.html, 404.html, projects/**, assets/**, robots.txt, sitemap.xml, llms.txt
//
// Everything crawlers and visitors need is rendered here, at build time, from the synced GitHub data:
// the project list, the JSON-LD, the sitemap and the plain-text summary. No client-side rendering is required to read the site.

import { build } from 'esbuild';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize, FALLBACK, FEATURED, formatDate } from '../src/js/data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = (...p) => path.join(ROOT, ...p);
const SITE = 'https://rabin.ruhrbin.site';
const OWNER = 'RuHRabin';
const NAME = 'Rabin';
const SOCIAL = {
    github: 'https://github.com/RuHRabin',
    x: 'https://x.com/RuHRabin',
    facebook: 'https://facebook.com/RuHRabin',
};
const SOCIAL_IMG = SITE + '/img/social.png';

// Short, accurate descriptors used in page titles (each summarises the project's own description on this site).
const SHORT = {
    'gargantua': 'black-hole flight game with real-time lensing',
    'earthpulse': 'live earthquake and severe-weather map',
    'sol-mesh': 'serverless encrypted messaging for Android',
    'xkb-avro': 'Bengali Avro Phonetic keyboard layout for Linux',
    'html-bangla': 'offline Android app teaching HTML in Bengali',
    'schemify': 'CSV, TSV and JSON schema inference CLI',
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const jsonScript = (obj) => '<script type="application/ld+json">' + JSON.stringify(obj).replace(/</g, '\\u003c') + '</script>';
const trimTo = (text, max) => {
    const t = String(text).replace(/\s+/g, ' ').trim();
    if (t.length <= max) return t;
    const cut = t.slice(0, max - 1);
    return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:.\s]+$/, '') + '…';
};
const write = async (rel, text) => {
    const f = P(rel);
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, text);
};
const read = (rel) => fs.readFile(P(rel), 'utf8');

/* ---------- 1. bundle JS and CSS ---------- */
await fs.rm(P('assets'), { recursive: true, force: true });

const jsRes = await build({
    entryPoints: { main: P('src/js/main.js') },
    bundle: true, splitting: true, format: 'esm', minify: true, target: ['es2020'],
    outdir: P('assets/js'), entryNames: '[name]-[hash]', chunkNames: 'chunks/[name]-[hash]',
    metafile: true, legalComments: 'eof', logLevel: 'warning',
});
const outs = jsRes.metafile.outputs;
const rel = (abs) => '/' + path.relative(ROOT, abs).split(path.sep).join('/');
const entryOut = Object.keys(outs).find((k) => outs[k].entryPoint && outs[k].entryPoint.endsWith('src/js/main.js'));
const preload = new Set();
(function walk(k) {
    if (preload.has(k)) return;
    preload.add(k);
    for (const imp of outs[k].imports) if (imp.kind === 'import-statement' && outs[imp.path]) walk(imp.path);
})(entryOut);
const mainUrl = '/' + entryOut.replace(/^.*?assets\//, 'assets/');
const preloadUrls = [...preload].map((k) => '/' + k.replace(/^.*?assets\//, 'assets/'));

const cssRes = await build({
    entryPoints: { style: P('src/css/style.css') },
    bundle: false, minify: true, outdir: P('assets/css'), entryNames: '[name]-[hash]',
    metafile: true, logLevel: 'warning',
});
const cssOut = Object.keys(cssRes.metafile.outputs).find((k) => k.endsWith('.css'));
const cssUrl = '/' + cssOut.replace(/^.*?assets\//, 'assets/');
const cssText = await fs.readFile(P(cssOut.replace(/^.*?assets\//, 'assets/')), 'utf8');

/* ---------- 2. self-hosted fonts and KaTeX ---------- */
const FONT_HEAD = 'source-serif-4-latin-600-normal.woff2';   // the only web font: headings, 21 KB. Body and code use system fonts.
await fs.mkdir(P('assets/fonts'), { recursive: true });
await fs.copyFile(P('node_modules/@fontsource/source-serif-4/files', FONT_HEAD), P('assets/fonts', FONT_HEAD));
const katexDist = P('node_modules/katex/dist');
await fs.mkdir(P('assets/vendor/katex/fonts'), { recursive: true });
await fs.copyFile(path.join(katexDist, 'katex.min.js'), P('assets/vendor/katex/katex.min.js'));
// Only the woff2 faces are shipped (every browser that runs this site supports woff2); the woff/ttf fallbacks are dropped.
const katexCss = (await fs.readFile(path.join(katexDist, 'katex.min.css'), 'utf8'))
    .replace(/,url\(fonts\/[^)]+\.woff\) format\("woff"\)/g, '')
    .replace(/,url\(fonts\/[^)]+\.ttf\) format\("truetype"\)/g, '');
await fs.writeFile(P('assets/vendor/katex/katex.min.css'), katexCss);
for (const f of await fs.readdir(path.join(katexDist, 'fonts'))) {
    if (f.endsWith('.woff2')) await fs.copyFile(path.join(katexDist, 'fonts', f), P('assets/vendor/katex/fonts', f));
}

/* ---------- 3. data ---------- */
let raw = null;
try { raw = JSON.parse(await read('data/github-sync.json')); } catch (e) { console.warn('[build] no data/github-sync.json, using the built-in fallback'); }
const data = raw ? normalize(raw, false) : normalize(FALLBACK, true);
const generatedAt = (raw && raw.generated_at) || new Date().toISOString();
const byKey = new Map(data.repos.map((r) => [r.name.toLowerCase(), r]));
const featured = [...FEATURED.keys()].map((k) => byKey.get(k)).filter(Boolean);
const others = data.repos.filter((r) => !r.featured);
const lastmod = (r) => (r.pushedAt || generatedAt).slice(0, 10);
const genDay = generatedAt.slice(0, 10);
const genStamp = generatedAt.slice(0, 16).replace('T', ' ') + ' UTC';
const YEAR = new Date().getFullYear();

const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// Tiny inline scripts shared by every page (they work even if the main bundle never loads).
const THEME_HEAD = `<script>(function(d){try{var t=localStorage.getItem('rabin.theme');if(t==='light'||t==='dark')d.documentElement.setAttribute('data-theme',t)}catch(e){}})(document)</script>`;
const UI_JS = `<script>(function(){var d=document,r=d.documentElement,b=d.getElementById('theme-toggle'),m=d.getElementById('menu-toggle'),h=d.getElementById('site-header');
function cur(){var t=r.getAttribute('data-theme');return t||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}
function lab(){if(b)b.setAttribute('aria-label','Switch to '+(cur()==='dark'?'light':'dark')+' theme')}
if(b){lab();b.addEventListener('click',function(){var n=cur()==='dark'?'light':'dark';r.setAttribute('data-theme',n);try{localStorage.setItem('rabin.theme',n)}catch(e){}lab()})}
if(m&&h){var close=function(f){h.classList.remove('nav-open');m.setAttribute('aria-expanded','false');if(f)m.focus()};
m.addEventListener('click',function(){var o=h.classList.toggle('nav-open');m.setAttribute('aria-expanded',o?'true':'false')});
h.addEventListener('keydown',function(e){if(e.key==='Escape'&&h.classList.contains('nav-open'))close(true)});
Array.prototype.forEach.call(h.querySelectorAll('.nav a'),function(a){a.addEventListener('click',function(){close(false)})})}})()</script>`;
const BRAND_SVG = '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><ellipse cx="16" cy="17" rx="13" ry="4.2" fill="none" stroke="var(--fig-disc-a)" stroke-width="2" transform="rotate(-14 16 17)"/><circle cx="16" cy="16" r="7" fill="var(--fig-core)" stroke="var(--c-accent)" stroke-width="1.5"/></svg>';
const THEME_BTN = '<button class="icon-btn" id="theme-toggle" type="button" aria-label="Switch theme"><svg class="i-sun" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg><svg class="i-moon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg></button>';
const MENU_BTN = '<button class="icon-btn menu-btn" id="menu-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Menu"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>';

function linksFor(r, { detail = false } = {}) {
    const out = [];
    if (r.live) out.push(`<a href="${esc(r.live)}" rel="noopener">Live demo</a>`);
    out.push(`<a href="${esc(r.url)}" rel="noopener">Source code</a>`);
    r.releases.slice(0, 2).forEach((rl) => {
        out.push(`<a href="${esc(rl.url)}" rel="noopener">Release ${esc(rl.tag)}</a>`);
        if (detail) rl.assets.slice(0, 3).forEach((a) => out.push(`<a href="${esc(a.url)}" rel="noopener">Download ${esc(a.name)}</a>`));
    });
    return out.join('\n            ');
}

function projectItem(r) {
    const meta = [
        r.language ? `<p>${esc(r.language)}</p>` : '',
        r.stars ? `<p>${r.stars} GitHub ${r.stars === 1 ? 'star' : 'stars'}</p>` : '',
        r.pushedAt ? `<p>Updated ${fmtDate(r.pushedAt)}</p>` : '',
    ].filter(Boolean).join('');
    return `<li class="row">
        <div class="row-meta">${meta}</div>
        <div class="row-body">
          <h3><a href="/projects/${r.slug}/">${esc(r.name)}</a></h3>
          <p>${esc(r.line)}</p>${r.note ? `\n          <p class="note">${esc(r.note)}</p>` : ''}
          <p class="links">
            ${linksFor(r)}
          </p>
        </div>
      </li>`;
}

/* ---------- 4. structured data ---------- */
const PERSON_ID = SITE + '/#person';
const person = {
    '@type': 'Person', '@id': PERSON_ID, name: NAME, alternateName: OWNER, url: SITE + '/',
    description: 'Builds machine learning, simulation and software projects in the open.',
    sameAs: Object.values(SOCIAL),
    knowsAbout: ['Machine learning', 'Simulation', 'Computer graphics (ray marching)', 'Android development', 'Peer-to-peer networking', 'Applied cryptography'],
};
const TITLE = 'Rabin (@RuHRabin): machine learning & simulation projects';
const DESC = 'Rabin (@RuHRabin): machine learning and simulation projects, including a ray-marched black-hole game, serverless Android messaging and a live earthquake map.';
const homeGraph = {
    '@context': 'https://schema.org',
    '@graph': [
        { '@type': 'WebSite', '@id': SITE + '/#website', url: SITE + '/', name: NAME, inLanguage: 'en', publisher: { '@id': PERSON_ID } },
        {
            '@type': 'ProfilePage', '@id': SITE + '/#profilepage', url: SITE + '/', name: TITLE, description: DESC, inLanguage: 'en',
            isPartOf: { '@id': SITE + '/#website' }, mainEntity: { '@id': PERSON_ID }, dateModified: generatedAt,
            primaryImageOfPage: { '@type': 'ImageObject', url: SOCIAL_IMG, width: 1200, height: 630 },
        },
        person,
        {
            '@type': 'ItemList', '@id': SITE + '/#projects', name: 'Projects by Rabin', numberOfItems: featured.length,
            itemListElement: featured.map((r, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/projects/${r.slug}/`, name: r.name })),
        },
    ],
};

function softwareNode(r) {
    const node = {
        '@type': 'SoftwareSourceCode', '@id': `${SITE}/projects/${r.slug}/#software`, name: r.name,
        description: r.line, url: `${SITE}/projects/${r.slug}/`, codeRepository: r.url,
        author: { '@id': PERSON_ID }, isAccessibleForFree: true, inLanguage: 'en',
    };
    if (r.language) node.programmingLanguage = r.language;
    if (r.createdAt) node.dateCreated = r.createdAt.slice(0, 10);
    if (r.pushedAt) node.dateModified = r.pushedAt.slice(0, 10);
    if (r.license) node.license = 'https://spdx.org/licenses/' + r.license;
    if (r.topics.length) node.keywords = r.topics.join(', ');
    if (r.live) node.sameAs = [r.live];
    return node;
}

/* ---------- 5. shared page chrome (project pages, projects index, 404) ---------- */
const fontPreload = `<link rel="preload" as="font" type="font/woff2" href="/assets/fonts/${FONT_HEAD}" crossorigin>`;
const FAVICON = "<link rel=\"icon\" type=\"image/svg+xml\" href=\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%230a0e1a'/%3E%3Cellipse cx='16' cy='17' rx='13' ry='4.2' fill='none' stroke='%23ffb454' stroke-width='2' transform='rotate(-14 16 17)'/%3E%3Ccircle cx='16' cy='16' r='7' fill='%23000' stroke='%235ce1e6' stroke-width='1.5'/%3E%3C/svg%3E\">";
const GSV = "<meta name=\"google-site-verification\" content=\"8Vy-N8YD2XVepEK29woVuej9vWf2BGLKiCcuVfmZY0I\" />";

function page({ title, desc, urlPath, graph, body, noindex = false, ogType = 'website', current = '' }) {
    const url = SITE + urlPath;
    const cur = (name) => (current === name ? ' aria-current="page"' : '');
    return `<!doctype html>
<html lang="en" class="list-view">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="author" content="${NAME}">
<meta name="robots" content="${noindex ? 'noindex,follow' : 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1'}">
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f8f9fb">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0b1020">
<meta name="color-scheme" content="light dark">
${noindex ? '' : `<link rel="canonical" href="${url}">\n`}${FAVICON}
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="${NAME}">
<meta property="og:locale" content="en_US">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SOCIAL_IMG}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:creator" content="@${OWNER}">
<meta name="twitter:image" content="${SOCIAL_IMG}">
${GSV}
${fontPreload}
<link rel="stylesheet" href="${cssUrl}">
${graph ? jsonScript(graph) : ''}
${THEME_HEAD}
</head>
<body>
<a class="skip" href="#main">Skip to main content</a>
<header class="site-header" id="site-header">
  <div class="container bar">
    <a class="brand" href="/" aria-label="${NAME}, home">${BRAND_SVG}${NAME}</a>
    <div class="bar-actions">${THEME_BTN}${MENU_BTN}</div>
    <nav class="nav" id="site-nav" aria-label="Primary">
      <a href="/#about">About</a>
      <a href="/projects/"${cur('projects')}>Projects</a>
      <a href="/#st-2">Instruments</a>
      <a href="/#st-4">Contact</a>
    </nav>
  </div>
</header>
<main id="main" class="page">
  <div class="container">
${body}
  </div>
</main>
<footer id="foot">
  <div class="container">
    <p>© ${YEAR} ${NAME} · <a href="/">rabin.ruhrbin.site</a> · <a href="/projects/">Projects</a> · <a href="/llms.txt">Plain-text summary</a></p>
  </div>
</footer>
${UI_JS}
</body>
</html>
`;
}

function breadcrumbs(items) {
    return {
        '@type': 'BreadcrumbList',
        itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: SITE + it.path })),
    };
}

/* ---------- 6. project pages ---------- */
for (const r of featured) {
    const short = SHORT[r.name.toLowerCase()] || trimTo(r.line, 60);
    const title = `${r.name}: ${short} | ${NAME}`;
    const desc = trimTo(`${r.name} by ${NAME}: ${r.line}`, 158);
    const urlPath = `/projects/${r.slug}/`;
    const facts = [];
    facts.push(['Author', `${NAME} (<a href="${SOCIAL.github}">@${OWNER}</a>)`]);
    if (r.language) facts.push(['Main language', esc(r.language)]);
    if (r.license) facts.push(['License', esc(r.license)]);
    if (r.createdAt) facts.push(['First published', fmtDate(r.createdAt)]);
    if (r.pushedAt) facts.push(['Last commit', fmtDate(r.pushedAt)]);
    if (r.stars) facts.push(['GitHub stars', String(r.stars)]);
    facts.push(['Source code', `<a href="${esc(r.url)}" rel="noopener">${esc(r.url.replace(/^https?:\/\//, ''))}</a>`]);
    if (r.live) facts.push(['Live version', `<a href="${esc(r.live)}" rel="noopener">${esc(r.live.replace(/^https?:\/\//, ''))}</a>`]);
    if (r.releases[0]) facts.push(['Latest release', `<a href="${esc(r.releases[0].url)}" rel="noopener">${esc(r.releases[0].tag)}</a>${r.releases[0].publishedAt ? ' (' + fmtDate(r.releases[0].publishedAt) + ')' : ''}`]);
    const related = featured.filter((x) => x !== r).map((x) => `<li><a href="/projects/${x.slug}/">${esc(x.name)}</a>: ${esc(SHORT[x.name.toLowerCase()] || '')}</li>`).join('\n          ');
    const body = `    <p class="crumbs"><a href="/">Home</a> / <a href="/projects/">Projects</a> / ${esc(r.name)}</p>
    <div class="page-grid">
      <article>
        <h1>${esc(r.name)}</h1>
        <p class="lead">${esc(short.charAt(0).toUpperCase() + short.slice(1))}.</p>
        <p>${esc(r.line)}</p>${r.note ? `\n        <p class="note">${esc(r.note)}</p>` : ''}${r.topics.length ? `\n        <ul class="tags" aria-label="Topics">${r.topics.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
        <p class="cta-row">
          ${r.live ? `<a class="btn btn-primary" href="${esc(r.live)}" rel="noopener">Open live demo</a>
          <a class="btn btn-secondary" href="${esc(r.url)}" rel="noopener">Source code</a>` : `<a class="btn btn-primary" href="${esc(r.url)}" rel="noopener">Source code</a>`}
        </p>
        <p class="links">
          ${linksFor(r, { detail: true })}
        </p>
      </article>
      <aside class="side-card" aria-labelledby="h-facts">
        <h2 id="h-facts">Project facts</h2>
        <dl class="facts">
${facts.map(([k, v]) => `          <dt>${k}</dt><dd>${v}</dd>`).join('\n')}
        </dl>
      </aside>
    </div>
    <section class="related" aria-labelledby="h-related">
      <h2 id="h-related">More by ${NAME}</h2>
      <ul class="plain">
          ${related}
      </ul>
      <p class="more"><a href="/projects/">See all projects</a></p>
    </section>`;
    await write(`projects${urlPath.slice('/projects'.length)}index.html`, page({
        title, desc, urlPath, body, ogType: 'article', current: 'projects',
        graph: {
            '@context': 'https://schema.org',
            '@graph': [
                breadcrumbs([{ name: 'Home', path: '/' }, { name: 'Projects', path: '/projects/' }, { name: r.name, path: urlPath }]),
                { '@type': 'WebPage', '@id': SITE + urlPath + '#webpage', url: SITE + urlPath, name: title, description: desc, inLanguage: 'en', isPartOf: { '@id': SITE + '/#website' }, mainEntity: { '@id': `${SITE}${urlPath}#software` }, dateModified: r.pushedAt || generatedAt },
                softwareNode(r),
            ],
        },
    }));
}

/* ---------- 7. projects index ---------- */
{
    const urlPath = '/projects/';
    const desc = trimTo(`Open-source projects by ${NAME} (@${OWNER}): ${featured.map((r) => r.name).join(', ')}. Machine learning, simulation, Android, Linux and developer tools.`, 158);
    const title = `Projects by ${NAME} (@${OWNER}) | machine learning, simulation, Android`;
    const otherItems = others.map((r) => {
        const d = r.line && !/ · updated /.test(r.line) ? r.line : '';
        const meta = [r.language, r.pushedAt ? 'updated ' + fmtDate(r.pushedAt) : ''].filter(Boolean).join(' · ');
        return `        <li><a href="${esc(r.url)}" rel="noopener">${esc(r.name)}</a>${d ? ': ' + esc(d) : ''}${meta ? ` <span class="muted">(${esc(meta)})</span>` : ''}</li>`;
    }).join('\n');
    const body = `    <p class="crumbs"><a href="/">Home</a> / Projects</p>
    <h1>Projects by ${NAME}</h1>
    <p class="lead">Public work by ${NAME} (<a href="${SOCIAL.github}">@${OWNER}</a>), with details, source links and release downloads. Synced from GitHub every few hours (last sync ${genStamp}).</p>
    <h2 id="h-featured">Featured projects</h2>
    <ul class="index">
      ${featured.map(projectItem).join('\n      ')}
    </ul>${others.length ? `
    <section class="related" aria-labelledby="h-more">
      <h2 id="h-more">More repositories</h2>
      <ul class="plain">
${otherItems}
      </ul>
    </section>` : ''}`;
    await write('projects/index.html', page({
        title, desc, urlPath, body, current: 'projects',
        graph: {
            '@context': 'https://schema.org',
            '@graph': [
                breadcrumbs([{ name: 'Home', path: '/' }, { name: 'Projects', path: '/projects/' }]),
                {
                    '@type': 'CollectionPage', '@id': SITE + urlPath + '#webpage', url: SITE + urlPath, name: title, description: desc, inLanguage: 'en',
                    isPartOf: { '@id': SITE + '/#website' }, about: { '@id': PERSON_ID }, dateModified: generatedAt,
                    mainEntity: { '@type': 'ItemList', itemListElement: featured.map((r, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/projects/${r.slug}/`, name: r.name })) },
                },
            ],
        },
    }));
}

/* ---------- 8. 404 ---------- */
await write('404.html', page({
    title: `Page not found | ${NAME}`, desc: 'This page does not exist.', urlPath: '/404.html', noindex: true,
    body: `    <h1>Page not found</h1>
    <p class="lead">That page does not exist. Check the address, or go to the <a href="/">home page</a> or the <a href="/projects/">projects</a>.</p>`,
}));

/* ---------- 9. home page ---------- */
{
    const template = await read('src/index.template.html');
    const projects = `<ul id="list-items" class="index">\n      ${featured.map(projectItem).join('\n      ')}\n    </ul>`;
    const preloads = [fontPreload, ...preloadUrls.map((u) => `<link rel="modulepreload" href="${u}">`)].join('\n');
    const html = template
        .replace('{{FAVICON}}', () => FAVICON)
        .replace('{{GSV}}', () => GSV)
        .replace('{{PRELOAD}}', () => preloads)
        .replace('{{CSS}}', () => `<style>${cssText}</style>`)
        .replace('{{JSONLD}}', () => jsonScript(homeGraph))
        .replace('{{THEME_HEAD}}', () => THEME_HEAD)
        .replace('{{PROJECTS}}', () => projects)
        .replace('{{SYNCED}}', `Repo data synced from GitHub ${genStamp}.`)
        .replace('{{YEAR}}', String(YEAR))
        .replace('{{UI_JS}}', () => UI_JS)
        .replace('{{MAIN_JS}}', `<script type="module" src="${mainUrl}"></script>`);
    if (/\{\{[A-Z_]+\}\}/.test(html)) throw new Error('unreplaced template token in index.html');
    await write('index.html', html);
}

/* ---------- 10. robots, sitemap, llms.txt ---------- */
const SEARCH_BOTS = ['Googlebot', 'Bingbot', 'Applebot', 'OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'DuckDuckBot'];
const TRAINING_BOTS = ['GPTBot', 'ClaudeBot', 'Google-Extended', 'Applebot-Extended', 'CCBot', 'meta-externalagent'];
await write('robots.txt', `# ${SITE}
# Search engines and AI answer engines may crawl everything. Allowing the search/retrieval bots below is what lets
# this site be found and cited by Google, Bing, ChatGPT search, Claude, Perplexity and Apple.
User-agent: *
Allow: /

${SEARCH_BOTS.map((b) => `User-agent: ${b}\nAllow: /`).join('\n\n')}

# Crawlers that collect content for model TRAINING. Currently allowed, like everything else.
# To opt out of training only (search and citations are unaffected), change "Allow: /" to "Disallow: /" in the blocks below.
${TRAINING_BOTS.map((b) => `User-agent: ${b}\nAllow: /`).join('\n\n')}

Sitemap: ${SITE}/sitemap.xml
`);

const urls = [
    { loc: SITE + '/', lastmod: genDay, changefreq: 'weekly', priority: '1.0', image: SOCIAL_IMG },
    { loc: SITE + '/projects/', lastmod: genDay, changefreq: 'weekly', priority: '0.8' },
    ...featured.map((r) => ({ loc: `${SITE}/projects/${r.slug}/`, lastmod: lastmod(r), changefreq: 'monthly', priority: '0.7' })),
];
await write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.map((u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>${u.image ? `\n    <image:image><image:loc>${u.image}</image:loc></image:image>` : ''}
  </url>`).join('\n')}
</urlset>
`);

await write('llms.txt', `# ${NAME} (@${OWNER})

> ${NAME} builds machine learning, simulation and software projects in the open. This site is his portfolio: a plain, fast page with an optional interactive 3D black-hole view in which each public GitHub repository is a body in orbit.

Key facts: handle @${OWNER} on GitHub, X and Facebook. Focus: machine learning and simulation. Languages used: JavaScript/TypeScript, Python, Kotlin, HTML. Contact: rabin@ruhrbin.site. Repo data on this site is synced from GitHub every few hours (last sync ${genStamp}).

## Projects
${featured.map((r) => `- [${r.name}](${SITE}/projects/${r.slug}/): ${r.line}`).join('\n')}

## Pages
- [Home](${SITE}/): About, projects, interactive instruments (Lorenz attractor, double pendulum, Kepler orbit, loss landscape, particle in a box), how the black hole is rendered, and contact details.
- [All projects](${SITE}/projects/): every project with details, source links and release downloads.

## Profiles
- [GitHub](${SOCIAL.github})
- [X](${SOCIAL.x})
- [Facebook](${SOCIAL.facebook})
`);

/* ---------- 11. keep sources out of the published site (Jekyll runs on GitHub Pages by default) ---------- */
await write('_config.yml', `# Sources and tooling are not part of the published site.
exclude:
  - src
  - scripts
  - node_modules
  - package.json
  - package-lock.json
  - README.md
  - CHANGELOG.md
`);

const sizeOf = async (rel) => (await fs.stat(P(rel))).size;
console.log(`built: main ${mainUrl} (${((await sizeOf(mainUrl.slice(1))) / 1024).toFixed(1)} KB), css ${cssUrl}`);
console.log(`pages: / , /projects/ , ${featured.length} project pages, 404.html; ${data.repos.length} repos in data (${others.length} not featured)`);
