import { SeoError } from '../errors.js'
import type { BingWebmasterClient } from './client.js'
import { createBingWebmasterClient } from './credentials.js'

type Section<T> =
  | { status: 'complete'; data: T }
  | { status: 'partial'; data: T; warning: string }
  | { status: 'unavailable'; warning: string }

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function range(rows: Array<{ date: string }>) {
  return rows.length
    ? { startDate: rows[0]?.date ?? '', endDate: rows.at(-1)?.date ?? '' }
    : undefined
}

async function section<T extends { invalidRows: number; capped: boolean }>(
  work: () => Promise<T>,
): Promise<Section<T>> {
  try {
    const data = await work()
    const reasons = [
      ...(data.invalidRows
        ? [`${data.invalidRows} invalid provider rows were excluded.`]
        : []),
      ...(data.capped
        ? ['The provider response exceeded the 400-row limit.']
        : []),
    ]
    return reasons.length
      ? { status: 'partial', data, warning: reasons.join(' ') }
      : { status: 'complete', data }
  } catch (error) {
    if (
      error instanceof SeoError &&
      (error.code === 'AUTH_REQUIRED' || error.code === 'ACCESS_DENIED')
    ) {
      throw error
    }
    return { status: 'unavailable', warning: message(error) }
  }
}

export async function bingWebmasterOverview(input: {
  site: string
  client?: BingWebmasterClient
  credentialSource?: 'environment' | 'keychain' | 'file'
}) {
  if (!input.site.trim()) {
    throw new SeoError('INVALID_INPUT', 'Pass a Bing Webmaster site URL.')
  }
  const resolved = input.client
    ? {
        client: input.client,
        credentialSource: input.credentialSource ?? ('environment' as const),
      }
    : await createBingWebmasterClient()
  const observedAt = new Date().toISOString()
  const [traffic, crawl] = await Promise.all([
    section(() => resolved.client.getTraffic(input.site)),
    section(() => resolved.client.getCrawlStats(input.site)),
  ])
  const statuses = [traffic.status, crawl.status]
  const dataStatus = statuses.every((status) => status === 'complete')
    ? 'complete'
    : statuses.every((status) => status === 'unavailable')
      ? 'unavailable'
      : 'partial'

  return {
    schemaVersion: 1 as const,
    site: input.site,
    generatedAt: observedAt,
    dataStatus,
    provenance: {
      provider: 'bing-webmaster' as const,
      authentication: resolved.client.authentication,
      credentialSource: resolved.credentialSource,
      observedAt,
      cached: false as const,
      rowLimit: 400,
      methods: ['GetRankAndTrafficStats', 'GetCrawlStats'],
    },
    traffic:
      traffic.status === 'unavailable'
        ? traffic
        : {
            ...traffic,
            data: {
              ...traffic.data,
              range: range(traffic.data.rows),
              clicks: traffic.data.rows.reduce(
                (total, row) => total + row.clicks,
                0,
              ),
              impressions: traffic.data.rows.reduce(
                (total, row) => total + row.impressions,
                0,
              ),
            },
          },
    crawl:
      crawl.status === 'unavailable'
        ? crawl
        : {
            ...crawl,
            data: {
              ...crawl.data,
              range: range(crawl.data.rows),
              latest: crawl.data.rows.at(-1),
            },
          },
    caveats: [
      'Bing reports its own observed search and crawl evidence. It is not a complete view of every search engine.',
      'The inIndex field is provider-reported crawl statistics, not independent proof that a URL is indexed.',
    ],
  }
}
