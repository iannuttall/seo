import { countLabel } from '../phrasing.js'
import type { QueryCluster } from '../types.js'
import {
  createCtrBenchmarkContext,
  type PositionBenchmark,
} from './opportunity-primitives.js'
import { clusterPseoTemplates } from './pseo/templates.js'
import {
  clusterQueryRows,
  compareQueryClusterText,
  type QueryClusterPage,
  type QueryClusterRow,
} from './query-cluster-primitives.js'
import { tokenize } from './shared.js'

function quotedLabel(label: string): string {
  return label.includes('"') ? `'${label}'` : `"${label}"`
}

function classifyIntent(query: string, brand?: string): QueryCluster['intent'] {
  const tokens = new Set(tokenize(query))
  const brandTokens = brand ? tokenize(brand) : []
  if (brandTokens.length && brandTokens.every((token) => tokens.has(token))) {
    return 'navigational'
  }
  if (
    tokens.has('buy') ||
    tokens.has('price') ||
    (tokens.has('near') && tokens.has('me'))
  ) {
    return 'transactional'
  }
  if (
    ['vs', 'review', 'best', 'top', 'compare'].some((token) =>
      tokens.has(token),
    )
  ) {
    return 'commercial'
  }
  if (['how', 'what', 'why', 'guide'].some((token) => tokens.has(token))) {
    return 'informational'
  }
  return 'mixed'
}

function clusterTotals(cluster: Pick<QueryCluster, 'queries'>): {
  impressions: number
  clicks: number
  averagePosition: number
  ctr: number
} {
  const totals = cluster.queries.reduce(
    (sum, query) => ({
      impressions: sum.impressions + query.impressions,
      clicks: sum.clicks + query.clicks,
      weightedPosition:
        sum.weightedPosition + query.position * query.impressions,
    }),
    { impressions: 0, clicks: 0, weightedPosition: 0 },
  )
  return {
    impressions: totals.impressions,
    clicks: totals.clicks,
    averagePosition: totals.impressions
      ? totals.weightedPosition / totals.impressions
      : 0,
    ctr: totals.impressions ? totals.clicks / totals.impressions : 0,
  }
}

function opportunityScore(input: {
  queries: number
  impressions: number
  position: number
  estimatedClickLift?: number
}): number {
  if (input.queries <= 1 || input.impressions < 50) return 0
  return input.position > 10
    ? Number((input.impressions * 0.03).toFixed(2))
    : (input.estimatedClickLift ?? 0)
}

function clusterRecommendation(input: {
  label: string
  intent: QueryCluster['intent']
  queries: number
  impressions: number
  clicks: number
  position: number
  expectedCtr: number
  topPage?: QueryClusterPage
  template?: QueryCluster['template']
}): string {
  const clusterName = quotedLabel(input.label)
  if (
    input.template &&
    input.template.urlCount >= 3 &&
    input.template.share >= 0.6
  ) {
    const pageText =
      input.topPage && input.template.urlCount > 1
        ? ` Start with ${input.topPage.url}.`
        : ''
    const action =
      input.template.urlCount > 1
        ? `This is template-level demand, not a one-off page edit. Tighten the shared title/H1/intro/schema/internal-link rules so each page makes the entity and query angle clear. If ${clusterName} is broader than one entity, route it to a better hub/list page instead of letting several template URLs compete.`
        : 'Improve the shared title, H1, intro, schema, and internal-link pattern, then spot-check the highest-impression URL.'
    return `${clusterName} maps mostly to ${input.template.signature} (${input.template.urlCount} URLs). ${action}${pageText}`
  }
  if (input.queries === 1) {
    return input.topPage
      ? `This is a single-query cluster. Inspect ${input.topPage.url} before making a template or hub decision.`
      : 'This is a single-query cluster. Use it as supporting detail, not as a content hub or template decision by itself.'
  }
  if (input.impressions >= 500 && input.clicks === 0) {
    return input.topPage
      ? `This ${clusterName} cluster has search demand but no clicks. Check ${input.topPage.url}; if it is the right target, make the exact intent obvious in the title, H1, intro, and internal links.`
      : `This ${clusterName} cluster has search demand but no clicks. Check whether the ranking page actually answers the cluster intent, then improve the section/title or create a stronger dedicated page if intent is distinct.`
  }
  if (input.position > 10) {
    return input.topPage
      ? `This ${clusterName} cluster is mostly outside page one. Strengthen ${input.topPage.url} around this exact intent and add internal links from related pages before treating it as a CTR problem.`
      : `This ${clusterName} cluster is mostly outside page one. Tighten the page section around the shared intent and add internal links from related pages before treating this as a CTR problem.`
  }
  if (input.clicks / Math.max(1, input.impressions) < input.expectedCtr) {
    return `This ${clusterName} cluster ranks below its CTR benchmark. Review SERP framing around the dominant intent (${input.intent}) before expanding content.`
  }
  return `This ${clusterName} cluster already gets clicks. Use it to refine page structure, FAQs, and internal anchors rather than creating duplicate pages.`
}

function clusterSummary(input: {
  label: string
  queries: number
  impressions: number
  clicks: number
  position: number
}): string {
  return `${countLabel(input.queries, 'query', 'queries')}, ${countLabel(input.impressions, 'impression')}, ${countLabel(input.clicks, 'click')}, average position ${input.position.toFixed(1)}.`
}

function clusterLabel(
  rows: Array<{ query: string; impressions: number }>,
): string {
  return (
    [...rows].sort(
      (a, b) =>
        b.impressions - a.impressions ||
        compareQueryClusterText(a.query, b.query),
    )[0]?.query ?? ''
  )
}

function clusterPages(rows: QueryClusterRow[]): QueryClusterPage[] {
  const byPage = new Map<string, QueryClusterPage>()
  for (const row of rows) {
    for (const page of row.pages) {
      const current = byPage.get(page.url) ?? {
        url: page.url,
        impressions: 0,
        clicks: 0,
      }
      current.impressions += page.impressions
      current.clicks += page.clicks
      byPage.set(page.url, current)
    }
  }
  return [...byPage.values()].sort(
    (a, b) =>
      b.impressions - a.impressions || compareQueryClusterText(a.url, b.url),
  )
}

function clusterTemplate(pages: QueryClusterPage[]): QueryCluster['template'] {
  const urls = pages.map((page) => page.url)
  const [template] = clusterPseoTemplates(urls, {
    minUrls: 3,
    minShare: 0.6,
    limit: 1,
  })
  return template
    ? {
        signature: template.signature,
        urlCount: template.urlCount,
        share: template.share,
        sampleUrls: template.sampleUrls,
      }
    : undefined
}

function benchmarkDetails(benchmark: PositionBenchmark) {
  return {
    expectedCtr: benchmark.ctr,
    source: benchmark.source,
    peerRows: benchmark.rows,
    peerImpressions: benchmark.impressions,
    qualifiedPeerImpressions: benchmark.qualifiedImpressions,
    urlSamples: benchmark.urlSamples,
    positiveUrlSamples: benchmark.positiveUrlSamples,
  }
}

function boundedInteger(input: {
  value?: number
  fallback: number
  maximum?: number
}): number {
  const value = Number.isFinite(input.value)
    ? (input.value ?? 0)
    : input.fallback
  return Math.min(
    input.maximum ?? Number.POSITIVE_INFINITY,
    Math.max(1, Math.floor(value)),
  )
}

export function analyzeQueryClustersFromRows(input: {
  rows: QueryClusterRow[]
  brand?: string
  minImpressions?: number
  limit?: number
}): {
  clusters: QueryCluster[]
  totals: { queries: number; impressions: number; clicks: number }
  highOpportunityClusters: number
  minImpressions: number
  limit: number
} {
  const minImpressions = boundedInteger({
    value: input.minImpressions,
    fallback: 25,
  })
  const limit = boundedInteger({
    value: input.limit,
    fallback: 25,
    maximum: 100,
  })
  const benchmarkRows = input.rows
    .filter(
      (row) =>
        row.position >= 1 &&
        row.position <= 10 &&
        row.impressions > 0 &&
        Boolean(row.pages[0]?.url),
    )
    .map((row) => ({
      keys: [row.query, row.pages[0]?.url ?? ''],
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.clicks / row.impressions,
      position: row.position,
    }))
  const benchmarkRowsByQuery = new Map(
    benchmarkRows.map((row) => [row.keys[0] ?? '', row]),
  )
  const benchmarkContext = createCtrBenchmarkContext(benchmarkRows)
  const clusters: QueryCluster[] = []

  const candidateRows = input.rows.filter(
    (row) => row.impressions >= minImpressions,
  )
  for (const clusterRows of clusterQueryRows(candidateRows)) {
    const label = clusterLabel(clusterRows)
    const intents = new Set(
      clusterRows.map((row) => classifyIntent(row.query, input.brand)),
    )
    const [intent] = intents
    const clusterIntent = intents.size === 1 && intent ? intent : 'mixed'
    const totals = clusterTotals({ queries: clusterRows })
    const pages = clusterPages(clusterRows)
    const topPages = pages.slice(0, 5)
    const excludedRows = clusterRows
      .map((row) => benchmarkRowsByQuery.get(row.query))
      .filter((row): row is (typeof benchmarkRows)[number] => Boolean(row))
    const benchmark = benchmarkContext.forAggregate(
      {
        keys: [label, topPages[0]?.url ?? ''],
        clicks: totals.clicks,
        impressions: totals.impressions,
        ctr: totals.ctr,
        position: totals.averagePosition,
      },
      excludedRows,
    )
    const estimatedClickLift =
      totals.averagePosition <= 10
        ? Number(
            (
              Math.max(0, benchmark.ctr - totals.ctr) * totals.impressions
            ).toFixed(2),
          )
        : undefined
    const template = clusterTemplate(pages)
    clusters.push({
      label,
      intent: clusterIntent,
      queries: clusterRows
        .map((row) => ({
          query: row.query,
          impressions: row.impressions,
          clicks: row.clicks,
          position: row.position,
        }))
        .sort(
          (a, b) =>
            b.impressions - a.impressions ||
            compareQueryClusterText(a.query, b.query),
        ),
      topPages,
      template,
      totals,
      benchmark: benchmarkDetails(benchmark),
      ...(estimatedClickLift === undefined ? {} : { estimatedClickLift }),
      opportunityScore: opportunityScore({
        queries: clusterRows.length,
        impressions: totals.impressions,
        position: totals.averagePosition,
        estimatedClickLift,
      }),
      summary: clusterSummary({
        label,
        queries: clusterRows.length,
        impressions: totals.impressions,
        clicks: totals.clicks,
        position: totals.averagePosition,
      }),
      recommendation: clusterRecommendation({
        label,
        intent: clusterIntent,
        queries: clusterRows.length,
        impressions: totals.impressions,
        clicks: totals.clicks,
        position: totals.averagePosition,
        expectedCtr: benchmark.ctr,
        topPage: topPages[0],
        template,
      }),
    })
  }

  const sortedClusters = clusters
    .filter(
      (cluster) =>
        cluster.queries.length >= 2 ||
        (cluster.totals?.impressions ?? 0) >= minImpressions * 3,
    )
    .sort(
      (a, b) =>
        (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0) ||
        (b.totals?.impressions ?? 0) - (a.totals?.impressions ?? 0) ||
        b.queries.length - a.queries.length ||
        compareQueryClusterText(a.label, b.label),
    )
    .slice(0, limit)
  const totals = sortedClusters.reduce(
    (sum, cluster) => ({
      queries: sum.queries + cluster.queries.length,
      impressions: sum.impressions + (cluster.totals?.impressions ?? 0),
      clicks: sum.clicks + (cluster.totals?.clicks ?? 0),
    }),
    { queries: 0, impressions: 0, clicks: 0 },
  )
  const highOpportunityClusters = sortedClusters.filter((cluster) => {
    const clusterTotal = cluster.totals
    return Boolean(
      clusterTotal &&
        (cluster.opportunityScore ?? 0) > 0 &&
        cluster.queries.length > 1 &&
        clusterTotal.impressions >= 100,
    )
  }).length

  return {
    clusters: sortedClusters,
    totals,
    highOpportunityClusters,
    minImpressions,
    limit,
  }
}
