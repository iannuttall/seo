import { aiReferralsReport } from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag, numberArg, projectArg, stringArg } from '../../args.js'
import { resolveClient, resolveGa4Property } from '../../selection.js'
import { printJson, printKeyValue } from '../../utils.js'
import {
  formatCount,
  formatPercent,
  printLimitedTable,
  truncate,
} from '../output.js'

export const aiReferralsCommand = defineCommand({
  meta: {
    name: 'ai-referrals',
    description: 'Find AI referral traffic detected in GA4',
  },
  args: {
    property: {
      type: 'string',
      description: 'GA4 property ID. If omitted in a terminal, choose one.',
    },
    client: {
      type: 'string',
      description: 'Legacy alias for --project.',
    },
    project: {
      type: 'string',
      description: 'Saved project id or name with an optional GA4 property.',
    },
    'start-date': { type: 'string', default: '28daysAgo' },
    'end-date': { type: 'string', default: 'yesterday' },
    limit: {
      type: 'string',
      description: 'Maximum GA4 rows to scan. Defaults to 10000.',
    },
    json: { type: 'boolean', default: false },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const client = await resolveClient({
      client: projectArg(args),
      options: { json },
    })
    const property = await resolveGa4Property({
      property: stringArg(args.property) ?? client?.ga4PropertyId,
      options: { json },
    })
    const report = await aiReferralsReport({
      property,
      startDate: stringArg(args['start-date']),
      endDate: stringArg(args['end-date']),
      limit: numberArg(args.limit),
    })

    if (json) {
      printJson(report)
      return
    }

    printKeyValue([
      ['Property', report.property],
      ['Verdict', report.summary.verdict],
      ['AI sessions', formatCount(report.summary.sessions)],
      ['AI users', formatCount(report.summary.totalUsers)],
      ['Sources', formatCount(report.summary.sources)],
      ['Landing pages', formatCount(report.summary.landingPages)],
    ])

    if (report.sources.length) {
      process.stdout.write('\nAI sources\n')
      printLimitedTable(
        ['Source', 'Sessions', 'Users', 'Share'],
        report.sources.map((source) => [
          source.source,
          formatCount(source.sessions),
          formatCount(source.totalUsers),
          formatPercent(source.share),
        ]),
      )
    }

    if (report.landingPages.length) {
      process.stdout.write('\nLanding pages\n')
      printLimitedTable(
        ['Landing page', 'Sessions', 'Users', 'Top source'],
        report.landingPages.map((page) => [
          truncate(page.landingPage, 64),
          formatCount(page.sessions),
          formatCount(page.totalUsers),
          page.topSource,
        ]),
      )
    }

    process.stdout.write(`\nNote: ${report.summary.caveat}\n`)
  },
})
