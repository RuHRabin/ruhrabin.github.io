import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: process.env.SITE || 'https://ruhrbin.site',
  base: process.env.BASE || '/',
  integrations: [sitemap()],
  compressHTML: true,
  build: { inlineStylesheets: 'auto' },
  vite: { build: { sourcemap: true, target: ['edge88', 'firefox78', 'chrome87', 'safari14'] } },
  devToolbar: { enabled: false },
});
