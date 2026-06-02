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
import {
  formatFetchDiagnostics,
  outputResult,
  selectedSiteOrThrow,
} from './shared.js'

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
    printTable(
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
    printTable(
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
    printTable(
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
    await outputResult(
      await cannibalReport({
        site: selection.site,
        brandTerms: selection.client?.brandTerms,
        includeBrand: booleanArg(args['include-brand']),
      }),
      json,
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
    await outputResult(
      await decayingReport({
        site: selection.site,
        brandTerms: selection.client?.brandTerms,
        includeBrand: booleanArg(args['include-brand']),
      }),
      json,
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
    await outputResult(
      await quickWinsReport({
        site: selection.site,
        brandTerms: selection.client?.brandTerms,
        includeBrand: booleanArg(args['include-brand']),
        verifyContent: booleanArg(args['verify-content']),
        verifyLimit: numberArg(args['verify-limit']),
        js: booleanArg(args.js) ? true : undefined,
        rate: fetchRateArg(args),
      }),
      json,
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
    await outputResult(
      await internalLinksReport({
        site: await selectedSiteOrThrow(
          { client: stringArg(args.client), site: stringArg(args.site) },
          { json },
        ),
        targetUrl: stringArg(args.url) ?? '',
      }),
      json,
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
    await outputResult(
      await ctrUnderperformersReport({
        site: selection.site,
        brandTerms: selection.client?.brandTerms,
        includeBrand: booleanArg(args['include-brand']),
      }),
      json,
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
    await outputResult(
      await queryClusterReport({
        site: selection.site,
        scope: stringArg(args.scope),
        brand: selection.client?.brandTerms?.[0],
      }),
      json,
    )
  },
})
