# Rakib Ul Hasan Rabin (RuHRabin) – Portfolio Website

This is the source code of my personal portfolio, **[ruhrbin.site](https://ruhrbin.site)**. I'm a Python developer and AI builder from Bangladesh, and I like understanding how computers work at the lowest level. The site is a dual-boot **Arch Linux / macOS style portfolio** with a real-time **3D space scene** (Three.js), a live **GitHub activity** section, a tiny AI assistant and even a small game on the 404 page.

I built it with [Astro](https://astro.build), so it ships as fast static HTML with a small amount of JavaScript, and it deploys to **GitHub Pages** with GitHub Actions.

Live site: https://ruhrbin.site · GitHub: [@RuHRabin](https://github.com/RuHRabin) · X: [@RuHRabin](https://x.com/RuHRabin)

## What's inside

- **Two desktop skins.** Switch between a Linux (Arch) look and a macOS look. The window buttons really close, minimize and maximize.
- **3D scroll scene.** You fly from Earth orbit, past the Moon, to a black hole while you scroll. It's all generated in code, with no texture downloads.
- **Cinematic loader.** A galaxy turns into my wordmark while the page loads, then jumps to hyperspace.
- **Live GitHub section.** Real repositories, activity and a contribution heatmap drawn in ASCII.
- **SIG, a visitor assistant.** It answers from the FAQ, and can use a free AI model through a Cloudflare Worker.
- **Generative music and sound effects.** Made with WebAudio, no audio files needed.
- **Command palette.** Press `Ctrl/⌘ + K` or `/`.
- **404 page with a game.** *Signal Run*: fly a ship through an asteroid field and collect rings.

## Tech stack

Astro 7, JavaScript, Three.js, Lenis (smooth scrolling), WebAudio, Cloudflare Workers (optional), GitHub Actions and GitHub Pages. Fonts (Geist and JetBrains Mono) are self-hosted through `@fontsource`.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # fetches my GitHub activity, then builds ./dist
npm run preview    # serves the production build
```

## SEO and discoverability

I tried to make the site easy for both search engines and AI answer engines to understand:

- Clean semantic HTML with one `h1`, a canonical URL, a meta description and Open Graph / Twitter cards.
- **JSON-LD** structured data (`Person`, `WebSite`, `ProfilePage`) built from `src/data/site.js`.
- Auto-generated `sitemap-index.xml` (through `@astrojs/sitemap`) and a `robots.txt` that allows search and AI crawlers.
- **`/llms.txt`, `/llms-full.txt` and `/profile.json`** generated at build time, so AI assistants can read a plain summary of who I am and what I've built.
- Web app manifest, favicons and a 1200×630 social preview image.
- Fast by default: static HTML, self-hosted fonts with preload, and the heavy 3D code loads as a separate chunk.

To change the site's text, title or description, edit `src/data/site.js`. It also feeds the FAQ, the JSON-LD, `llms.txt` and the assistant.

## Deploy to GitHub Pages

1. Put this project in the repo that serves your site (mine is `RuHRabin/ruhrabin.github.io`), on the `main` branch.
2. Go to Settings → Pages and set **Source: GitHub Actions**. `public/CNAME` already contains `ruhrbin.site`.
3. Push to `main`. `.github/workflows/deploy.yml` builds and deploys the site. It also rebuilds every day so the GitHub heatmap stays current.

If you host at `https://<user>.github.io/<repo>/` instead of a custom domain, build with `BASE=/<repo>/ SITE=https://<user>.github.io`.

## The 3D scene and loader

- `src/scripts/scene3d.js` is the Three.js scene: a noise-based Earth, a baked Milky Way, instanced stars, a cratered asteroid, a cratered Moon and a black hole. Your scroll position flies the camera. It's a separate chunk (about 146 kB gzipped) that downloads while the loader runs.
- `src/scripts/bootfx.js` draws the loader. It runs in a Web Worker on an OffscreenCanvas, so it stays smooth while the main thread is busy, and it falls back to the main thread if workers aren't available. `boot.js` controls it: progress, sound, skip (`Esc` / `Enter`) and the hand-off to the 3D scene.
- Visitors with reduced motion, Save-Data or no WebGL2 automatically get a lighter 2D space background (`space.js`). The same happens if a shader fails to compile.
- Smooth scrolling comes from Lenis (`smooth.js`). Add `?nojump` to the URL to skip the intro jump while developing.
- The asteroid (`makeRock`) and the Moon (`bakeMoon`) are generated once at load. If frames run slow, the pixel ratio and bloom drop automatically.

## Live GitHub section

- At build time, `scripts/fetch-github.mjs` saves my real contribution calendar, repositories and counts to `src/data/github.json`.
- In the browser, `src/scripts/live.js` refreshes profile, repositories and latest activity from the public GitHub API (cached for 10 minutes). The contribution calendar comes from my own worker (`PUBLIC_GH_ENDPOINT`, see `worker/github-worker.js`) or a public community API. If anything fails, the page keeps the build snapshot and the badge says SNAPSHOT instead of LIVE.

## SIG, the assistant

SIG answers from the FAQ on its own. To turn on a real AI model for free:

1. Run `cd worker && npx wrangler deploy` (Cloudflare Workers AI, free tier, no API key in the browser).
2. Edit `ALLOW` in `worker/sig-worker.js` if your domain is different, and add a Cloudflare rate-limit rule.
3. In GitHub go to Settings → Secrets and variables → Actions → **Variables** and set `PUBLIC_SIG_ENDPOINT` to your worker URL. Then redeploy.

If the endpoint can't be reached, SIG quietly goes back to the local answers.

## Music and sound

Turning sound on starts a generative score (`src/scripts/music.js`) that follows your scroll: a slow A-minor opening above the Earth, a brighter D-lydian mood near the Moon, and a darker D-minor mood with a low pulse near the black hole. The arpeggio gets busier when you scroll faster. Use `music on|off` and `volume 0-100` in the terminal or the command palette.

To use a fixed track instead, put an MP3 in `public/audio/` and list it under `"music"` in `manifest.json`. You can also swap the synthesized sound effects for real recordings. See `public/audio/README.md`.

## Editing the site

- Text and links: `src/data/site.js`
- Sections: `src/components/*.astro`
- Behavior: `src/scripts/*.js`
- Colors and sizes: the top of `src/styles/global.css`
- 404 page and game: `src/pages/404.astro`

## Checking performance

Run Lighthouse against the production build, not `npm run dev`. The dev server sends every module unminified (about 3 MB, 1.7 MB of it Three.js) and without compression, which gives a misleading slow result.

```bash
npm run build
npm run preview   # then run Lighthouse on http://localhost:4321
```

On a machine without a GPU (CI or headless Chrome) the WebGL scene is drawn on the CPU, so Total Blocking Time looks much worse than it is for real visitors. Judge it on a real device.

## License

See the [LICENSE](LICENSE) file.
