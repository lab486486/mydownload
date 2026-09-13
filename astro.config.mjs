// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { downloadAdminApi } from './download-admin-api.mjs';

export default defineConfig({
  site: 'https://mydownload.co.kr',
  trailingSlash: 'always',
  integrations: [
    downloadAdminApi(),
    sitemap({
      filter: (page) => !page.includes('/admin'),
    }),
  ],
});
