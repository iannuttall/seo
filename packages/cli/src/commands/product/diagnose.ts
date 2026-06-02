import { diagnoseProperty } from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, numberArg, stringArg } from '../../args.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson, printKeyValue, printTable } from '../../utils.js'

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
    client: {
      type: 'string',
      description: 'Saved client id or name.',
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
    'include-brand': {
      type: 'boolean',
      default: false,
      description: 'Include branded queries in opportunity reports.',
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
    const json = jsonFlag(args)
    const selection = await resolveClientSelection({
      client: stringArg(args.client),
      site: stringArg(args.site),
      options: { json, refresh: booleanArg(args.refresh) },
    })
    const report = await diagnoseProperty({
      site: selection.site,
      days: numberArg(args.days),
      recentDays: numberArg(args.recent),
      limit: numberArg(args.limit),
      brandTerms: selection.client?.brandTerms,
      includeBrand: booleanArg(args['include-brand']),
      refresh: booleanArg(args.refresh),
    })
    if (json) {
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
