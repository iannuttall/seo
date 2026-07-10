import { updatePostmortemWorkflow } from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  jsonFlag,
  numberArg,
  projectArg,
  stringArg,
} from '../../args.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson, printKeyValue, printTable } from '../../utils.js'
import { printNextCommand, printNotes } from '../output.js'
import { cliReportArgs } from '../report-options.js'

type SegmentSplit = Awaited<
  ReturnType<typeof updatePostmortemWorkflow>
>['output']['segments']['page']

function formatNumber(value: number | null): string {
  if (value === null) return '-'
  return value.toLocaleString('en-GB', {
    maximumFractionDigits: value >= 100 ? 0 : 1,
  })
}

function segmentRows(split: SegmentSplit) {
  return [
    ...split.winners.map((item) => ({ direction: 'winner', item })),
    ...split.losers.map((item) => ({ direction: 'loser', item })),
  ]
}

function printSegmentTable(label: string, split: SegmentSplit): void {
  const rows = segmentRows(split)
  if (!rows.length) return
  process.stdout.write(`\n${label}\n`)
  printTable(
    ['Direction', 'Key', 'Clicks', 'Impr.', 'Position'],
    rows.map(({ direction, item }) => [
      direction,
      item.key,
      formatNumber(item.clickDelta),
      formatNumber(item.impressionDelta),
      formatNumber(item.positionDelta),
    ]),
  )
}

type TemplateMovement = Awaited<
  ReturnType<typeof updatePostmortemWorkflow>
>['output']['templateMovement'][number]

function printTemplateMovement(items: TemplateMovement[]): void {
  if (!items.length) return
  process.stdout.write('\nTemplate movement\n')
  printTable(
    [
      'Direction',
      'Template',
      'Confidence',
      'URLs',
      'Clicks',
      'Share',
      'Common terms',
    ],
    items.map((item) => [
      item.direction,
      item.signature,
      item.confidence,
      item.urlCount,
      formatNumber(item.clickDelta),
      `${Math.round(item.movementShare * 100)}%`,
      item.commonTerms.join(', ') || '-',
    ]),
  )
  printNotes(
    'Template actions',
    items.map((item) => item.summary),
  )
}

export const updatePostmortemCommand = defineCommand({
  meta: {
    name: 'update-postmortem',
    description: 'Agent workflow for Google update winner/loser analysis',
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
    ...cliReportArgs(
      ['days', 'recentDays', 'limit', 'includeBrand', 'refresh'],
      {
        days: {
          description: 'Diagnosis window length in days. Defaults to 90.',
        },
        limit: {
          description: 'Maximum winners/losers per segment. Defaults to 20.',
        },
      },
    ),
    'known-change': {
      type: 'string',
      description:
        'Manual site-side change to treat as a confounder, for example pruning pages or blocking traffic.',
    },
    'ignore-change-log': {
      type: 'boolean',
      default: false,
      description: 'Do not use saved change-log entries as confounders.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const selection = await resolveClientSelection({
      client: projectArg(args),
      site: stringArg(args.site),
      options: { json, refresh: booleanArg(args.refresh) },
    })
    const report = await updatePostmortemWorkflow({
      site: selection.site,
      days: numberArg(args.days),
      recentDays: numberArg(args.recent),
      limit: numberArg(args.limit),
      brandTerms: selection.client?.brandTerms,
      includeBrand: booleanArg(args['include-brand']),
      knownConfounders: stringArg(args['known-change'])
        ? [stringArg(args['known-change']) ?? '']
        : undefined,
      includeChangeLog: !booleanArg(args['ignore-change-log']),
      refresh: booleanArg(args.refresh),
    })
    if (json) {
      printJson(report)
      return
    }
    printKeyValue([
      ['Workflow', report.workflow],
      ['Property', report.site],
      ['Summary', report.summary],
      [
        'Causal attribution',
        report.output.update.attribution.replaceAll('-', ' '),
      ],
      ['Confidence', report.output.update.confidence],
      ['Known confounders', String(report.output.update.confounders.length)],
    ])
    printNotes(
      'Recommended actions',
      report.actions.map(
        (action) => `${action.title} (${action.confidence}): ${action.action}`,
      ),
    )
    printNotes(
      'Postmortem findings',
      report.output.insights.map((insight) => insight.summary),
    )
    printNotes(
      'Segment evidence warnings',
      [
        ...report.output.segments.page.warnings,
        ...report.output.segments.query.warnings,
        ...report.output.segments.device.warnings,
        ...report.output.segments.country.warnings,
      ].filter(
        (warning, index, warnings) => warnings.indexOf(warning) === index,
      ),
    )
    printTemplateMovement(report.output.templateMovement)
    printNotes('Update evidence', report.output.update.evidence)
    printSegmentTable('Page winners and losers', report.output.segments.page)
    printSegmentTable('Query winners and losers', report.output.segments.query)
    printSegmentTable(
      'Device winners and losers',
      report.output.segments.device,
    )
    printSegmentTable(
      'Country winners and losers',
      report.output.segments.country,
    )
    const target = selection.client
      ? `--project ${JSON.stringify(selection.client.id)}`
      : `--site ${JSON.stringify(selection.site)}`
    printNextCommand(`seo export update-postmortem ${target}`)
  },
})
