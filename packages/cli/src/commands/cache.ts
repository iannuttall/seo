import { clearCache, getCacheStats, SeoError } from '@seo/core'
import { defineCommand } from 'citty'
import { formatBytes, printKeyValue } from '../utils.js'

const CACHE_PROVIDERS = [
  'gsc',
  'google-analytics',
  'semrush',
  'dataforseo',
  'http',
] as const

function cacheProvider(
  value: unknown,
): (typeof CACHE_PROVIDERS)[number] | undefined {
  if (value === undefined) return undefined
  if (
    typeof value === 'string' &&
    CACHE_PROVIDERS.includes(value as (typeof CACHE_PROVIDERS)[number])
  ) {
    return value as (typeof CACHE_PROVIDERS)[number]
  }
  throw new SeoError(
    'INVALID_INPUT',
    `--provider must be one of: ${CACHE_PROVIDERS.join(', ')}.`,
  )
}

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
          ['DataForSEO', String(stats.counts.provider_cache ?? 0)],
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
            'Optional cache provider: gsc, google-analytics, semrush, dataforseo, or http',
        },
      },
      run: async ({ args }) => {
        const removed = clearCache(cacheProvider(args.provider))
        process.stdout.write(`Removed ${removed} cached rows.\n`)
      },
    }),
  },
})
