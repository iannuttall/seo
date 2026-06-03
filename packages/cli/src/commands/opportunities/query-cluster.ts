import { queryClusterReport } from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag, stringArg } from '../../args.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson, printKeyValue } from '../../utils.js'
import {
  formatCount,
  formatPercent,
  printActionDetails,
  printLimitedTable,
  printNotes,
  truncate,
} from '../output.js'

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
      ['Clusters', formatCount(report.summary.clusters)],
      ['Queries', formatCount(report.summary.queries)],
      ['Impressions', formatCount(report.summary.impressions)],
      ['Clicks', formatCount(report.summary.clicks)],
      [
        'High-opportunity clusters',
        formatCount(report.summary.highOpportunityClusters),
      ],
      ['Verdict', report.summary.verdict],
    ])
    printNotes('Why this matters', [
      'Clusters show repeated demand themes, so they are better inputs for page sections, hubs, and templates than one-off query exports.',
      'Prioritise clusters with high impressions and low clicks; they usually reveal unclear intent coverage or weak SERP framing.',
    ])
    printNotes('Recommended actions', report.recommendations)
    printNotes('Report caveats', report.caveats)
    printLimitedTable(
      ['Cluster', 'Intent', 'Queries', 'Impr', 'Clicks', 'CTR', 'Action'],
      report.clusters.map((cluster) => {
        return [
          truncate(cluster.label, 32),
          cluster.intent,
          cluster.queries.length,
          formatCount(cluster.totals?.impressions ?? 0),
          formatCount(cluster.totals?.clicks ?? 0),
          formatPercent(cluster.totals?.ctr ?? 0),
          truncate(cluster.recommendation ?? '', 72),
        ]
      }),
    )
    printActionDetails(
      'Top cluster actions',
      report.clusters.map((cluster) => ({
        label: cluster.label,
        context: `${formatCount(cluster.totals?.impressions ?? 0)} impressions`,
        action: cluster.recommendation ?? '',
      })),
    )
  },
})
