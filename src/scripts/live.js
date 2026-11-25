const USER = 'RuHRabin';
const EP = (import.meta.env.PUBLIC_GH_ENDPOINT || '').replace(/\/$/, '');
const TTL = 10 * 60e3;

function cached(key, fn) {
  try { const c = JSON.parse(localStorage.getItem(key)); if (c && Date.now() - c.t < TTL) return Promise.resolve(c.v); } catch {}
  return fn().then((v) => { try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), v })); } catch {} return v; });
}
async function j(url, ms = 8000) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try { const r = await fetch(url, { signal: ac.signal, headers: { Accept: 'application/vnd.github+json' } }); if (!r.ok) throw new Error(String(r.status)); return await r.json(); }
  finally { clearTimeout(t); }
}
// accepts {s,w,total} (our worker) or {contributions:[{date,count,level}]} (community API) and returns Sunday-aligned weeks
function calendar(raw) {
  if (raw && raw.w && raw.s) return raw;
  const list = (raw && raw.contributions) || [];
  if (list.length < 300) throw new Error('calendar too small');
  list.sort((a, b) => a.date.localeCompare(b.date));
  const first = new Date(list[0].date + 'T00:00:00Z'), start = new Date(first.getTime() - first.getUTCDay() * 864e5), w = []; let total = 0;
  for (const d of list) { const i = Math.round((new Date(d.date + 'T00:00:00Z') - start) / 864e5); (w[Math.floor(i / 7)] ??= Array(7).fill(null))[i % 7] = [d.level, d.count]; total += d.count; }
  return { s: start.toISOString().slice(0, 10), w, total };
}
async function loadCalendar() {
  if (EP) { try { return calendar(await j(EP + '/contributions?user=' + USER)); } catch {} }
  return calendar(await j('https://github-contributions-api.jogruber.de/v4/' + USER + '?y=last'));
}
export async function fetchLive() {
  const [user, repos, events, cal] = await Promise.allSettled([
    cached('gh:user', () => j('https://api.github.com/users/' + USER)),
    cached('gh:repos', () => j('https://api.github.com/users/' + USER + '/repos?per_page=100&sort=pushed')),
    cached('gh:events', () => j('https://api.github.com/users/' + USER + '/events/public?per_page=15')),
    cached('gh:cal', loadCalendar),
  ]);
  const ok = (r) => r.status === 'fulfilled' ? r.value : null, out = {};
  const u = ok(user); if (u && typeof u.followers === 'number') out.user = { followers: u.followers, following: u.following, repos: u.public_repos };
  const r = ok(repos); if (Array.isArray(r)) out.repos = r.filter((x) => !x.fork).map((x) => ({ n: x.name, d: x.description || '', l: x.language || '', u: (x.pushed_at || '').slice(0, 10), s: x.stargazers_count }));
  const e = ok(events); if (Array.isArray(e)) out.events = e;
  const c = ok(cal); if (c && c.w) out.cal = c;
  return Object.keys(out).length ? out : null;
}
