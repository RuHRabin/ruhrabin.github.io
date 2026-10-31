import { defineConfig } from 'vite';
import fs from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const profilePath = root + 'src/data/profile.json';
const load = (f) => import(pathToFileURL(root + f).href + '?t=' + Date.now());
const readProfile = () => JSON.parse(fs.readFileSync(profilePath, 'utf8'));
const today = () => new Date().toISOString().slice(0, 10);

// Renders src/template.js + src/seo.js + profile.json into index.html, and emits
// sitemap.xml, robots.txt, llms.txt, llms-full.txt, site.webmanifest at build time.
function signalHtml() {
  return {
    name: 'signal-html',
    transformIndexHtml: {
      order: 'pre',
      async handler(html) {
        const profile = readProfile();
        const { renderPage } = await load('src/template.js');
        const { renderHead } = await load('src/seo.js');
        return html.replace('<!--SEO-->', renderHead(profile, today())).replace('<!--APP-->', renderPage(profile));
      }
    },
    async generateBundle() {
      const p = readProfile();
      const s = await load('src/seo.js');
      const out = {
        'sitemap.xml': s.renderSitemap(p, today()),
        'robots.txt': s.renderRobots(p),
        'llms.txt': s.renderLlms(p),
        'llms-full.txt': s.renderLlmsFull(p),
        'site.webmanifest': s.renderManifest(p)
      };
      for (const [fileName, source] of Object.entries(out)) this.emitFile({ type: 'asset', fileName, source });
    },
    handleHotUpdate({ file, server }) {
      if (/profile\.json$|template\.js$|seo\.js$/.test(file)) {
        server.ws.send({ type: 'full-reload' });
        return [];
      }
    }
  };
}

// Inlines the (small) CSS into index.html: removes one render-blocking request => faster first paint.
function inlineCss() {
  return {
    name: 'signal-inline-css',
    enforce: 'post',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle) return html;
        let out = html;
        // preload the lazy chunks needed right after boot (scroll/ascii) so they download in parallel, not in a chain
        const pre = Object.values(ctx.bundle)
          .filter((c) => c.type === 'chunk' && !c.isEntry && !/assets\/(chat|terminal|profile)/.test(c.fileName))
          .map((c) => `<link rel="modulepreload" crossorigin href="/${c.fileName}">`).join('');
        out = out.replace('</head>', pre + '</head>');
        for (const [name, asset] of Object.entries(ctx.bundle)) {
          if (!name.endsWith('.css') || asset.type !== 'asset') continue;
          const re = new RegExp(`<link[^>]*href="[^"]*${name.split('/').pop().replace('.', '\\.')}"[^>]*>`);
          if (re.test(out)) { out = out.replace(re, () => `<style>${asset.source}</style>`); delete ctx.bundle[name]; }
        }
        return out;
      }
    }
  };
}

export default defineConfig({
  // Custom domain (ruhrbin.site) => served from root. If you ever use
  // username.github.io/repo instead, set base to '/repo/'.
  base: '/',
  plugins: [signalHtml(), inlineCss()],
  build: { target: 'es2020', sourcemap: false, cssCodeSplit: false }
});
