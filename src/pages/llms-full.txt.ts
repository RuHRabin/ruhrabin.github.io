import type { APIRoute } from 'astro';
import gh from '../data/github.json';
import { site, faq } from '../data/site.js';

export const GET: APIRoute = () => {
  const repos = [...gh.list].sort((a, b) => b.u.localeCompare(a.u));
  const body = `# ${site.name} (${site.alt}): full context

${site.description}

## Facts
- Role: Python Developer & AI Builder
- Location: Bangladesh
- Operating system: Arch Linux, shell: Bash
- Languages: Python, C, TypeScript, Bash
- Machine learning: PyTorch, TensorFlow, scikit-learn, Hugging Face
- Backend and data: FastAPI, Supabase, Firebase, Docker
- Web: Next.js, TypeScript, Three.js
- Availability: open to freelance work, collaborations and curious conversations
- Email: ${site.email} and ${site.email2}
- GitHub: ${site.github} (${gh.total} contributions in the last year, ${gh.repos} public repositories, ${gh.followers} followers, snapshot ${gh.updated})
- X: ${site.x}

## Repositories (newest first)
${repos.map((r) => `### ${r.n}\n${r.d || 'No description.'}\nLanguage: ${r.l || 'n/a'} · Last pushed: ${r.u} · Stars: ${r.s}\n${site.github}/${r.n}`).join('\n\n')}

## FAQ
${faq.map((f) => `### ${f.q}\n${f.a}`).join('\n\n')}
`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
