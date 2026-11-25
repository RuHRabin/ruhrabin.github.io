import GH from '../data/github.json';
export const $ = (s, r) => (r || document).querySelector(s);
export const $$ = (s, r) => [].slice.call((r || document).querySelectorAll(s));
export function h(t, c, x) { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
export const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const root = document.documentElement;
export const coarse = !matchMedia('(hover:hover)').matches;
export const SC = { y: scrollY, ty: scrollY, vel: 0, p: 0, hp: 0 }; // shared scroll state
export const state = { warp: 0, gh: { total: GH.total, repos: GH.repos, followers: GH.followers } };
export const REPOS = [...GH.list].sort((a, b) => b.u.localeCompare(a.u)).slice(0, 8).map((r) => ({ n: r.n, l: r.l || 'code', u: r.u }));
export function ago(s) {
  const d = Math.max(0, Math.floor((Date.now() - new Date(s)) / 864e5));
  return d < 1 ? 'today' : d === 1 ? 'yesterday' : d < 31 ? d + ' days ago' : d < 365 ? Math.floor(d / 30) + ' months ago' : Math.floor(d / 365) + ' years ago';
}
export function lockScroll(v) { root.style.overflow = v ? 'hidden' : ''; const l = window.__lenis; if (l) { if (v) l.stop(); else l.start(); } }
