// @ts-check
import mdx from '@astrojs/mdx'
import { unified } from '@astrojs/markdown-remark'
import react from '@astrojs/react'
import { agentMarkdown } from '@seo/astro'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'
import rehypeCodeFrame from './scripts/rehype-code-frame.mjs'
import { llmsTxt } from './llms.config.mjs'

export default defineConfig({
  site: process.env.SITE_URL ?? 'https://seoskill.dev',
  output: 'static',
  trailingSlash: 'never',
  markdown: {
    syntaxHighlight: false,
    processor: unified({ rehypePlugins: [rehypeCodeFrame] }),
  },
  integrations: [mdx(), react(), agentMarkdown({ llmsTxt })],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': new URL('./src', import.meta.url).pathname,
      },
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
      ],
    },
  },
})
