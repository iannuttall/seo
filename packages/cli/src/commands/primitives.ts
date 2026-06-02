import {
  auditPage,
  cannibalReport,
  ctrUnderperformersReport,
  decayingReport,
  internalLinksReport,
  queryClusterReport,
  quickWinsReport,
  secondPage,
  trafficAnomaly,
  updateCorrelation,
} from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  fetchRateArg,
  jsonFlag,
  numberArg,
  stringArg,
} from '../args.js'
import { resolveClientSelection } from '../selection.js'
import { printJson, printKeyValue, printTable } from '../utils.js'
import { formatFetchDiagnostics, selectedSiteOrThrow } from './shared.js'

const HUMAN_ROW_LIMIT = 25
type TableRow = Array<string | number>

function formatCount(value: number): string {
  return Math.round(value).toLocaleString('en-GB')
}

function formatPosition(value: number): string {
  return value.toFixed(1)
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function truncate(value: string, maxLength = 72): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 3)}...`
}

function verificationSummary(report: {
  verification?: { requested: boolean; verified: number; failed: number }
}): string {
  if (!report.verification?.requested) return 'off'
  return `${report.verification.verified} checked, ${report.verification.failed} failed`
}

function printLimitedTable(head: string[], rows: TableRow[]): void {
  printTable(head, rows.slice(0, HUMAN_ROW_LIMIT))
  if (rows.length > HUMAN_ROW_LIMIT) {
    process.stdout.write(
      `Showing ${HUMAN_ROW_LIMIT} of ${rows.length}. Use --json for full data.\n`,
    )
  }
}

export const trafficAnomalyCommand = defineCommand({
  args: {
    site: { type: 'string' },
    client: { type: 'string' },
    days: { type: 'string' },
    recent: { type: 'string' },
    json: { type: 'boolean', default: false },
    refresh: { type: 'boolean', default: false },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const report = await trafficAnomaly({
      site: await selectedSiteOrThrow(
        { client: stringArg(args.client), site: stringArg(args.site) },
        {
          json,
          refresh: booleanArg(args.refresh),
        },
      ),
      days: numberArg(args.days),
      recentDays: numberArg(args.recent),
      refresh: booleanArg(args.refresh),
    })
    if (json) {
      printJson(report)
      return
    }
    printLimitedTable(
      ['Metric', 'Direction', 'Baseline', 'Recent', 'z', 'Significant'],
      report.anomalies.map((anomaly) => [
        anomaly.metric,
        anomaly.direction,
        anomaly.baselineMean,
        anomaly.comparisonMean,
        anomaly.zScore,
        anomaly.significant ? 'yes' : 'no',
      ]),
    )
  },
})

export const updateCorrelateCommand = defineCommand({
  args: {
    site: { type: 'string' },
    client: { type: 'string' },
    days: { type: 'string' },
    recent: { type: 'string' },
    json: { type: 'boolean', default: false },
    refresh: { type: 'boolean', default: false },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const report = await updateCorrelation({
      site: await selectedSiteOrThrow(
        { client: stringArg(args.client), site: stringArg(args.site) },
        {
          json,
          refresh: booleanArg(args.refresh),
        },
      ),
      days: numberArg(args.days),
      recentDays: numberArg(args.recent),
      refresh: booleanArg(args.refresh),
    })
    if (json) {
      printJson(report)
      return
    }
    printKeyValue([
      ['Classification', report.classification],
      ['Updates matched', String(report.overlappingUpdates.length)],
    ])
    printLimitedTable(
      ['Metric', 'Direction', 'z', 'Recent'],
      report.anomalies.map((anomaly) => [
        anomaly.metric,
        anomaly.direction,
        anomaly.zScore,
        `${anomaly.comparisonStart} to ${anomaly.comparisonEnd}`,
      ]),
    )
    if (report.overlappingUpdates.length) {
      process.stdout.write('\nUpdates\n')
      printTable(
        ['Start', 'End', 'Type', 'Name'],
        report.overlappingUpdates.map((update) => [
          update.start.slice(0, 10),
          update.end?.slice(0, 10) ?? 'open',
          update.type,
          update.name,
        ]),
      )
    }
  },
})

export const auditPageCommand = defineCommand({
  args: {
    url: { type: 'string', required: true },
    site: { type: 'string' },
    client: { type: 'string' },
    json: { type: 'boolean', default: false },
    js: { type: 'boolean', default: false },
    refresh: { type: 'boolean', default: false },
  },
  run: async ({ args }) => {
    const report = await auditPage({
      url: stringArg(args.url) ?? '',
      site: await selectedSiteOrThrow(
        { client: stringArg(args.client), site: stringArg(args.site) },
        {
          json: jsonFlag(args),
          refresh: booleanArg(args.refresh),
        },
      ),
      js: booleanArg(args.js) ? true : 'auto',
      refresh: booleanArg(args.refresh),
    })
    if (jsonFlag(args)) {
      printJson(report)
      return
    }
    printKeyValue([
      ['URL', report.url],
      ['Final URL', report.page.finalUrl],
      ['Title', report.page.title ?? 'missing'],
      ['Meta description', report.page.metaDescription ?? 'missing'],
      ['Word count', String(report.page.wordCount)],
      ['Fetch', formatFetchDiagnostics(report.fetchDiagnostics)],
    ])
    if (report.issues.length) {
      process.stdout.write('\nIssues\n')
      printTable(
        ['Code', 'Severity', 'Principle', 'Detail'],
        report.issues.map((issue) => [
          issue.code,
          issue.severity,
          issue.principle,
          issue.detail,
        ]),
      )
    }
  },
})

export const secondPageCommand = defineCommand({
  args: {
    site: { type: 'string' },
    client: { type: 'string' },
    limit: { type: 'string' },
    'include-brand': {
      type: 'boolean',
      default: false,
      description: 'Include branded queries in opportunity reports.',
    },
    'verify-content': {
      type: 'boolean',
      default: false,
      description:
        'Verify top opportunities against page title, meta, and content.',
    },
    'verify-limit': {
      type: 'string',
      description: 'Maximum opportunity URLs to verify. Defaults to 5.',
    },
    js: {
      type: 'boolean',
      default: false,
      description: 'Force JavaScript rendering for verified pages.',
    },
    'fetch-concurrency': {
      type: 'string',
      description: 'Maximum concurrent page fetches per host. Defaults to 4.',
    },
    'fetch-interval-cap': {
      type: 'string',
      description: 'Maximum page fetches per interval per host. Defaults to 4.',
    },
    'fetch-interval-ms': {
      type: 'string',
      description: 'Fetch rate interval in milliseconds. Defaults to 1000.',
    },
    json: { type: 'boolean', default: false },
    refresh: { type: 'boolean', default: false },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const selection = await resolveClientSelection({
      client: stringArg(args.client),
      site: stringArg(args.site),
      options: { json, refresh: booleanArg(args.refresh) },
    })
    const report = await secondPage({
      site: selection.site,
      limit: stringArg(args.limit) ? Number(stringArg(args.limit)) : 10,
      brandTerms: selection.client?.brandTerms,
      includeBrand: booleanArg(args['include-brand']),
      verifyContent: booleanArg(args['verify-content']),
      verifyLimit: numberArg(args['verify-limit']),
      js: booleanArg(args.js) ? true : undefined,
      rate: fetchRateArg(args),
      refresh: booleanArg(args.refresh),
    })
    if (json) {
      printJson(report)
      return
    }
    printLimitedTable(
      ['Query', 'Pos', 'Impr', 'CTR', 'Coverage', 'Fetch', 'Gap', 'Action'],
      report.items.map((item) => [
        item.primaryQuery,
        item.position.toFixed(1),
        Math.round(item.impressions),
        item.ctr.toFixed(3),
        `${item.coverage.inTitleExact ? 'T' : '-'}${item.coverage.inH1 ? 'H' : '-'}${item.coverage.inMeta ? 'M' : '-'}${item.coverage.inFirst100Words ? 'F' : '-'}`,
        formatFetchDiagnostics(item.fetchDiagnostics),
        item.contentVerification?.contentGapScore ?? '-',
        item.recommendations[0]?.action ?? 'No recommendation',
      ]),
    )
    process.stdout.write(`${report.ledgerSummary}\n`)
  },
})

export const cannibalCommand = defineCommand({
  args: {
    site: { type: 'string' },
    client: { type: 'string' },
    'include-brand': {
      type: 'boolean',
      default: false,
      description: 'Include branded queries in opportunity reports.',
    },
    json: { type: 'boolean', default: false },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const selection = await resolveClientSelection({
      client: stringArg(args.client),
      site: stringArg(args.site),
      options: { json },
    })
    const report = await cannibalReport({
      site: selection.site,
      brandTerms: selection.client?.brandTerms,
      includeBrand: booleanArg(args['include-brand']),
    })
    if (json) {
      printJson(report)
      return
    }
    printKeyValue([
      ['Site', report.site],
      ['Clusters', formatCount(report.items.length)],
      [
        'Brand queries',
        booleanArg(args['include-brand']) ? 'included' : 'excluded',
      ],
    ])
    printLimitedTable(
      ['Query', 'URLs', 'HHI', 'Top URL', 'Action'],
      report.items.map((item) => {
        const topPage = [...item.pages].sort(
          (a, b) => a.position - b.position,
        )[0]
        return [
          truncate(item.query, 42),
          item.pages.length,
          item.hhi.toFixed(2),
          truncate(topPage?.url ?? '', 56),
          truncate(item.recommendation.action, 72),
        ]
      }),
    )
  },
})

export const decayingCommand = defineCommand({
  args: {
    site: { type: 'string' },
    client: { type: 'string' },
    'include-brand': {
      type: 'boolean',
      default: false,
      description: 'Include branded queries in opportunity reports.',
    },
    json: { type: 'boolean', default: false },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const selection = await resolveClientSelection({
      client: stringArg(args.client),
      site: stringArg(args.site),
      options: { json },
    })
    const report = await decayingReport({
      site: selection.site,
      brandTerms: selection.client?.brandTerms,
      includeBrand: booleanArg(args['include-brand']),
    })
    if (json) {
      printJson(report)
      return
    }
    printKeyValue([
      ['Site', report.site],
      ['Decaying queries', formatCount(report.items.length)],
      [
        'Brand queries',
        booleanArg(args['include-brand']) ? 'included' : 'excluded',
      ],
    ])
    printLimitedTable(
      ['Query', 'Cause', 'Clicks', 'Impr', 'CTR', 'Pos', 'Action'],
      report.items.map((item) => [
        truncate(item.query, 42),
        item.diagnosis.replaceAll('_', ' '),
        `${formatCount(item.previous.clicks)} -> ${formatCount(item.current.clicks)}`,
        `${formatCount(item.previous.impressions)} -> ${formatCount(item.current.impressions)}`,
        `${formatPercent(item.previous.ctr)} -> ${formatPercent(item.current.ctr)}`,
        `${formatPosition(item.previous.position)} -> ${formatPosition(item.current.position)}`,
        truncate(item.recommendation.action, 72),
      ]),
    )
  },
})

export const quickWinsCommand = defineCommand({
  args: {
    site: { type: 'string' },
    client: { type: 'string' },
    'include-brand': {
      type: 'boolean',
      default: false,
      description: 'Include branded queries in opportunity reports.',
    },
    'verify-content': {
      type: 'boolean',
      default: false,
      description:
        'Verify top quick wins against page title, meta, and content.',
    },
    'verify-limit': {
      type: 'string',
      description: 'Maximum quick-win URLs to verify. Defaults to 5.',
    },
    js: {
      type: 'boolean',
      default: false,
      description: 'Force JavaScript rendering for verified pages.',
    },
    'fetch-concurrency': {
      type: 'string',
      description: 'Maximum concurrent page fetches per host. Defaults to 4.',
    },
    'fetch-interval-cap': {
      type: 'string',
      description: 'Maximum page fetches per interval per host. Defaults to 4.',
    },
    'fetch-interval-ms': {
      type: 'string',
      description: 'Fetch rate interval in milliseconds. Defaults to 1000.',
    },
    json: { type: 'boolean', default: false },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const selection = await resolveClientSelection({
      client: stringArg(args.client),
      site: stringArg(args.site),
      options: { json },
    })
    const report = await quickWinsReport({
      site: selection.site,
      brandTerms: selection.client?.brandTerms,
      includeBrand: booleanArg(args['include-brand']),
      verifyContent: booleanArg(args['verify-content']),
      verifyLimit: numberArg(args['verify-limit']),
      js: booleanArg(args.js) ? true : undefined,
      rate: fetchRateArg(args),
    })
    if (json) {
      printJson(report)
      return
    }
    printKeyValue([
      ['Site', report.site],
      ['Quick wins', formatCount(report.items.length)],
      [
        'Brand queries',
        booleanArg(args['include-brand']) ? 'included' : 'excluded',
      ],
      ['Verification', verificationSummary(report)],
    ])
    printLimitedTable(
      ['Query', 'URL', 'Pos', 'Impr', 'CTR', 'Lift', 'Fetch', 'Gap', 'Action'],
      report.items.map((item) => [
        truncate(item.query, 36),
        truncate(item.url, 48),
        formatPosition(item.position),
        formatCount(item.impressions),
        formatPercent(item.ctr),
        formatCount(item.estimatedClickLift),
        formatFetchDiagnostics(item.contentVerification?.fetchDiagnostics),
        item.contentVerification?.contentGapScore ?? '-',
        truncate(item.recommendation.action, 64),
      ]),
    )
  },
})

export const internalLinksCommand = defineCommand({
  args: {
    site: { type: 'string' },
    client: { type: 'string' },
    url: { type: 'string', required: true },
    json: { type: 'boolean', default: false },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const report = await internalLinksReport({
      site: await selectedSiteOrThrow(
        { client: stringArg(args.client), site: stringArg(args.site) },
        { json },
      ),
      targetUrl: stringArg(args.url) ?? '',
    })
    if (json) {
      printJson(report)
      return
    }
    printKeyValue([
      ['Site', report.site],
      ['Target', report.targetUrl],
      ['Opportunities', formatCount(report.items.length)],
    ])
    printLimitedTable(
      ['Source URL', 'Impr', 'Shared queries', 'Action'],
      report.items.map((item) => [
        truncate(item.sourceUrl, 60),
        formatCount(item.sourceImpressions),
        truncate(item.sharedQueries.join(', '), 56),
        truncate(item.recommendation.action, 72),
      ]),
    )
  },
})

export const ctrUnderperformersCommand = defineCommand({
  args: {
    site: { type: 'string' },
    client: { type: 'string' },
    'include-brand': {
      type: 'boolean',
      default: false,
      description: 'Include branded queries in opportunity reports.',
    },
    json: { type: 'boolean', default: false },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const selection = await resolveClientSelection({
      client: stringArg(args.client),
      site: stringArg(args.site),
      options: { json },
    })
    const report = await ctrUnderperformersReport({
      site: selection.site,
      brandTerms: selection.client?.brandTerms,
      includeBrand: booleanArg(args['include-brand']),
    })
    if (json) {
      printJson(report)
      return
    }
    printKeyValue([
      ['Site', report.site],
      ['Underperformers', formatCount(report.items.length)],
      [
        'Brand queries',
        booleanArg(args['include-brand']) ? 'included' : 'excluded',
      ],
    ])
    printLimitedTable(
      ['Query', 'URL', 'Pos', 'Impr', 'CTR', 'Expected', 'Action'],
      report.items.map((item) => [
        truncate(item.query, 36),
        truncate(item.url, 48),
        formatPosition(item.position),
        formatCount(item.impressions),
        formatPercent(item.actualCtr),
        formatPercent(item.expectedCtr),
        truncate(item.recommendation.action, 72),
      ]),
    )
  },
})

export const queryClusterCommand = defineCommand({
  args: {
    site: { type: 'string' },
    client: { type: 'string' },
    scope: { type: 'string' },
    json: { type: 'boolean', default: false },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const selection = await resolveClientSelection({
      client: stringArg(args.client),
      site: stringArg(args.site),
      options: { json },
    })
    const report = await queryClusterReport({
      site: selection.site,
      scope: stringArg(args.scope),
      brand: selection.client?.brandTerms?.[0],
    })
    if (json) {
      printJson(report)
      return
    }
    printKeyValue([
      ['Site', report.site],
      ['Scope', report.scope ?? 'all pages'],
      ['Clusters', formatCount(report.clusters.length)],
    ])
    printLimitedTable(
      ['Cluster', 'Intent', 'Queries', 'Impr', 'Clicks', 'Top query'],
      report.clusters.map((cluster) => {
        const totals = cluster.queries.reduce(
          (sum, query) => ({
            impressions: sum.impressions + query.impressions,
            clicks: sum.clicks + query.clicks,
          }),
          { impressions: 0, clicks: 0 },
        )
        const topQuery = [...cluster.queries].sort(
          (a, b) => b.impressions - a.impressions,
        )[0]
        return [
          truncate(cluster.label, 32),
          cluster.intent,
          cluster.queries.length,
          formatCount(totals.impressions),
          formatCount(totals.clicks),
          truncate(topQuery?.query ?? '', 56),
        ]
      }),
    )
  },
})
