# rabin.ruhrbin.site

Personal portfolio: a fast, plain, fully indexable page, with an optional interactive 3D black-hole view
(each public GitHub repository is a body in orbit).

## How it works

- **The plain page is the default.** Everything a visitor or crawler needs is real HTML from the first byte:
  about, projects, FAQ, contact, structured data. No JavaScript is needed to read it.
- **3D is opt-in.** The "Enter 3D" button loads about 125 KB (three.js + shader) on request. The choice is remembered,
  and a returning 3D user gets 3D again. The instruments and KaTeX load only when scrolled near.
- **Built at deploy time.** `src/` is the source; `npm run build` writes `index.html`, `projects/**`, `assets/**`,
  `robots.txt`, `sitemap.xml`, `llms.txt` and `404.html` into the repo root (what GitHub Pages serves).
  The project list, JSON-LD, sitemap dates and `llms.txt` are rendered from `data/github-sync.json`.
- **Automation** (`.github/workflows/sync-github-data.yml`): every 3 hours, on pushes that touch sources, and on
  demand, it fetches GitHub data, builds, validates (`npm test`, 339 checks) and commits. A failing validation publishes nothing.

You never need Node locally: edit files in `src/`, push, and the workflow builds and commits the result.

## Design system

All design lives in `src/css/style.css` (the instruments' styles too).

- **Tokens:** `--c-*` for the site (light and dark, both WCAG AA; follows the system setting, with a saved manual toggle).
  `--bg`, `--text`, `--cyan` ... are the fixed dark "scene" palette used by the instruments and the 3D view.
- **Type:** Source Serif 4 600 for headings (21 KB, self-hosted); system sans for text; system mono for code. Sentence case, no text under 12 px.
- **Standards enforced:** 44 px touch targets, visible 3 px focus rings, skip link, labelled landmarks, collapsible mobile menu,
  pause control for animation, reduced-motion and forced-colors support. `npm test` checks the structure; run an axe-core audit after big changes.
- **Two modes, one markup:** `.only-lite` shows on the standard page, `.only-3d` in the 3D view. 3D styles are scoped to `html:not(.list-view)`.

## Editing

| To change | Edit |
|---|---|
| Page text, headings, FAQ, About | `src/index.template.html` |
| Project blurbs (the six featured) | `FEATURED` in `src/js/data.js` |
| Short title phrases for project pages | `SHORT` in `scripts/build.mjs` |
| Site title / meta description / JSON-LD people data | `TITLE`, `DESC`, `person` in `scripts/build.mjs` (and the matching text in the template head) |
| Colors, type, spacing, components | tokens at the top of `src/css/style.css` |
| Sync GitHub account | `GH_USER` in the workflow and `OWNER` in `src/js/data.js` |

Local preview (optional): `npm install && npm run build && npx serve .`

## AI crawlers (`robots.txt`)

Search and answer-engine bots (Googlebot, Bingbot, OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User,
PerplexityBot, Applebot) are explicitly allowed: that is what lets the site be found and cited.
Training crawlers (GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, CCBot, meta-externalagent) are also allowed by default.
To opt out of **training only**, change `Allow: /` to `Disallow: /` under those names in `scripts/build.mjs`
(search and citations are unaffected). `llms.txt` is included because it is harmless, but Google states it does not use it
and studies find no citation lift; the things that matter are crawlable content, structured data and speed.

## Once, after the first deploy

1. GitHub repo > Settings > Pages: confirm the custom domain and tick **Enforce HTTPS**.
2. [Google Search Console](https://search.google.com/search-console): add `https://rabin.ruhrbin.site`, submit `sitemap.xml`,
   and use URL Inspection > Request indexing for `/` and `/projects/`.
3. [Bing Webmaster Tools](https://www.bing.com/webmasters): import from Search Console (this also feeds Copilot and ChatGPT search, which use Bing data).
4. Link back to the site from places you control: GitHub profile "Website", each repository's "Website" field
   (use the project page URL, e.g. `https://rabin.ruhrbin.site/projects/sol-mesh/`), X and Facebook bios.
5. Write a real description and topics on every GitHub repository: they flow into the project pages and structured data automatically.
6. Validate once: [Rich Results Test](https://search.google.com/test/rich-results) and [validator.schema.org](https://validator.schema.org) on `/` and a project page.
