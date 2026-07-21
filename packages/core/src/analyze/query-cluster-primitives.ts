import { jaccard, tokenize } from './shared.js'

const CLUSTER_THRESHOLD = 0.5
const MAX_TOKEN_BUCKET = 250
const MAX_TOKEN_SHARE = 0.08
const IGNORED_CLUSTER_TOKENS = new Set([
  'and',
  'are',
  'best',
  'can',
  'for',
  'from',
  'how',
  'near',
  'the',
  'to',
  'vs',
  'what',
  'when',
  'where',
  'with',
  'your',
])

export type QueryClusterRow = {
  query: string
  impressions: number
  clicks: number
  position: number
  tokens: string[]
  pages: QueryClusterPage[]
}

export type QueryClusterPage = {
  url: string
  impressions: number
  clicks: number
}

export function compareQueryClusterText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function queryClusterTokens(query: string): string[] {
  return tokenize(query).filter((token) => !IGNORED_CLUSTER_TOKENS.has(token))
}

export function aggregateQueryClusterRows(
  rows: Iterable<{
    query: string
    impressions: number
    clicks: number
    position: number
    tokens: string[]
    page: string
  }>,
): QueryClusterRow[] {
  const byQuery = new Map<
    string,
    {
      query: string
      impressions: number
      clicks: number
      weightedPosition: number
      tokens: Set<string>
      pages: Map<string, QueryClusterPage>
    }
  >()
  for (const row of rows) {
    const current = byQuery.get(row.query) ?? {
      query: row.query,
      impressions: 0,
      clicks: 0,
      weightedPosition: 0,
      tokens: new Set<string>(),
      pages: new Map<string, QueryClusterPage>(),
    }
    current.impressions += row.impressions
    current.clicks += row.clicks
    current.weightedPosition += row.position * row.impressions
    for (const token of row.tokens) current.tokens.add(token)
    const page = current.pages.get(row.page) ?? {
      url: row.page,
      impressions: 0,
      clicks: 0,
    }
    page.impressions += row.impressions
    page.clicks += row.clicks
    if (page.url) current.pages.set(page.url, page)
    byQuery.set(row.query, current)
  }
  return [...byQuery.values()]
    .map((row) => ({
      query: row.query,
      impressions: row.impressions,
      clicks: row.clicks,
      position: row.impressions ? row.weightedPosition / row.impressions : 0,
      tokens: [...row.tokens].sort(),
      pages: [...row.pages.values()].sort(
        (a, b) =>
          b.impressions - a.impressions ||
          compareQueryClusterText(a.url, b.url),
      ),
    }))
    .sort(
      (a, b) =>
        b.impressions - a.impressions ||
        compareQueryClusterText(a.query, b.query),
    )
}

export function clusterQueryRows(rows: QueryClusterRow[]): QueryClusterRow[][] {
  return [...iterateQueryClusters(rows)]
}

export function* iterateQueryClusters(
  rows: QueryClusterRow[],
): Generator<QueryClusterRow[]> {
  if (rows.length <= 1) {
    for (const row of rows) yield [row]
    return
  }

  const normalizedRows = rows.map((row) => ({
    ...row,
    tokens: queryClusterTokens(row.query),
  }))

  const tokenBuckets = new Map<string, number[]>()
  for (const [index, row] of normalizedRows.entries()) {
    for (const token of row.tokens) {
      const bucket = tokenBuckets.get(token) ?? []
      bucket.push(index)
      tokenBuckets.set(token, bucket)
    }
  }

  const maxBucketSize = Math.max(
    20,
    Math.min(MAX_TOKEN_BUCKET, Math.floor(rows.length * MAX_TOKEN_SHARE)),
  )

  const assigned = new Set<number>()
  const seedIds = normalizedRows
    .map((row, index) => ({
      index,
      impressions: row.impressions,
      query: row.query,
    }))
    .sort(
      (a, b) =>
        b.impressions - a.impressions ||
        compareQueryClusterText(a.query, b.query),
    )

  for (const seed of seedIds) {
    if (assigned.has(seed.index)) continue
    const seedRow = normalizedRows[seed.index]
    if (!seedRow) continue
    const candidateIds = new Set<number>()
    for (const token of seedRow.tokens) {
      const bucket = tokenBuckets.get(token)
      if (!bucket || bucket.length > maxBucketSize) continue
      for (const candidateId of bucket) {
        if (candidateId !== seed.index && !assigned.has(candidateId)) {
          candidateIds.add(candidateId)
        }
      }
    }

    const group = [seedRow]
    assigned.add(seed.index)
    const sortedCandidateIds = [...candidateIds].sort((left, right) => {
      const leftRow = normalizedRows[left]
      const rightRow = normalizedRows[right]
      if (!leftRow || !rightRow) return left - right
      return (
        rightRow.impressions - leftRow.impressions ||
        compareQueryClusterText(leftRow.query, rightRow.query)
      )
    })
    for (const candidateId of sortedCandidateIds) {
      const candidate = normalizedRows[candidateId]
      if (!candidate) continue
      if (jaccard(seedRow.tokens, candidate.tokens) >= CLUSTER_THRESHOLD) {
        group.push(candidate)
        assigned.add(candidateId)
      }
    }
    yield group
  }
}
