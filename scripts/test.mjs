// Validates the BUILT site. Run after `npm run build`; the workflow refuses to publish if anything here fails.
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://rabin.ruhrbin.site';
const failures = [];
let checks = 0;
const check = (name, cond, detail = '') => { checks++; if (!cond) failures.push(name + (detail ? ' :: ' + detail : '')); };
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

// every HTML page the build produces
const pages = ['index.html', 'projects/index.html', '404.html'];
for (const d of fs.readdirSync(path.join(ROOT, 'projects'), { withFileTypes: true })) {
    if (d.isDirectory() && exists(`projects/${d.name}/index.html`)) pages.push(`projects/${d.name}/index.html`);
}
const toUrl = (p) => (p === 'index.html' ? '/' : '/' + p.replace(/index\.html$/, ''));
const titles = new Map();
const descs = new Map();

function resolveLocal(href, fromPage) {
    const clean = href.split('#')[0].split('?')[0];
    if (!clean) return true;
    let rel = clean.startsWith('/') ? clean.slice(1) : path.posix.join(path.posix.dirname(fromPage), clean);
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    return exists(rel) || exists(rel + '/index.html');
}

for (const p of pages) {
    const html = read(p);
    const isErr = p === '404.html';
    check(`${p}: no unreplaced template tokens`, !/\{\{[A-Z_]+\}\}/.test(html));
    check(`${p}: <html lang="en">`, /<html lang="en"/.test(html));
    const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
    check(`${p}: title present and <= 75 chars`, title.length > 10 && title.length <= 75, `${title.length}: ${title}`);
    check(`${p}: title is unique`, !titles.has(title), title);
    titles.set(title, p);
    const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
    check(`${p}: meta description 70-165 chars`, isErr || (desc.length >= 70 && desc.length <= 165), `${desc.length}`);
    if (!isErr) { check(`${p}: description is unique`, !descs.has(desc)); descs.set(desc, p); }
    const canon = (html.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
    if (isErr) check(`${p}: noindex`, /name="robots" content="noindex/.test(html));
    else {
        check(`${p}: canonical matches its URL`, canon === SITE + toUrl(p), `${canon}`);
        check(`${p}: robots allows indexing`, /name="robots" content="index,follow/.test(html));
        check(`${p}: og:url + og:image + twitter:card`, html.includes(`property="og:url" content="${SITE + toUrl(p)}"`) && /property="og:image" content="https:/.test(html) && /name="twitter:card"/.test(html));
    }
    check(`${p}: exactly one <h1>`, (html.match(/<h1[\s>]/g) || []).length === 1, String((html.match(/<h1[\s>]/g) || []).length));
    check(`${p}: viewport meta`, /name="viewport"/.test(html));
    check(`${p}: no third-party script/style/font hosts`, !/(fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr|unpkg\.com|cdnjs)/.test(html));
    check(`${p}: no "TODO" text`, !/TODO/.test(html));
    // JSON-LD must parse
    const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    if (!isErr) check(`${p}: has JSON-LD`, ld.length > 0);
    for (const m of ld) {
        let obj = null;
        try { obj = JSON.parse(m[1]); } catch (e) { /* reported below */ }
        check(`${p}: JSON-LD parses`, !!obj);
        if (obj) check(`${p}: JSON-LD has @context`, obj['@context'] === 'https://schema.org');
    }
    // images need alt, links must resolve
    for (const m of html.matchAll(/<img\b[^>]*>/g)) check(`${p}: <img> has alt`, /\balt=/.test(m[0]));
    for (const m of html.matchAll(/(?:href|src)="([^"#][^"]*)"/g)) {
        const u = m[1];
        if (/^(https?:|mailto:|data:|tel:)/.test(u)) continue;
        check(`${p}: local link resolves (${u})`, resolveLocal(u, p));
    }
    // ids unique
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
    check(`${p}: unique ids`, dup.length === 0, dup.join(','));
}

// home page specifics
{
    const home = read('index.html');
    check('home: person JSON-LD with sameAs', /"@type":"Person"/.test(home) && /"sameAs":\["https:\/\/github\.com\/RuHRabin"/.test(home));
    check('home: project list is server-rendered with detail links', (home.match(/href="\/projects\/[a-z0-9-]+\/"/g) || []).length >= 6);
    check('home: About and Q&A sections are in the HTML', home.includes('id="about"') && home.includes('id="faq"'));
    check('home: first paint does not depend on a preloader overlay', !home.includes('id="preloader"'));
    check('home: font preload present', /rel="preload" as="font"/.test(home));
    check('home: main script is a module near the end of body', /<script type="module" src="\/assets\/js\/main-[A-Z0-9]+\.js"><\/script>\s*<\/body>/.test(home));
    check('home: inlined CSS (no render-blocking request)', /<style>[\s\S]{2000,}<\/style>/.test(home));
    const gz = zlib.gzipSync(home).length;
    check('home: HTML + inlined CSS under 22 KB compressed', gz < 22 * 1024, `${gz} bytes gzipped`);
    check('home: game flight-deck container exists (3D only)', home.includes('<div id="game"></div>'));
}

// project pages: SoftwareSourceCode with repo link
for (const p of pages.filter((x) => /^projects\/[^/]+\/index\.html$/.test(x))) {
    const html = read(p);
    check(`${p}: SoftwareSourceCode + codeRepository`, /"@type":"SoftwareSourceCode"/.test(html) && /"codeRepository":"https:\/\/github\.com\/RuHRabin\//.test(html));
    check(`${p}: breadcrumb JSON-LD`, /"@type":"BreadcrumbList"/.test(html));
}

// robots, sitemap, llms.txt
{
    const robots = read('robots.txt');
    check('robots: points to the sitemap', robots.includes(`Sitemap: ${SITE}/sitemap.xml`));
    for (const bot of ['OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot', 'Googlebot', 'Bingbot']) {
        check(`robots: ${bot} explicitly allowed`, new RegExp(`User-agent: ${bot}\\s+Allow: /`).test(robots));
    }
    check('robots: no blanket Disallow', !/^Disallow:\s*\/\s*$/m.test(robots.split('# Crawlers that collect')[0]));
    const sm = read('sitemap.xml');
    const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    check('sitemap: lists every indexable page', locs.length === pages.filter((x) => x !== '404.html').length, `${locs.length} vs ${pages.length - 1}`);
    for (const loc of locs) {
        const rel = loc.replace(SITE + '/', '') || 'index.html';
        check(`sitemap: ${loc} exists`, exists(rel.endsWith('/') || rel === '' ? rel + 'index.html' : rel));
    }
    check('sitemap: lastmod dates are ISO', [...sm.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].every((m) => /^\d{4}-\d{2}-\d{2}$/.test(m[1])));
    const llms = read('llms.txt');
    check('llms.txt: H1 + blockquote summary + project links', /^# /.test(llms) && /\n> /.test(llms) && (llms.match(/\(https:\/\/rabin\.ruhrbin\.site\/projects\//g) || []).length >= 6);
}

// Facebook was removed everywhere: no published file may mention it
{
    const files = ['index.html', '404.html', 'llms.txt', 'robots.txt', 'sitemap.xml', ...pages];
    for (const f of new Set(files)) check(`no Facebook reference in ${f}`, !/facebook/i.test(read(f)));
}

// assets referenced by the built JS and CSS exist (hashed names stay in sync)
{
    const home = read('index.html');
    const main = (home.match(/src="(\/assets\/js\/main-[A-Z0-9]+\.js)"/) || [])[1];
    check('assets: main bundle exists', !!main && exists(main.slice(1)));
    if (main) {
        const js = read(main.slice(1));
        for (const m of js.matchAll(/["'`](\.\/(?:chunks\/)?[\w.-]+\.js)["'`]/g)) {
            const rel = path.posix.join(path.posix.dirname(main.slice(1)), m[1]);
            check(`assets: imported chunk exists (${m[1]})`, exists(rel));
        }
    }
    for (const f of ['assets/fonts/source-serif-4-latin-600-normal.woff2', 'assets/vendor/katex/katex.min.js', 'assets/vendor/katex/katex.min.css', 'img/social.png', 'CNAME']) {
        check(`assets: ${f} exists`, exists(f));
    }
}

console.log(`${checks} checks, ${failures.length} failed`);
if (failures.length) {
    for (const f of failures) console.error('  FAIL ' + f);
    process.exit(1);
}
console.log('OK');
