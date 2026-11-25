// backend for SIG: a free Cloudflare Worker using Workers AI (so there's no API key to leak).
// deploy:  cd worker && npx wrangler deploy
// then set the repo variable PUBLIC_SIG_ENDPOINT to the worker URL (GitHub → Settings → Variables).
const ALLOW = ['https://ruhrbin.site'];
const MODEL = '@cf/meta/llama-3.1-8b-instruct';
const SYSTEM = `You are SIG, the assistant on the portfolio of Rakib Ul Hasan Rabin (RuH Rabin).
Facts you may use: Python developer and AI builder from Bangladesh; obsessed with how computers work at the lowest level; uses Arch Linux and Bash;
works with Python, C, TypeScript, PyTorch, TensorFlow, scikit-learn, Hugging Face, FastAPI, Supabase, Firebase, Docker, Next.js;
projects include Gargantua (a browser game inspired by Interstellar, built with Three.js, React and Vite) and xkb-avro (a native XKB layout for Bengali Avro Phonetic on Linux);
open to freelance work and collaborations; email rabin@ruhrbin.site; GitHub and X: @RuHRabin.
Rules: answer in at most 3 short sentences, only about Rabin and this site, never invent facts, and say you don't know if unsure.`;

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const ok = ALLOW.includes(origin);
    const cors = { 'Access-Control-Allow-Origin': ok ? origin : ALLOW[0], 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST' || !ok) return new Response('Forbidden', { status: 403, headers: cors });
    let body;
    try { body = await req.json(); } catch { return new Response('Bad request', { status: 400, headers: cors }); }
    const messages = (body.messages || []).slice(-8).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 600) }));
    const stream = await env.AI.run(MODEL, { messages: [{ role: 'system', content: SYSTEM }, ...messages], max_tokens: 220, stream: true });
    return new Response(stream, { headers: { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' } });
  },
};
