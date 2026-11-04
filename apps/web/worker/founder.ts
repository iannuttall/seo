import { readJson } from '@seo/core/hosted'
import { founder } from '../src/lib/site.ts'

// Ian's follower counts for the founder badge and the About page. The daily
// cron reads X through api.fxtwitter.com and YouTube through the JSON its
// channel page loads (YouTube's own web API, no key, rounded by YouTube to
// three figures). LinkedIn has no public count, so it stays as read by hand
// in site.ts, and so does any network with no good reading yet.

export type FounderNetwork = 'x' | 'youtube'

export type FounderCounts = {
  x: number
  youtube: number
  linkedin: number
  updatedAt: string
}

type Stored = Partial<Record<FounderNetwork, { count: number; at: string }>>

type Fetcher = typeof fetch

const BUILD_COUNTS: Record<FounderNetwork, number> = {
  x: founder.x.followers,
  youtube: founder.youtube.subscribers,
}

/**
 * A new count replaces the last good one only when it is a whole number
 * above zero and has not fallen by more than half, so a broken or blocked
 * read never shows on the site. A real fall that large needs a hand update
 * in site.ts and a cleared row.
 */
export function plausibleCount(
  next: number | null,
  previous: number,
): next is number {
  return (
    typeof next === 'number' &&
    Number.isSafeInteger(next) &&
    next > 0 &&
    next >= previous / 2
  )
}

async function readX(fetcher: Fetcher): Promise<number | null> {
  const handle = new URL(founder.x.url).pathname.slice(1)
  // fxtwitter answers 401 to a request with no user agent, and a Worker's
  // fetch sends none.
  const response = await fetcher(`https://api.fxtwitter.com/${handle}`, {
    headers: { 'user-agent': 'SEO-Skill-Site/1.0 (+https://seoskill.dev)' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) return null
  const json = await readJson<{ user?: { followers?: unknown } }>(
    response,
    'fxtwitter',
    { maxBytes: 200_000 },
  )
  const followers = json.user?.followers
  return typeof followers === 'number' ? followers : null
}

// "16.9K subscribers" reads as 16900.
export function subscriberCount(text: string): number | null {
  const match = /^([\d.,]+)\s*([KMB]?)\s+subscribers?$/i.exec(text.trim())
  if (!match?.[1]) return null
  const value = Number(match[1].replaceAll(',', ''))
  const scale = { '': 1, K: 1e3, M: 1e6, B: 1e9 }[
    (match[2] ?? '').toUpperCase() as '' | 'K' | 'M' | 'B'
  ]
  return Number.isFinite(value) ? Math.round(value * scale) : null
}

// The subscriber line sits in the channel header's metadata rows. Searching
// the header for it, a few levels at most, survives small layout changes.
function findSubscribers(value: unknown, depth = 0): number | null {
  if (typeof value === 'string') return subscriberCount(value)
  if (depth > 16 || typeof value !== 'object' || value === null) return null
  for (const child of Object.values(value)) {
    const found = findSubscribers(child, depth + 1)
    if (found !== null) return found
  }
  return null
}

async function readYouTube(fetcher: Fetcher): Promise<number | null> {
  const response = await fetcher(
    'https://www.youtube.com/youtubei/v1/browse?prettyPrint=false',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20251101.00.00',
            hl: 'en',
            gl: 'US',
          },
        },
        browseId: founder.youtube.channelId,
      }),
      signal: AbortSignal.timeout(10_000),
    },
  )
  if (!response.ok) return null
  const json = await readJson<{ header?: unknown }>(response, 'YouTube', {
    maxBytes: 2_000_000,
  })
  return findSubscribers(json.header)
}

async function storedCounts(db: D1Database): Promise<Stored> {
  const result = await db
    .prepare('SELECT network, count, checked_at FROM founder_counts')
    .all<{ network: string; count: number; checked_at: string }>()
  const stored: Stored = {}
  for (const row of result.results) {
    if (row.network === 'x' || row.network === 'youtube')
      stored[row.network] = { count: row.count, at: row.checked_at }
  }
  return stored
}

/** The counts the site shows: the last good reading, else site.ts. */
export async function founderCounts(db: D1Database): Promise<FounderCounts> {
  const stored = await storedCounts(db)
  const times = [stored.x?.at, stored.youtube?.at].filter((at): at is string =>
    Boolean(at),
  )
  return {
    x: stored.x?.count ?? BUILD_COUNTS.x,
    youtube: stored.youtube?.count ?? BUILD_COUNTS.youtube,
    linkedin: founder.linkedin.followers,
    updatedAt: times.sort().at(-1) ?? founder.asOf,
  }
}

/** Once a day: read each network and keep the counts that look real. */
export async function refreshFounderCounts(
  env: { TELEMETRY_DB: D1Database },
  now = new Date(),
  fetcher: Fetcher = fetch,
): Promise<void> {
  const stored = await storedCounts(env.TELEMETRY_DB)
  const reads: Record<FounderNetwork, number | null> = {
    x: await readX(fetcher).catch(() => null),
    youtube: await readYouTube(fetcher).catch(() => null),
  }
  const at = now.toISOString()
  const statements = (['x', 'youtube'] as const).flatMap((network) => {
    const next = reads[network]
    const previous = stored[network]?.count ?? BUILD_COUNTS[network]
    if (!plausibleCount(next, previous)) return []
    return [
      env.TELEMETRY_DB.prepare(
        `INSERT OR REPLACE INTO founder_counts (network, count, checked_at)
         VALUES (?1, ?2, ?3)`,
      ).bind(network, next, at),
    ]
  })
  if (statements.length > 0) await env.TELEMETRY_DB.batch(statements)
}
