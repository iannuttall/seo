import { redirectTrace } from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, numberArg, stringArg } from '../../args.js'
import { printJson, printKeyValue, printTable } from '../../utils.js'
import { printNotes, printReportSummary, truncate } from '../output.js'

export const redirectTraceCommand = defineCommand({
  meta: {
    name: 'redirect-trace',
    description:
      'Trace redirects and report final indexability/canonical issues',
  },
  args: {
    url: {
      type: 'string',
      required: true,
      description: 'URL to trace.',
    },
    'max-hops': {
      type: 'string',
      description: 'Maximum redirect hops to follow. Defaults to 10.',
    },
    refresh: {
      type: 'boolean',
      default: false,
      description: 'Bypass local HTTP cache for final page extraction.',
    },
    js: {
      type: 'boolean',
      default: false,
      description: 'Force JavaScript rendering for final page extraction.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const report = await redirectTrace({
      url: stringArg(args.url) ?? '',
      maxHops: numberArg(args['max-hops']),
      refresh: booleanArg(args.refresh),
      js: booleanArg(args.js) ? true : 'auto',
    })
    if (jsonFlag(args)) {
      printJson(report)
      return
    }

    printReportSummary({
      title: 'Redirect trace',
      target: report.url,
      status:
        report.summary.issues.length > 0
          ? 'warning'
          : report.summary.finalIndexable === undefined
            ? 'unknown'
            : 'pass',
      summary:
        report.summary.issues.length > 0
          ? report.summary.issues.join(', ')
          : `${report.summary.hops} redirect hops ended at HTTP ${report.summary.finalStatus}.`,
      metrics: [
        { label: 'Final URL', value: report.finalUrl },
        { label: 'Final status', value: report.summary.finalStatus },
        {
          label: 'Indexable',
          value:
            report.summary.finalIndexable === undefined
              ? 'Unknown'
              : report.summary.finalIndexable
                ? 'Yes'
                : 'No',
        },
        { label: 'Hops', value: report.summary.hops },
      ],
    })
    printTable(
      ['#', 'Status', 'URL', 'Next'],
      report.chain.map((step, index) => [
        index + 1,
        step.status,
        truncate(step.url, 72),
        truncate(step.nextUrl ?? '-', 72),
      ]),
    )
    if (report.finalPage) {
      process.stdout.write('\nFinal page\n')
      printKeyValue([
        ['Title', report.finalPage.title ?? '-'],
        ['Canonical', report.finalPage.canonical ?? '-'],
        ['Meta robots', report.finalPage.metaRobots ?? '-'],
      ])
    }
    printNotes('Warnings', report.warnings.slice(0, 10))
  },
})
