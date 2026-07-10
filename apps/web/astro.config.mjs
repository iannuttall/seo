// @ts-check
import { defineConfig } from 'astro/config'

export default defineConfig({
  site: process.env.SITE_URL ?? 'https://seoskills.dev',
  output: 'static',
  trailingSlash: 'never',
  vite: {
    resolve: {
      alias: {
        '@': new URL('./src', import.meta.url).pathname,
      },
    },
  },
})
