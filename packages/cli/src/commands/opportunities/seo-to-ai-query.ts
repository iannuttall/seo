import { seoToAiQueryReport } from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  csvArg,
  jsonFlag,
  projectArg,
  strictNumberArg,
  stringArg,
} from '../../args.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson } from '../../utils.js'
import {
  formatCount,
  printLimitedTable,
  printNotes,
  printReportSummary,
  truncate,
} from '../output.js'
import { cliReportArgs } from '../report-options.js'

export const seoToAiQueryCommand = defineCommand({
  meta: {
    name: 'seo-to-ai-query',
    description: 'Convert GSC search queries into AI-style monitoring prompts',
  },
  args: {
    site: { type: 'string' },
    project: { type: 'string', description: 'Saved project id or name.' },
    client: { type: 'string', description: 'Legacy alias for --project.' },
    'start-date': {
      type: 'string',
      description: 'Exact GSC start date (YYYY-MM-DD). Use with --end-date.',
    },
    'end-date': {
      type: 'string',
      description: 'Exact GSC end date (YYYY-MM-DD). Use with --start-date.',
    },
    'max-rows': {
      type: 'string',
      description: 'Maximum retained GSC query rows. Defaults to 50000.',
    },
    'brand-terms': {
      type: 'string',
      description: 'Comma-separated brand terms to exclude.',
    },
    ...cliReportArgs(
      ['days', 'limit', 'minImpressions', 'includeBrand', 'refresh'],
      {
        days: {
          description: 'GSC lookback within the current 16-month retention.',
        },
        limit: {
          description: 'Maximum source queries to convert. Defaults to 25.',
        },
        minImpressions: {
          description: 'Minimum query impressions. Defaults to 20.',
        },
        includeBrand: {
          description: 'Include branded queries in prompt generation.',
        },
        refresh: { description: 'Bypass local GSC cache.' },
      },
    ),
    json: { type: 'boolean', default: false },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const selection = await resolveClientSelection({
      client: projectArg(args),
      site: stringArg(args.site),
      options: { json, refresh: booleanArg(args.refresh) },
    })
    const report = await seoToAiQueryReport({
      site: selection.site,
      days: strictNumberArg(args.days, '--days'),
      startDate: stringArg(args['start-date']),
      endDate: stringArg(args['end-date']),
      limit: strictNumberArg(args.limit, '--limit'),
      minImpressions: strictNumberArg(
        args['min-impressions'],
        '--min-impressions',
      ),
      maxRows: strictNumberArg(args['max-rows'], '--max-rows'),
      brandTerms: [
        ...(selection.client?.brandTerms ?? []),
        ...(csvArg(args['brand-terms']) ?? []),
      ],
      includeBrand: booleanArg(args['include-brand']),
      refresh: booleanArg(args.refresh),
    })

    if (json) {
      printJson(report)
      return
    }

    printReportSummary({
      title: 'SEO to AI query prompts',
      target: report.site,
      status:
        report.dataStatus === 'available' || report.dataStatus === 'empty'
          ? 'info'
          : 'unknown',
      summary: report.summary.verdict,
      metrics: [
        { label: 'Evidence', value: report.dataStatus },
        {
          label: 'Eligible queries',
          value: formatCount(report.summary.eligibleQueries),
        },
        {
          label: 'Returned queries',
          value: formatCount(report.summary.returnedQueries),
        },
        { label: 'Prompts', value: formatCount(report.summary.prompts) },
        { label: 'GSC completeness', value: report.source.completeness },
      ],
    })

    printLimitedTable(
      ['Query', 'Impr', 'Prompt'],
      report.items.flatMap((item) =>
        item.prompts.map((prompt) => [
          truncate(item.query, 42),
          formatCount(item.impressions),
          truncate(prompt, 86),
        ]),
      ),
    )
    printNotes('Report caveats', report.caveats)
    printNotes('Warnings', report.warnings)
  },
})
