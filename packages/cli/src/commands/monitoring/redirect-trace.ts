import { redirectTrace } from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, numberArg, stringArg } from '../../args.js'
import { printJson, printKeyValue, printTable } from '../../utils.js'
import { truncate } from '../output.js'

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

    printKeyValue([
      ['URL', report.url],
      ['Final URL', report.finalUrl],
      ['Final status', String(report.summary.finalStatus)],
      [
        'Indexable',
        report.summary.finalIndexable === undefined
          ? 'unknown'
          : report.summary.finalIndexable
            ? 'yes'
            : 'no',
      ],
      ['Hops', String(report.summary.hops)],
      [
        'Issues',
        report.summary.issues.length
          ? report.summary.issues.join(', ')
          : 'none',
      ],
    ])
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
    if (report.warnings.length) {
      process.stdout.write('\nWarnings\n')
      for (const warning of report.warnings.slice(0, 10)) {
        process.stdout.write(`- ${warning}\n`)
      }
    }
  },
})
