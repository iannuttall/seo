import { queryClusterReport } from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  jsonFlag,
  numberArg,
  projectArg,
  stringArg,
} from '../../args.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson } from '../../utils.js'
import {
  formatCount,
  formatPercent,
  printActionDetails,
  printLimitedTable,
  printNotes,
  printReportSummary,
  truncate,
} from '../output.js'
import { cliReportArgs } from '../report-options.js'

export const queryClusterCommand = defineCommand({
  meta: {
    name: 'query-cluster',
    description: 'Cluster GSC queries into repeated demand themes',
  },
  args: {
    site: { type: 'string' },
    project: { type: 'string', description: 'Saved project id or name.' },
    client: { type: 'string', description: 'Legacy alias for --project.' },
    scope: { type: 'string' },
    ...cliReportArgs(['includeBrand', 'minImpressions', 'limit'], {
      includeBrand: {
        description: 'Include branded queries in query clustering.',
      },
      minImpressions: {
        description: 'Minimum impressions per query. Defaults to 25.',
      },
      limit: {
        description: 'Maximum clusters to return. Defaults to 25; max 100.',
      },
    }),
    json: { type: 'boolean', default: false },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const selection = await resolveClientSelection({
      client: projectArg(args),
      site: stringArg(args.site),
      options: { json },
    })
    const report = await queryClusterReport({
      site: selection.site,
      scope: stringArg(args.scope),
      brand: selection.client?.brandTerms?.[0],
      brandTerms: selection.client?.brandTerms,
      includeBrand: booleanArg(args['include-brand']),
      minImpressions: numberArg(args['min-impressions']),
      limit: numberArg(args.limit),
    })
    if (json) {
      printJson(report)
      return
    }
    printReportSummary({
      title: 'Query clusters',
      target: report.site,
      status: 'info',
      summary: report.summary.verdict,
      metrics: [
        { label: 'Scope', value: report.scope ?? 'All pages' },
        { label: 'Clusters', value: formatCount(report.summary.clusters) },
        { label: 'Queries', value: formatCount(report.summary.queries) },
        {
          label: 'Impressions',
          value: formatCount(report.summary.impressions),
        },
        { label: 'Clicks', value: formatCount(report.summary.clicks) },
        {
          label: 'Minimum impressions',
          value: formatCount(report.summary.minImpressions),
        },
        { label: 'Result limit', value: formatCount(report.summary.limit) },
        {
          label: 'High opportunity',
          value: formatCount(report.summary.highOpportunityClusters),
        },
        { label: 'Brand queries', value: report.summary.brandFiltering },
      ],
    })
    printNotes('Why this matters', [
      'Clusters show repeated demand themes, so they are better inputs for page sections, hubs, and templates than one-off query exports.',
      'Prioritise clusters with high impressions and low clicks; they usually reveal unclear intent coverage or weak SERP framing.',
    ])
    printNotes('Recommended actions', report.recommendations)
    printNotes('Report caveats', report.caveats)
    printLimitedTable(
      [
        'Cluster',
        'Intent',
        'Queries',
        'Impr',
        'CTR',
        'Expected',
        'Lift',
        'Action',
      ],
      report.clusters.map((cluster) => {
        return [
          truncate(cluster.label, 32),
          cluster.intent,
          cluster.queries.length,
          formatCount(cluster.totals?.impressions ?? 0),
          formatPercent(cluster.totals?.ctr ?? 0),
          formatPercent(cluster.benchmark?.expectedCtr ?? 0),
          cluster.estimatedClickLift === undefined
            ? '-'
            : formatCount(cluster.estimatedClickLift),
          truncate(cluster.recommendation ?? '', 72),
        ]
      }),
    )
    printActionDetails(
      'Top cluster actions',
      report.clusters.map((cluster) => ({
        label: cluster.label,
        context: `${formatCount(cluster.totals?.impressions ?? 0)} impressions, ${cluster.estimatedClickLift === undefined ? 'ranking opportunity' : `${formatCount(cluster.estimatedClickLift)} estimated click lift`}`,
        action: cluster.recommendation ?? '',
      })),
    )
  },
})
