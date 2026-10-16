// @ts-check
import mdx from '@astrojs/mdx'
import { unified } from '@astrojs/markdown-remark'
import { agentMarkdown } from '@iannuttall/seo-graph-astro'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'
import rehypeCodeFrame from './scripts/rehype-code-frame.mjs'
import rehypeRelativeLinks from './scripts/rehype-relative-links.mjs'
import { llmsTxt } from './llms.config.mjs'
import { ogImages } from './src/lib/og-images.ts'

export default defineConfig({
  site: process.env.SITE_URL ?? 'https://seoskill.dev',
  output: 'static',
  trailingSlash: 'never',
  markdown: {
    syntaxHighlight: false,
    processor: unified({ rehypePlugins: [rehypeRelativeLinks, rehypeCodeFrame] }),
  },
  integrations: [
    mdx(),
    ogImages(),
    agentMarkdown({
      llmsTxt,
      cloudflareHeaders: false,
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': new URL('./src', import.meta.url).pathname,
      },
    },
  },
})
