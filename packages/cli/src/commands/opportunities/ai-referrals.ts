import { aiReferralsReport } from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag, strictNumberArg, stringArg } from '../../args.js'
import { requireGoogleAnalyticsProperty } from '../../selection.js'
import { printJson } from '../../utils.js'
import {
  formatCount,
  formatPercent,
  printLimitedTable,
  printReportSummary,
  truncate,
} from '../output.js'

export const aiReferralsCommand = defineCommand({
  meta: {
    name: 'ai-referrals',
    description: 'Find AI referral traffic detected in Google Analytics',
  },
  args: {
    property: {
      type: 'string',
      description:
        'Numeric Google Analytics property ID. Run `seo analytics google properties` to list them.',
    },
    'start-date': { type: 'string', default: '28daysAgo' },
    'end-date': { type: 'string', default: 'yesterday' },
    'max-rows': {
      type: 'string',
      description:
        'Maximum Google Analytics rows per query. Defaults to 100000.',
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
      description: 'Bypass cached Google Analytics responses.',
    },
    json: { type: 'boolean', default: false },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const property = requireGoogleAnalyticsProperty(stringArg(args.property))
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

    printReportSummary({
      title: 'AI referral report',
      target: report.property,
      status: report.dataStatus === 'complete' ? 'info' : 'unknown',
      summary: report.summary.verdict,
      metrics: [
        {
          label: 'Evidence',
          value: report.dataStatus === 'complete' ? 'Complete' : 'Partial',
          status: report.dataStatus === 'complete' ? 'pass' : 'unknown',
        },
        { label: 'AI sessions', value: formatCount(report.summary.sessions) },
        {
          label: 'AI users',
          value:
            report.summary.totalUsers === null
              ? 'Unavailable'
              : formatCount(report.summary.totalUsers),
        },
        { label: 'Sources', value: formatCount(report.summary.sources) },
        {
          label: 'Landing pages',
          value: formatCount(report.summary.landingPages),
        },
        {
          label: 'Landing-page output',
          value: `${formatCount(report.selection.landingPages.returnedRows)} returned / ${formatCount(report.selection.landingPages.retainedRows)} retained`,
        },
        {
          label: 'Source rows',
          value: formatCount(report.dataSource.sourceDiscovery.returnedRows),
        },
      ],
    })

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
