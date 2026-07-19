import { diagnoseProperty } from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  jsonFlag,
  numberArg,
  projectArg,
  stringArg,
} from '../../args.js'
import { createProgressReporter } from '../../progress.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson, printTable } from '../../utils.js'
import { printActionDetails, printReportSummary } from '../output.js'
import { cliReportArgs } from '../report-options.js'

export const diagnoseCommand = defineCommand({
  meta: {
    name: 'diagnose',
    description: 'Find where Google Search performance changed',
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
          description: 'Baseline window length in days. Defaults to 90.',
        },
        limit: {
          description: 'Maximum rows per diagnostic section. Defaults to 10.',
        },
      },
    ),
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
    const report = await diagnoseProperty({
      site: selection.site,
      days: numberArg(args.days),
      recentDays: numberArg(args.recent),
      limit: numberArg(args.limit),
      brandTerms: selection.client?.brandTerms,
      includeBrand: booleanArg(args['include-brand']),
      refresh: booleanArg(args.refresh),
      progress: createProgressReporter(!json),
    })
    if (json) {
      printJson(report)
      return
    }
    printReportSummary({
      title: 'SEO diagnosis',
      target: report.site,
      status:
        report.dataStatus === 'complete'
          ? report.priorities.length > 0
            ? 'warning'
            : 'pass'
          : 'unknown',
      summary:
        report.priorities.length > 0
          ? `${report.priorities.length} priorities need review.`
          : 'No priorities were returned by the available evidence.',
      metrics: [
        { label: 'Evidence', value: report.dataStatus },
        {
          label: 'Update overlap',
          value: report.summary.updateAttribution.replaceAll('-', ' '),
        },
        {
          label: 'Significant anomalies',
          value: report.summary.significantAnomalies,
        },
        { label: 'Update matches', value: report.summary.updateMatches },
        { label: 'Decay items', value: report.summary.decayItems },
        { label: 'Cannibal items', value: report.summary.cannibalItems },
        {
          label: 'Striking distance',
          value: report.summary.strikingDistanceItems,
        },
        { label: 'Quick wins', value: report.summary.quickWinItems },
      ],
    })
    printTable(
      ['Priority', 'Confidence', 'Reason', 'Action'],
      report.priorities.map((priority) => [
        priority.label,
        priority.confidence,
        priority.reason,
        priority.action,
      ]),
    )
    if (report.skippedSections?.length) {
      printTable(
        ['Skipped section', 'Reason'],
        report.skippedSections.map((section) => [
          section.section,
          section.reason,
        ]),
      )
    }
    printActionDetails(
      'Priority action details',
      report.priorities.map((priority) => ({
        label: priority.label,
        context: priority.confidence,
        action: priority.action,
      })),
    )
  },
})
