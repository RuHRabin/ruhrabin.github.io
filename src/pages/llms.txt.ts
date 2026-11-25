import type { APIRoute } from 'astro';
import gh from '../data/github.json';
import { site } from '../data/site.js';

export const GET: APIRoute = () => {
  const repos = [...gh.list].sort((a, b) => b.u.localeCompare(a.u));
  const body = `# ${site.name} (${site.alt})

> Python developer and AI builder from Bangladesh, obsessed with how computers work at the lowest level. Works with Python, C, TypeScript, machine learning and Linux (Arch). Open to freelance work and collaborations.

## Site
- [Home](${site.url}/): portfolio, focus areas, tech stack, live GitHub activity, terminal and FAQ
- [Machine-readable profile](${site.url}/profile.json): JSON with facts, links, repositories and FAQ
- [Full context for LLMs](${site.url}/llms-full.txt)

## GitHub (${gh.total} contributions in the last year, ${gh.repos} public repositories, ${gh.followers} followers; updated ${gh.updated})
${repos.slice(0, 12).map((r) => `- [${r.n}](${site.github}/${r.n}): ${r.d || r.l || 'repository'}${r.l ? ` (${r.l})` : ''}`).join('\n')}

## Profiles
- [GitHub](${site.github})
- [X](${site.x})

## Contact
- ${site.email}
- ${site.email2}
`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
