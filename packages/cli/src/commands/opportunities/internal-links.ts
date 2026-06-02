import { internalLinksReport } from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag, stringArg } from '../../args.js'
import { printJson, printKeyValue } from '../../utils.js'
import { formatCount, printLimitedTable, truncate } from '../output.js'
import { selectedSiteOrThrow } from '../shared.js'

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
