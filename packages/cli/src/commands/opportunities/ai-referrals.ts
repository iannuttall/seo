import { aiReferralsReport } from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag, projectArg, strictNumberArg, stringArg } from '../../args.js'
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
    'max-rows': {
      type: 'string',
      description: 'Maximum GA4 rows per query. Defaults to 100000.',
    },
    'result-limit': {
      type: 'string',
      description: 'Maximum ranked landing pages returned. Defaults to 25.',
    },
    limit: {
      type: 'string',
      description: 'Legacy alias for --max-rows.',
    },
    refresh: {
      type: 'boolean',
      default: false,
      description: 'Bypass cached GA4 responses.',
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
      maxRows: strictNumberArg(args['max-rows'], '--max-rows'),
      resultLimit: strictNumberArg(args['result-limit'], '--result-limit'),
      limit: strictNumberArg(args.limit, '--limit'),
      refresh: args.refresh === true,
    })

    if (json) {
      printJson(report)
      return
    }

    printKeyValue([
      ['Property', report.property],
      ['Evidence', report.dataStatus === 'complete' ? 'Complete' : 'Partial'],
      ['Verdict', report.summary.verdict],
      ['AI sessions', formatCount(report.summary.sessions)],
      [
        'AI users',
        report.summary.totalUsers === null
          ? 'Unavailable'
          : formatCount(report.summary.totalUsers),
      ],
      ['Sources', formatCount(report.summary.sources)],
      ['Landing pages', formatCount(report.summary.landingPages)],
      [
        'Landing-page output',
        `${formatCount(report.selection.landingPages.returnedRows)} returned / ${formatCount(report.selection.landingPages.retainedRows)} retained`,
      ],
      [
        'Source rows',
        formatCount(report.dataSource.sourceDiscovery.returnedRows),
      ],
    ])

    if (report.sources.length) {
      process.stdout.write('\nAI sources\n')
      printLimitedTable(
        ['Source', 'Sessions', 'Events', 'Share of AI sessions'],
        report.sources.map((source) => [
          source.label,
          formatCount(source.sessions),
          formatCount(source.eventCount),
          formatPercent(source.shareOfAiSessions),
        ]),
      )
    }

    if (report.landingPages.length) {
      process.stdout.write('\nLanding pages\n')
      printLimitedTable(
        ['Landing page', 'Sessions', 'Events', 'Top source'],
        report.landingPages.map((page) => [
          truncate(page.landingPage, 64),
          formatCount(page.sessions),
          formatCount(page.eventCount),
          page.topSourceDetails.label,
        ]),
      )
    }

    if (report.dataSource.partialReasons.length) {
      process.stdout.write('\nEvidence warnings\n')
      for (const warning of report.dataSource.partialReasons) {
        process.stdout.write(`- ${warning}\n`)
      }
    }

    process.stdout.write(`\nNote: ${report.summary.caveat}\n`)
  },
})
