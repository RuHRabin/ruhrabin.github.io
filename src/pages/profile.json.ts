import type { APIRoute } from 'astro';
import gh from '../data/github.json';
import { site, faq } from '../data/site.js';

export const GET: APIRoute = () => {
  const body = {
    name: site.name, alternateName: site.alt, url: site.url, role: 'Python Developer & AI Builder', location: 'Bangladesh', available: true,
    contact: { email: site.email, alternate: site.email2, github: site.github, x: site.x },
    skills: { languages: ['Python', 'Bash', 'C', 'TypeScript'], ml: ['PyTorch', 'TensorFlow', 'scikit-learn', 'Hugging Face'], backend: ['FastAPI', 'Supabase', 'Firebase', 'Docker'], web: ['Next.js', 'Three.js'], os: 'Arch Linux' },
    github: { contributionsLastYear: gh.total, publicRepositories: gh.repos, followers: gh.followers, snapshot: gh.updated, repositories: gh.list },
    faq,
  };
  return new Response(JSON.stringify(body, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
