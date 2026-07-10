import { type SegmentDimension, segmentImpact } from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  jsonFlag,
  projectArg,
  strictNumberArg,
  stringArg,
} from '../../args.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson, printKeyValue, printTable } from '../../utils.js'
import { printNotes } from '../output.js'
import { cliReportArgs } from '../report-options.js'

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
    client: {
      type: 'string',
      description: 'Legacy alias for --project.',
    },
    project: {
      type: 'string',
      description: 'Saved project id or name.',
    },
    dimension: {
      type: 'string',
      default: 'page',
      description: 'Segment by page, query, country, or device.',
    },
    ...cliReportArgs(['days', 'limit', 'refresh'], {
      days: {
        description: 'Recent window length from 1 to 240 days. Defaults to 28.',
      },
      limit: {
        description: 'Maximum segment rows to print. Defaults to 25.',
      },
      refresh: {
        description: 'Bypass local cache and fetch fresh GSC data.',
      },
    }),
    compare: {
      type: 'string',
      description:
        'Legacy 1-240 day comparison length. Must equal the current window.',
    },
    'start-date': {
      type: 'string',
      description: 'Exact current-window start date in YYYY-MM-DD format.',
    },
    'end-date': {
      type: 'string',
      description: 'Exact current-window end date in YYYY-MM-DD format.',
    },
    'max-rows': {
      type: 'string',
      description: 'Maximum retained GSC rows per window. Defaults to 100000.',
    },
    'unmatched-limit': {
      type: 'string',
      description:
        'Maximum one-window evidence rows to return. Defaults to 25.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const dimension = segmentDimension(args.dimension)
    const days = strictNumberArg(args.days, '--days')
    const compareDays = strictNumberArg(args.compare, '--compare')
    const limit = strictNumberArg(args.limit, '--limit')
    const unmatchedLimit = strictNumberArg(
      args['unmatched-limit'],
      '--unmatched-limit',
    )
    const maxRows = strictNumberArg(args['max-rows'], '--max-rows')
    const selection = await resolveClientSelection({
      client: projectArg(args),
      site: stringArg(args.site),
      options: { json, refresh: booleanArg(args.refresh) },
    })
    const report = await segmentImpact({
      site: selection.site,
      dimension,
      days,
      compareDays,
      startDate: stringArg(args['start-date']),
      endDate: stringArg(args['end-date']),
      limit,
      unmatchedLimit,
      maxRows,
      refresh: booleanArg(args.refresh),
    })
    if (json) {
      printJson(report)
      return
    }
    printKeyValue([
      ['Property', report.site],
      ['Dimension', report.dimension],
      ['Status', report.dataStatus],
      ['Before', `${report.before.startDate} to ${report.before.endDate}`],
      ['After', `${report.after.startDate} to ${report.after.endDate}`],
      ['Verdict', report.summary.verdict],
    ])
    printTable(
      ['Segment', 'Clicks before', 'Clicks after', 'Delta', 'Pos delta'],
      report.items.map((item) => [
        item.key,
        item.beforeClicks,
        item.afterClicks,
        item.clickDelta,
        item.positionDelta ?? '-',
      ]),
    )
    if (report.unmatchedSegments.length) {
      process.stdout.write('\nOne-window evidence (not treated as zero)\n')
      printTable(
        ['Segment', 'Retained in', 'Clicks', 'Impressions'],
        report.unmatchedSegments.map((item) => [
          item.key,
          item.retainedIn,
          item.clicks,
          item.impressions,
        ]),
      )
    }
    printNotes('Warnings', report.warnings)
  },
})
