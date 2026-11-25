// grabs my public github data at build time so the page has something to show before the live fetch kicks in (src/scripts/live.js).
// tries the official API first (GITHUB_TOKEN in actions), then the public html pages, then falls back to the last saved snapshot.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const USER = process.env.GH_USER || 'RuHRabin';
const OUT = new URL('../src/data/github.json', import.meta.url);
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const UA = { 'user-agent': 'ruhrbin-site-build' };
const tok = process.env.GITHUB_TOKEN;
const API = { ...UA, accept: 'application/vnd.github+json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) };
const text = async (u) => { const r = await fetch(u, { headers: UA }); if (!r.ok) throw new Error(`${u} ${r.status}`); return r.text(); };
const clean = (s) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

async function contributions() {
  const html = await text(`https://github.com/users/${USER}/contributions`);
  const tips = new Map([...html.matchAll(/<tool-tip[^>]*for="([^"]+)"[^>]*>([^<]+)<\/tool-tip>/g)].map((m) => [m[1], m[2]]));
  const days = [];
  for (const m of html.matchAll(/<td[^>]*data-date="[^"]+"[^>]*>/g)) {
    const tag = m[0], date = /data-date="([\d-]+)"/.exec(tag)?.[1], level = +(/data-level="(\d)"/.exec(tag)?.[1] ?? 0), id = /id="([^"]+)"/.exec(tag)?.[1];
    const count = +(/^(\d+) contribution/.exec(tips.get(id) ?? '')?.[1] ?? 0);
    if (date) days.push({ date, level, count });
  }
  if (days.length < 300) throw new Error('unexpected calendar size');
  days.sort((a, b) => a.date.localeCompare(b.date));
  const start = new Date(days[0].date + 'T00:00:00Z'), w = [];
  for (const d of days) { const i = Math.round((new Date(d.date + 'T00:00:00Z') - start) / 864e5); (w[Math.floor(i / 7)] ??= Array(7).fill(null))[i % 7] = [d.level, d.count]; }
  return { s: days[0].date, w, total: days.reduce((a, d) => a + d.count, 0) };
}
async function reposApi() {
  const r = await fetch(`https://api.github.com/users/${USER}/repos?per_page=100&sort=pushed`, { headers: API });
  if (!r.ok) throw new Error('api ' + r.status);
  return (await r.json()).filter((x) => !x.fork).map((x) => ({ n: x.name, d: x.description || '', l: x.language || '', u: (x.pushed_at || '').slice(0, 10), s: x.stargazers_count }));
}
async function reposHtml() {
  const h = await text(`https://github.com/${USER}?tab=repositories`);
  return [...h.matchAll(/<li[^>]*itemprop="owns"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => {
    const b = m[1], g = (re) => re.exec(b)?.[1];
    const lang = g(/itemprop="programmingLanguage">([^<]+)</) || '', desc = clean(g(/itemprop="description"[^>]*>([\s\S]*?)<\/p>/) || '');
    return { n: clean(g(/itemprop="name codeRepository"[^>]*>\s*([^<]+?)\s*<\/a>/) || ''), d: desc.length > 12 && desc !== lang ? desc : '', l: g(/itemprop="programmingLanguage">([^<]+)</) || '', u: (g(/datetime="([^"]+)"/) || '').slice(0, 10), s: +((g(/\/stargazers"[^>]*>[\s\S]*?([\d,]+)\s*<\/a>/) || '0').replace(/,/g, '')) };
  }).filter((r) => r.n);
}
async function counts() {
  const h = await text(`https://github.com/${USER}`);
  const num = (re) => { const m = re.exec(h); return m ? +m[1].replace(/,/g, '') : undefined; };
  return { followers: num(/([\d,]+)\s*<\/span>\s*followers/i), following: num(/([\d,]+)\s*<\/span>\s*following/i) };
}

const out = { ...prev, updated: new Date().toISOString().slice(0, 10) };
try { Object.assign(out, await contributions()); console.log(`contributions: ${out.total}`); } catch (e) { console.warn('contributions: keeping snapshot (' + e.message + ')'); }
let list;
try { list = await reposApi(); console.log('repos via API'); } catch (e) { try { list = await reposHtml(); console.log('repos via public page (' + e.message + ')'); } catch (e2) { console.warn('repos: keeping snapshot (' + e2.message + ')'); } }
if (list && list.length) { out.list = list; out.repos = list.length; }
try { const c = await counts(); if (c.followers != null) out.followers = c.followers; if (c.following != null) out.following = c.following; } catch (e) { console.warn('profile counts: keeping snapshot'); }
writeFileSync(OUT, JSON.stringify(out));
console.log(`github data: ${out.total} contributions, ${out.repos} repos, ${out.followers} followers, ${out.list?.length || 0} listed`);
