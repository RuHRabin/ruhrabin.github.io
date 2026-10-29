// Build-time SEO / GEO helpers (run in Node by vite.config.js). All data from profile.json.
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = (s = '') => String(s).replace(/\*(.+?)\*/g, '$1').replace(/\|/g, ' ');

export const siteUrl = (p) => `https://${p.site.domain}`;
const handle = (p) => '@' + p.links.x.replace(/\/+$/, '').split('/').pop();

export function jsonLd(p, modified) {
  const url = siteUrl(p) + '/';
  const person = {
    '@type': 'Person',
    '@id': url + '#person',
    name: p.name,
    alternateName: p.seo.alsoKnownAs,
    url,
    image: url + 'og.png',
    jobTitle: p.seo.jobTitle,
    description: p.seo.summary,
    email: 'mailto:' + p.links.emails[0],
    sameAs: [p.links.github, p.links.x],
    knowsAbout: p.seo.knowsAbout,
    address: { '@type': 'PostalAddress', addressCountry: p.seo.countryCode },
    mainEntityOfPage: { '@id': url + '#profilepage' }
  };
  const website = {
    '@type': 'WebSite',
    '@id': url + '#website',
    url,
    name: p.name,
    description: p.site.description,
    inLanguage: p.site.lang || 'en',
    publisher: { '@id': url + '#person' }
  };
  const profilePage = {
    '@type': 'ProfilePage',
    '@id': url + '#profilepage',
    url,
    name: p.site.title,
    description: p.site.description,
    inLanguage: p.site.lang || 'en',
    dateModified: modified,
    isPartOf: { '@id': url + '#website' },
    about: { '@id': url + '#person' },
    mainEntity: { '@id': url + '#person' }
  };
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': [website, person, profilePage] });
}

export function renderHead(p, modified) {
  const url = siteUrl(p) + '/';
  const t = esc(p.site.title), d = esc(p.site.description), img = url + 'og.png';
  const tw = handle(p);
  return `
    <title>${t}</title>
    <meta name="description" content="${d}" />
    <meta name="author" content="${esc(p.name)}" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
    <link rel="canonical" href="${url}" />
    <meta name="theme-color" content="#0a0a09" />
    <meta name="color-scheme" content="dark" />
    ${p.site.googleVerification ? `<meta name="google-site-verification" content="${esc(p.site.googleVerification)}" />` : ''}
    ${p.site.bingVerification ? `<meta name="msvalidate.01" content="${esc(p.site.bingVerification)}" />` : ''}
    <meta name="geo.region" content="${esc(p.seo.countryCode)}" />
    <meta name="geo.placename" content="${esc(p.seo.country)}" />
    <meta property="og:type" content="profile" />
    <meta property="og:site_name" content="${esc(p.name)}" />
    <meta property="og:title" content="${t}" />
    <meta property="og:description" content="${d}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:image" content="${img}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${esc(p.name)} — ${esc(p.role)}. ASCII-style portfolio cover." />
    <meta property="profile:username" content="${esc(tw.slice(1))}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="${esc(tw)}" />
    <meta name="twitter:creator" content="${esc(tw)}" />
    <meta name="twitter:title" content="${t}" />
    <meta name="twitter:description" content="${d}" />
    <meta name="twitter:image" content="${img}" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="/icon-192.png" sizes="192x192" type="image/png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/site.webmanifest" />
    <link rel="me" href="${esc(p.links.github)}" />
    <link rel="me" href="${esc(p.links.x)}" />
    <link rel="alternate" type="text/plain" href="/llms.txt" title="LLM-readable summary" />
    <script type="application/ld+json">${jsonLd(p, modified).replace(/</g, '\\u003c')}</script>`;
}

// Explicitly welcome search + AI crawlers (GEO). Remove a block if you want to opt out of that bot.
const BOTS = ['Googlebot', 'Bingbot', 'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot', 'Applebot-Extended', 'CCBot', 'cohere-ai', 'Bytespider', 'DuckAssistBot', 'meta-externalagent'];
export function renderRobots(p) {
  return [
    '# Everyone is welcome: search engines and AI answer engines.',
    'User-agent: *', 'Allow: /', '',
    ...BOTS.flatMap((b) => [`User-agent: ${b}`, 'Allow: /', '']),
    `Sitemap: ${siteUrl(p)}/sitemap.xml`, ''
  ].join('\n');
}

export function renderSitemap(p, modified) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${siteUrl(p)}/</loc>
    <lastmod>${modified}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
    <image:image><image:loc>${siteUrl(p)}/og.png</image:loc><image:title>${esc(p.name)} — ${esc(p.role)}</image:title></image:image>
  </url>
</urlset>
`;
}

export function renderLlms(p) {
  const u = siteUrl(p);
  return `# ${p.name}

> ${p.seo.summary}

Role: ${p.role}
Location: ${p.location}
Status: ${p.status}
Website: ${u}/
Language: English

## Links
- [Website](${u}/): interactive portfolio, built with motion, sound and ASCII art
- [GitHub](${p.links.github}): all projects and source code (the work archive)
- [X / Twitter](${p.links.x}): updates and conversation
- [Full details](${u}/llms-full.txt): expanded plain-text profile

## Contact
${p.links.emails.map((e) => `- ${e}`).join('\n')}
`;
}

export function renderLlmsFull(p) {
  const u = siteUrl(p);
  return `# ${p.name} — full profile

${p.seo.summary}

## Facts
- Name: ${p.name} (also: ${p.seo.alsoKnownAs.join(', ')})
- Role: ${p.role}
- Based in: ${p.location}
- Availability: ${p.status}
- Website: ${u}/
- GitHub: ${p.links.github}
- X: ${p.links.x}
- Email: ${p.links.emails.join(', ')}

## What ${p.name} does
${p.channels.items.map((c) => `### ${c.title}\n${c.bullets.map((b) => `- ${b}`).join('\n')}`).join('\n\n')}

## Work
${plain(p.archive.headline)} ${p.archive.text}
${p.archive.url}
${(p.projects || []).map((x) => `- ${x.title}: ${x.text || ''} ${x.url}`).join('\n')}

## About
${p.about.bullets.map((b) => `- ${b}`).join('\n')}

${p.about.callout.label}: ${p.about.callout.text}

## Topics
${p.seo.knowsAbout.join(', ')}
`;
}

export function renderManifest(p) {
  return JSON.stringify({
    name: p.site.title, short_name: p.name, description: p.site.description, start_url: '/', display: 'standalone',
    background_color: '#0a0a09', theme_color: '#0a0a09',
    icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }]
  }, null, 2);
}
