import { clearCache, getCacheStats } from '@seo/core'
import { defineCommand } from 'citty'
import { formatBytes, printKeyValue } from '../utils.js'

export const cacheCommand = defineCommand({
  meta: { name: 'cache', description: 'Cache helpers' },
  subCommands: {
    stats: defineCommand({
      meta: {
        name: 'stats',
        description: 'Show local cache size and row counts',
      },
      run: async () => {
        const stats = getCacheStats()
        printKeyValue([
          ['DB', stats.dbPath],
          ['Size', formatBytes(stats.sizeBytes)],
          ['sites', String(stats.counts.sites ?? 0)],
          ['gsc_cache', String(stats.counts.gsc_cache ?? 0)],
          ['semrush_cache', String(stats.counts.semrush_cache ?? 0)],
          ['http_cache', String(stats.counts.http_cache ?? 0)],
        ])
      },
    }),
    clear: defineCommand({
      meta: {
        name: 'clear',
        description: 'Clear cached API and HTTP data',
      },
      args: {
        provider: {
          type: 'string',
          description: 'Optional cache provider: gsc, semrush, or http',
        },
      },
      run: async ({ args }) => {
        const removed = clearCache(
          args.provider as 'gsc' | 'semrush' | 'http' | undefined,
        )
        process.stdout.write(`Removed ${removed} cached rows.\n`)
      },
    }),
  },
})
