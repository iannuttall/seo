import {
  diagnoseProperty,
  ga4PropertyIdFromName,
  listGa4AccountSummaries,
  readConfig,
  runDoctor,
  type SegmentDimension,
  segmentImpact,
  strikingDistance,
  writeConfig,
} from '@seo/core'
import { defineCommand } from 'citty'
import { printJson, printKeyValue, printTable } from '../utils.js'

const stringArg = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined

const booleanArg = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined

const numberArg = (value: unknown): number | undefined => {
  if (typeof value === 'number') return value
  if (typeof value !== 'string' || !value.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const jsonFlag = (args: Record<string, unknown>): boolean => args.json === true

const defaultSiteOrThrow = (site?: string): string => {
  const chosen = site ?? readConfig().defaultSite
  if (!chosen) {
    throw new Error('No site selected. Pass --site or run `seo init` first.')
  }
  return chosen
}

const segmentDimension = (value: unknown): SegmentDimension => {
  const dimension = stringArg(value) ?? 'page'
  if (
    dimension !== 'page' &&
    dimension !== 'query' &&
    dimension !== 'country' &&
    dimension !== 'device'
  ) {
    throw new Error('Invalid --dimension. Use page, query, country, or device.')
  }
  return dimension
}

export const doctorCommand = defineCommand({
  meta: {
    name: 'doctor',
    description: 'Check local auth, scopes, config, and defaults',
  },
  args: {
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const report = await runDoctor()
    if (jsonFlag(args)) {
      printJson(report)
      return
    }
    printKeyValue([
      ['Status', report.ok ? 'ok' : 'needs attention'],
      ['Generated', report.generatedAt],
    ])
    printTable(
      ['Check', 'Status', 'Detail', 'Fix'],
      report.checks.map((check) => [
        check.label,
        check.status,
        check.detail,
        check.fix ?? '',
      ]),
    )
  },
})

export const ga4PropertiesCommand = defineCommand({
  meta: {
    name: 'ga4-properties',
    description: 'List GA4 accounts and properties available to Google OAuth',
  },
  args: {
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
    save: {
      type: 'string',
      description: 'Save this numeric GA4 property ID as the default.',
    },
  },
  run: async ({ args }) => {
    const summaries = await listGa4AccountSummaries()
    const rows = summaries.flatMap((account) =>
      account.propertySummaries.map((property) => ({
        account: account.displayName ?? account.account,
        property: ga4PropertyIdFromName(property.property),
        displayName: property.displayName ?? property.property,
      })),
    )

    const save = stringArg(args.save)
    if (save) {
      const config = readConfig()
      config.google.defaultGa4PropertyId = save
      writeConfig(config)
    }

    if (jsonFlag(args)) {
      printJson({ accountSummaries: summaries, properties: rows, saved: save })
      return
    }
    if (save) {
      process.stdout.write(`Saved default GA4 property ${save}.\n`)
    }
    printTable(
      ['Property', 'Name', 'Account'],
      rows.map((row) => [row.property, row.displayName, row.account]),
    )
  },
})

export const segmentImpactCommand = defineCommand({
  meta: {
    name: 'segment-impact',
    description: 'Compare GSC movement by page, query, device, or country',
  },
  args: {
    site: {
      type: 'string',
      description: 'GSC property URL, for example sc-domain:example.com.',
    },
    dimension: {
      type: 'string',
      default: 'page',
      description: 'Segment by page, query, country, or device.',
    },
    days: {
      type: 'string',
      description: 'Recent window length in days. Defaults to 28.',
    },
    compare: {
      type: 'string',
      description:
        'Previous comparison window length in days. Defaults to days.',
    },
    limit: {
      type: 'string',
      description: 'Maximum segment rows to print. Defaults to 25.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
    refresh: {
      type: 'boolean',
      default: false,
      description: 'Bypass local cache and fetch fresh GSC data.',
    },
  },
  run: async ({ args }) => {
    const report = await segmentImpact({
      site: defaultSiteOrThrow(stringArg(args.site)),
      dimension: segmentDimension(args.dimension),
      days: numberArg(args.days),
      compareDays: numberArg(args.compare),
      limit: numberArg(args.limit),
      refresh: booleanArg(args.refresh),
    })
    if (jsonFlag(args)) {
      printJson(report)
      return
    }
    printKeyValue([
      ['Property', report.site],
      ['Dimension', report.dimension],
      ['Before', `${report.before.startDate} to ${report.before.endDate}`],
      ['After', `${report.after.startDate} to ${report.after.endDate}`],
    ])
    printTable(
      ['Segment', 'Clicks before', 'Clicks after', 'Delta', 'Pos delta'],
      report.items.map((item) => [
        item.key,
        item.beforeClicks,
        item.afterClicks,
        item.clickDelta,
        item.positionDelta,
      ]),
    )
  },
})

export const strikingDistanceCommand = defineCommand({
  meta: {
    name: 'striking-distance',
    description: 'Find position 11-20 query/page opportunities',
  },
  args: {
    site: {
      type: 'string',
      description: 'GSC property URL, for example sc-domain:example.com.',
    },
    days: {
      type: 'string',
      description: 'Recent window length in days. Defaults to 28.',
    },
    'min-impressions': {
      type: 'string',
      description:
        'Minimum impressions for a query/page pair. Defaults to 100.',
    },
    limit: {
      type: 'string',
      description: 'Maximum opportunities to print. Defaults to 25.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
    refresh: {
      type: 'boolean',
      default: false,
      description: 'Bypass local cache and fetch fresh GSC data.',
    },
  },
  run: async ({ args }) => {
    const report = await strikingDistance({
      site: defaultSiteOrThrow(stringArg(args.site)),
      days: numberArg(args.days),
      minImpressions: numberArg(args['min-impressions']),
      limit: numberArg(args.limit),
      refresh: booleanArg(args.refresh),
    })
    if (jsonFlag(args)) {
      printJson(report)
      return
    }
    printTable(
      ['Query', 'URL', 'Impr', 'CTR', 'Pos', 'Score'],
      report.items.map((item) => [
        item.query,
        item.url,
        item.impressions,
        item.ctr,
        item.position,
        item.opportunityScore,
      ]),
    )
  },
})

export const diagnoseCommand = defineCommand({
  meta: {
    name: 'diagnose',
    description: 'Run end-to-end property diagnosis across GSC signals',
  },
  args: {
    site: {
      type: 'string',
      description: 'GSC property URL, for example sc-domain:example.com.',
    },
    days: {
      type: 'string',
      description: 'Baseline window length in days. Defaults to 90.',
    },
    recent: {
      type: 'string',
      description: 'Recent anomaly window in days. Defaults to 14.',
    },
    limit: {
      type: 'string',
      description: 'Maximum rows per diagnostic section. Defaults to 10.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
    refresh: {
      type: 'boolean',
      default: false,
      description: 'Bypass local cache and fetch fresh GSC data.',
    },
  },
  run: async ({ args }) => {
    const report = await diagnoseProperty({
      site: defaultSiteOrThrow(stringArg(args.site)),
      days: numberArg(args.days),
      recentDays: numberArg(args.recent),
      limit: numberArg(args.limit),
      refresh: booleanArg(args.refresh),
    })
    if (jsonFlag(args)) {
      printJson(report)
      return
    }
    printKeyValue([
      ['Property', report.site],
      ['Classification', report.summary.classification],
      ['Significant anomalies', String(report.summary.significantAnomalies)],
      ['Update matches', String(report.summary.updateMatches)],
      ['Decay items', String(report.summary.decayItems)],
      ['Cannibal items', String(report.summary.cannibalItems)],
      ['Striking distance', String(report.summary.strikingDistanceItems)],
    ])
    printTable(
      ['Priority', 'Confidence', 'Reason', 'Action'],
      report.priorities.map((priority) => [
        priority.label,
        priority.confidence,
        priority.reason,
        priority.action,
      ]),
    )
  },
})
