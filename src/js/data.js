// FILE: js/data.js
import { daysSince } from './physics.js';

export const OWNER = 'RuHRabin';
export const HIDDEN = new Set(['ruhrabin.github.io', 'ruhrabin']);   // the site itself and the profile repo
const MAX_BODIES = 36;

// Hand-written one-liners for featured repos (lookup is case-insensitive).
export const FEATURED = new Map([
    ['gargantua', {
        line: 'Fly a small ship around a black hole. A fragment shader ray-marches light through Schwarzschild-style curvature, so the lensing is computed per pixel; the clock runs on time dilation; the score is generated live with Web Audio. Three.js, React, Vite.',
        note: 'Fan project, not affiliated with or endorsed by the makers of Interstellar.',
    }],
    ['earthpulse', {
        line: 'Live map of the last 24 hours of earthquakes (USGS) plus active US severe-weather alerts. No server: a Python script on GitHub Actions refreshes the data every 15 minutes. An awareness tool, not an official warning system.',
    }],
    ['sol-mesh', {
        line: 'Serverless peer-to-peer messaging and file transfer for Android. Peers find each other by UDP multicast on the LAN or a Kademlia DHT over the internet, authenticate with Ed25519, and talk over X25519 + Double Ratchet + AES-256-GCM.',
    }],
    ['xkb-avro', {
        line: 'Native XKB keyboard layout for Bengali Avro Phonetic on Linux. No IBus, no Fcitx, no daemon.',
    }],
    ['html-bangla', {
        line: 'Offline Android app teaching HSC ICT Chapter 4 (Web Design & HTML) in Bengali, with a live split-view code editor.',
    }],
    ['schemify', {
        line: 'A single-file, dependency-free CLI that scans a messy CSV/TSV/JSON file, infers a clean type for every field, and emits a typed schema (JSON Schema, Pydantic, dataclass or TypeScript interface) plus an optional cleaned copy.',
    }],
]);

// Used only if data/github-sync.json cannot be loaded. Unknown fields stay null on purpose
// (no invented stars, dates or languages). TODO(Rabin): fill these in if you want a richer fallback.
export const FALLBACK = {
    generated_at: null,
    repos: [
        { name: 'Gargantua', language: 'TypeScript', has_pages: true, homepage: 'https://ruhrabin.github.io/Gargantua/' },
        { name: 'earthpulse' },
        { name: 'Sol-Mesh' },
        { name: 'xkb-avro' },
        { name: 'html-bangla' },
        { name: 'Schemify' },
    ],
    releases: [
        { repoName: 'Sol-Mesh', tag_name: 'v1.0.1' },
        { repoName: 'html-bangla', tag_name: 'v1.0.0' },
    ],
};

/* ---------- helpers ---------- */
export function slugOf(name) {
    return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
        for (const k in attrs) {
            const val = attrs[k];
            if (val == null || val === false) continue;
            if (k === 'class') el.className = val;
            else el.setAttribute(k, val === true ? '' : val);
        }
    }
    for (const kid of kids.flat()) {
        if (kid == null || kid === false) continue;
        el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
}

function toUrl(s) {
    s = typeof s === 'string' ? s.trim() : '';
    if (!s) return null;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;
        return /^https?:\/\//i.test(s) ? s : null;
}

export function formatDate(iso) {
    const t = Date.parse(iso);
    return isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}

export function relativeTime(iso, nowMs = Date.now()) {
    const t = Date.parse(iso);
    if (!isFinite(t)) return 'at an unknown time';
    const s = Math.round((t - nowMs) / 1000), a = Math.abs(s);
    if (a < 60) return 'just now';
    const units = [['day', 86400], ['hour', 3600], ['minute', 60]];
    for (const [name, sec] of units) {
        if (a >= sec) {
            const n = Math.floor(a / sec);
            return n + ' ' + name + (n === 1 ? '' : 's') + (s <= 0 ? ' ago' : ' from now');
        }
    }
    return 'just now';
}

/* ---------- normalisation ---------- */
function normRelease(r, repoUrl) {
    if (!r || typeof r !== 'object') return null;
    const tag = typeof r.tag_name === 'string' ? r.tag_name : '';
    const title = typeof r.name === 'string' && r.name ? r.name : tag;
    const url = toUrl(r.html_url) || (tag ? repoUrl + '/releases/tag/' + encodeURIComponent(tag) : repoUrl + '/releases');
    const assets = (Array.isArray(r.assets) ? r.assets : [])
    .map((a) => (a && typeof a === 'object' ? { name: String(a.name || 'file'), url: toUrl(a.browser_download_url) } : null))
    .filter((a) => a && a.url);
    return { tag: tag || title || 'release', name: title, publishedAt: typeof r.published_at === 'string' ? r.published_at : null, url, assets };
}

function normRepo(raw, relsByRepo, fallback) {
    const name = String(raw.name);
    const feat = FEATURED.get(name.toLowerCase());
    // Prefer the owner's last commit over pushed_at, which bots also move (see the sync script).
    const stamp = [raw.last_commit_at, raw.pushed_at].find((v) => typeof v === 'string' && isFinite(Date.parse(v)));
    const pushedAt = stamp || null;
    const language = typeof raw.language === 'string' && raw.language ? raw.language : null;
    const stars = Number.isFinite(raw.stargazers_count) ? raw.stargazers_count : null;
    const desc = typeof raw.description === 'string' && raw.description.trim() ? raw.description.trim() : null;
    const line = feat ? feat.line : (desc || (language || 'Language unknown') + ' \u00b7 updated ' + (pushedAt ? formatDate(pushedAt) : 'date unknown'));
    const url = toUrl(raw.html_url) || 'https://github.com/' + OWNER + '/' + encodeURIComponent(name);
    const live = toUrl(raw.homepage) || (raw.has_pages ? 'https://ruhrabin.github.io/' + encodeURIComponent(name) + '/' : null);
    const rels = (relsByRepo.get(name.toLowerCase()) || []).map((r) => normRelease(r, url)).filter(Boolean);
    return {
        name, line, note: feat && feat.note ? feat.note : null, language, stars, pushedAt,
        days: pushedAt ? daysSince(pushedAt) : null,   // null = unknown; physics.js places it at a placeholder radius
        url, live, releases: rels, fallback: !!fallback,
        slug: slugOf(name),
        topics: Array.isArray(raw.topics) ? raw.topics.filter((t) => typeof t === 'string') : [],
        license: raw.license && typeof raw.license === 'object' && typeof raw.license.spdx_id === 'string' && raw.license.spdx_id !== 'NOASSERTION' ? raw.license.spdx_id : null,
        createdAt: typeof raw.created_at === 'string' && isFinite(Date.parse(raw.created_at)) ? raw.created_at : null,
        featured: !!feat,
    };
}

export function normalize(json, fallback) {
    const rels = Array.isArray(json && json.releases) ? json.releases : [];
    const relsByRepo = new Map();
    for (const r of rels) {
        if (!r || typeof r.repoName !== 'string') continue;
        const key = r.repoName.toLowerCase();
        if (!relsByRepo.has(key)) relsByRepo.set(key, []);
        relsByRepo.get(key).push(r);
    }
    for (const list of relsByRepo.values()) {
        list.sort((a, b) => (Date.parse(b.published_at) || 0) - (Date.parse(a.published_at) || 0));
    }
    const raw = Array.isArray(json && json.repos) ? json.repos : [];
    const repos = raw
    .filter((r) => r && typeof r.name === 'string' && r.name && !r.fork && !HIDDEN.has(r.name.toLowerCase()))
    .map((r) => normRepo(r, relsByRepo, fallback))
    .sort((a, b) => (Date.parse(b.pushedAt) || 0) - (Date.parse(a.pushedAt) || 0))
    .slice(0, MAX_BODIES);
    return { repos, generatedAt: json && typeof json.generated_at === 'string' ? json.generated_at : null };
}

export async function loadData() {
    try {
        const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = setTimeout(() => { if (ctrl) ctrl.abort(); }, 6000);
        const res = await fetch('data/github-sync.json', { cache: 'no-cache', signal: ctrl ? ctrl.signal : undefined });
        clearTimeout(timer);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const out = normalize(await res.json(), false);
        if (!out.repos.length) throw new Error('no visible repos');
        return { ...out, source: 'live' };
    } catch (err) {
        console.warn('[data] using built-in list:', err);
        return { ...normalize(FALLBACK, true), source: 'fallback' };
    }
}

/* ---------- plain list view ---------- */
export function renderList(ul, repos) {
    if (!ul || !Array.isArray(repos) || !repos.length) return;
    ul.textContent = '';
    for (const r of repos) {
        const meta = [
            r.language || 'language unknown',
            r.stars == null ? null : '\u2605 ' + r.stars,
            r.pushedAt ? 'last commit ' + formatDate(r.pushedAt) : null,
        ].filter(Boolean).join(' \u00b7 ');
        const links = [];
        if (r.live) links.push(h('a', { href: r.live, rel: 'noopener' }, 'Live'));
        links.push(h('a', { href: r.url, rel: 'noopener' }, 'Source'));
        r.releases.slice(0, 2).forEach((rel) => {
            links.push(h('a', { href: rel.url, rel: 'noopener' }, 'Release ' + rel.tag));
            rel.assets.slice(0, 3).forEach((as) => links.push(h('a', { href: as.url, rel: 'noopener' }, 'Download ' + as.name)));
        });
        ul.append(h('li', null,
                    h('h3', null, r.name),
                    h('p', null, r.line),
                    r.note ? h('p', { class: 'note' }, r.note) : null,
                    h('p', { class: 'meta' }, meta),
                    h('p', { class: 'links' }, ...links)));
    }
}
