// @ts-check
import { agentMarkdown } from '@iannuttall/seo-graph-astro'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'
import ogImages from './src/integrations/og-images.ts'
import sitemaps from './src/integrations/sitemaps.ts'
import { llmsTxt } from './llms.config.mjs'
import config from './site.config.json' with { type: 'json' }

// Static HTML on Cloudflare Workers static assets. Every URL has one form:
// no trailing slash, served from `page.html`.
export default defineConfig({
  site: `https://${config.domain}`,
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
  devToolbar: { enabled: false },
  integrations: [
    // A Markdown copy of every page, llms.txt and agent-routes.json.
    agentMarkdown({ llmsTxt, routeMigrationWarnings: false }),
    // These two read the finished HTML, so they run last.
    ogImages(),
    sitemaps(),
  ],
  vite: {
    // Tailwind 4. The theme is src/styles/globals.css.
    plugins: [tailwindcss()],
    // Orb and tunnel previews use generated hostnames.
    server: { allowedHosts: true },
  },
})
