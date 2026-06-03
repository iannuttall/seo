import { queryClusterReport } from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag, stringArg } from '../../args.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson, printKeyValue } from '../../utils.js'
import {
  formatCount,
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
      ['Clusters', formatCount(report.clusters.length)],
    ])
    printNotes('Why this matters', [
      'Clusters show repeated demand themes, so they are better inputs for page sections, hubs, and templates than one-off query exports.',
      'Prioritise clusters with high impressions and low clicks; they usually reveal unclear intent coverage or weak SERP framing.',
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
