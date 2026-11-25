const ALLOW = ['https://ruhrbin.site', 'http://localhost:4321'];
export default {
  async fetch(req, env, ctx) {
    const origin = req.headers.get('Origin') || '', ok = ALLOW.includes(origin);
    const cors = { 'Access-Control-Allow-Origin': ok ? origin : ALLOW[0], 'Access-Control-Allow-Methods': 'GET, OPTIONS', Vary: 'Origin' };
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const user = (url.searchParams.get('user') || 'RuHRabin').replace(/[^A-Za-z0-9-]/g, '').slice(0, 39);
    if (url.pathname !== '/contributions') return new Response('Not found', { status: 404, headers: cors });
    const cache = caches.default, key = new Request(url.origin + '/contributions?user=' + user);
    let res = await cache.match(key);
    if (!res) {
      const r = await fetch(`https://github.com/users/${user}/contributions`, { headers: { 'user-agent': 'ruhrbin-gh-live' } });
      if (!r.ok) return new Response('Upstream error', { status: 502, headers: cors });
      const html = await r.text();
      const tips = new Map([...html.matchAll(/<tool-tip[^>]*for="([^"]+)"[^>]*>([^<]+)<\/tool-tip>/g)].map((m) => [m[1], m[2]]));
      const days = [];
      for (const m of html.matchAll(/<td[^>]*data-date="[^"]+"[^>]*>/g)) {
        const tag = m[0], date = /data-date="([\d-]+)"/.exec(tag)?.[1], level = +(/data-level="(\d)"/.exec(tag)?.[1] ?? 0), id = /id="([^"]+)"/.exec(tag)?.[1];
        const count = +(/^(\d+) contribution/.exec(tips.get(id) ?? '')?.[1] ?? 0);
        if (date) days.push({ date, level, count });
      }
      days.sort((a, b) => a.date.localeCompare(b.date));
      const start = new Date(days[0].date + 'T00:00:00Z'), w = [];
      for (const d of days) { const i = Math.round((new Date(d.date + 'T00:00:00Z') - start) / 864e5); (w[Math.floor(i / 7)] ??= Array(7).fill(null))[i % 7] = [d.level, d.count]; }
      res = new Response(JSON.stringify({ s: days[0].date, w, total: days.reduce((a, d) => a + d.count, 0) }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' } });
      ctx.waitUntil(cache.put(key, res.clone()));
    }
    const out = new Response(res.body, res); Object.entries(cors).forEach(([k, v]) => out.headers.set(k, v)); return out;
  },
};
