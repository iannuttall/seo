// @ts-check
import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'

export default defineConfig({
  site: process.env.SITE_URL ?? 'https://seoskills.dev',
  output: 'static',
  trailingSlash: 'never',
  integrations: [
    starlight({
      title: 'SEO Skills',
      description:
        'Technical SEO skills for AI agents. One local CLI for agents, developers, and CI.',
      favicon: '/favicon.svg',
      logo: {
        src: './src/assets/logo.svg',
        alt: 'SEO Skills CLI',
      },
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/iannuttall/seo',
        },
      ],
      sidebar: [
        { label: 'Documentation', slug: 'docs' },
        { label: 'Getting started', slug: 'docs/getting-started' },
        { label: 'CLI guide', slug: 'docs/cli' },
        { label: 'Crawler', slug: 'docs/crawler' },
        { label: 'Reports and data', slug: 'docs/reports' },
        { label: 'Agents and MCP', slug: 'docs/agents' },
        { label: 'AI search evidence', slug: 'docs/ai-search' },
      ],
      customCss: ['./src/styles/starlight.css'],
      head: [
        {
          tag: 'link',
          attrs: {
            rel: 'icon',
            href: '/favicon-96.png',
            type: 'image/png',
            sizes: '96x96',
          },
        },
        {
          tag: 'link',
          attrs: { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        },
        {
          tag: 'link',
          attrs: {
            rel: 'preload',
            href: '/fonts/inter-variable.woff2',
            as: 'font',
            type: 'font/woff2',
            crossorigin: 'anonymous',
          },
        },
        {
          tag: 'link',
          attrs: {
            rel: 'preload',
            href: '/fonts/jetbrains-mono-variable.woff2',
            as: 'font',
            type: 'font/woff2',
            crossorigin: 'anonymous',
          },
        },
        {
          tag: 'link',
          attrs: {
            rel: 'preload',
            href: '/fonts/departure-mono.woff2',
            as: 'font',
            type: 'font/woff2',
            crossorigin: 'anonymous',
          },
        },
        {
          tag: 'meta',
          attrs: { property: 'og:image', content: 'https://seoskills.dev/og.png' },
        },
        {
          tag: 'meta',
          attrs: { name: 'twitter:card', content: 'summary_large_image' },
        },
        {
          tag: 'script',
          attrs: { type: 'application/ld+json' },
          content: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'seo',
            alternateName: ['SEO Skills', 'SEO Skills CLI'],
            applicationCategory: 'DeveloperApplication',
            operatingSystem: 'Linux, macOS, Windows',
            url: 'https://seoskills.dev',
            downloadUrl: 'https://www.npmjs.com/package/seo',
            codeRepository: 'https://github.com/iannuttall/seo',
            license: 'https://www.apache.org/licenses/LICENSE-2.0',
            isAccessibleForFree: true,
          }),
        },
      ],
      disable404Route: true,
    }),
  ],
  vite: {
    resolve: {
      alias: {
        '@': new URL('./src', import.meta.url).pathname,
      },
    },
  },
})
