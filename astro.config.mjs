// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { downloadAdminApi } from './download-admin-api.mjs';

export default defineConfig({
  site: 'https://mydownload.co.kr',
  trailingSlash: 'always',
  compressHTML: true,
  build: {
    inlineStylesheets: 'always',
  },
  integrations: [
    downloadAdminApi(),
    sitemap({
      filter: (page) => !page.includes('/admin') && !page.includes('/p/'),
    }),
  ],
});
