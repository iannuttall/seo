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
          [
            'Cached data',
            `${formatBytes(stats.logicalSizeBytes)} of ${formatBytes(stats.maxSizeBytes)} automatic limit`,
          ],
          ['Sites', String(stats.counts.sites ?? 0)],
          ['Search Console', String(stats.counts.gsc_cache ?? 0)],
          [
            'Google Analytics',
            String(stats.counts.google_analytics_cache ?? 0),
          ],
          ['Semrush', String(stats.counts.semrush_cache ?? 0)],
          ['HTTP', String(stats.counts.http_cache ?? 0)],
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
          description:
            'Optional cache provider: gsc, google-analytics, semrush, or http',
        },
      },
      run: async ({ args }) => {
        const removed = clearCache(
          args.provider as
            | 'gsc'
            | 'google-analytics'
            | 'semrush'
            | 'http'
            | undefined,
        )
        process.stdout.write(`Removed ${removed} cached rows.\n`)
      },
    }),
  },
})
