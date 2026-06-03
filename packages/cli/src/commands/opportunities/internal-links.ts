import { internalLinksReport } from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag, numberArg, stringArg } from '../../args.js'
import { printJson, printKeyValue } from '../../utils.js'
import {
  formatCount,
  printActionDetails,
  printLimitedTable,
  printNotes,
  truncate,
} from '../output.js'
import { selectedSiteOrThrow } from '../shared.js'

export const internalLinksCommand = defineCommand({
  args: {
    site: { type: 'string' },
    client: { type: 'string' },
    url: { type: 'string', required: true },
    limit: { type: 'string' },
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
      limit: numberArg(args.limit),
    })
    if (json) {
      printJson(report)
      return
    }
    printKeyValue([
      ['Site', report.site],
      ['Target', report.targetUrl],
      ['Target queries', formatCount(report.summary.targetQueries)],
      ['Candidate sources', formatCount(report.summary.candidateSources)],
      ['Checked sources', formatCount(report.summary.checkedSources)],
      ['Opportunities', formatCount(report.summary.opportunities)],
      ['Skipped sources', formatCount(report.summary.skippedSources)],
      ['Verdict', report.summary.verdict],
    ])
    printNotes('Why this matters', [
      'These source pages already rank for related queries, so their internal links can pass relevance into the target without creating new pages.',
      'Use the shared-query column to choose natural anchor text and avoid forced exact-match links.',
    ])
    printNotes('Recommended actions', report.recommendations)
    printNotes('Report caveats', report.caveats)
    if (!report.items.length) {
      process.stdout.write(
        'No internal link opportunities matched this target URL.\n',
      )
      return
    }
    printLimitedTable(
      ['Source URL', 'Impr', 'Shared queries', 'Action'],
      report.items.map((item) => [
        truncate(item.sourceUrl, 60),
        formatCount(item.sourceImpressions),
        truncate(item.sharedQueries.join(', '), 56),
        truncate(item.recommendation.action, 72),
      ]),
    )
    printActionDetails(
      'Top internal link actions',
      report.items.map((item) => ({
        label: truncate(item.sourceUrl, 96),
        context: `${formatCount(item.sourceImpressions)} impressions`,
        action: item.recommendation.action,
      })),
    )
  },
})
