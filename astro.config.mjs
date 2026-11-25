import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// we use a custom domain (see public/CNAME), so everything is served from the root.
// if you ever host at user.github.io/repo/ instead, build with BASE=/repo/ and SITE=https://user.github.io
export default defineConfig({
  site: process.env.SITE || 'https://ruhrbin.site',
  base: process.env.BASE || '/',
  integrations: [sitemap()],
  compressHTML: true,
  build: { inlineStylesheets: 'auto' },
  vite: { build: { sourcemap: true, target: ['edge88', 'firefox78', 'chrome87', 'safari14'] } },
  devToolbar: { enabled: false },
});
