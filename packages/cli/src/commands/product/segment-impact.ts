import { type SegmentDimension, segmentImpact } from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, numberArg, stringArg } from '../../args.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson, printKeyValue, printTable } from '../../utils.js'

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
      description: 'Saved client id or name.',
    },
    dimension: {
      type: 'string',
      default: 'page',
      description: 'Segment by page, query, country, or device.',
    },
    days: {
      type: 'string',
      description: 'Recent window length in days. Defaults to 28.',
    },
    compare: {
      type: 'string',
      description:
        'Previous comparison window length in days. Defaults to days.',
    },
    limit: {
      type: 'string',
      description: 'Maximum segment rows to print. Defaults to 25.',
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
    const report = await segmentImpact({
      site: selection.site,
      dimension: segmentDimension(args.dimension),
      days: numberArg(args.days),
      compareDays: numberArg(args.compare),
      limit: numberArg(args.limit),
      refresh: booleanArg(args.refresh),
    })
    if (json) {
      printJson(report)
      return
    }
    printKeyValue([
      ['Property', report.site],
      ['Dimension', report.dimension],
      ['Before', `${report.before.startDate} to ${report.before.endDate}`],
      ['After', `${report.after.startDate} to ${report.after.endDate}`],
    ])
    printTable(
      ['Segment', 'Clicks before', 'Clicks after', 'Delta', 'Pos delta'],
      report.items.map((item) => [
        item.key,
        item.beforeClicks,
        item.afterClicks,
        item.clickDelta,
        item.positionDelta,
      ]),
    )
  },
})
