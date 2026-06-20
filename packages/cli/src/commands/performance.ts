import { performanceAudit } from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, projectArg, stringArg } from '../args.js'
import { resolveClient } from '../selection.js'
import { printJson, printKeyValue } from '../utils.js'
import { printActionDetails, printNotes } from './output.js'

function strategy(value: unknown): 'mobile' | 'desktop' {
  const selected = stringArg(value) ?? 'mobile'
  if (selected !== 'mobile' && selected !== 'desktop') {
    throw new Error('Invalid --strategy. Use mobile or desktop.')
  }
  return selected
}

function metric(value?: { displayValue?: string; value?: number }): string {
  if (!value) return 'not measured'
  return value.displayValue ?? String(value.value ?? 'not measured')
}

export const performanceCommand = defineCommand({
  meta: {
    name: 'perf',
    description: 'Audit page performance with Lighthouse or local fallback',
  },
  subCommands: {
    audit: defineCommand({
      meta: {
        name: 'audit',
        description: 'Run a Lighthouse/Core Web Vitals performance audit',
      },
      args: {
        url: {
          type: 'string',
          description:
            'URL to audit. Defaults to the selected project crawl URL.',
        },
        client: { type: 'string', description: 'Legacy alias for --project.' },
        project: { type: 'string', description: 'Saved project id or name.' },
        strategy: {
          type: 'string',
          default: 'mobile',
          description: 'Audit strategy: mobile or desktop.',
        },
        'lighthouse-bin': {
          type: 'string',
          description:
            'Lighthouse binary path. Defaults to lighthouse on PATH.',
        },
        'crux-key': {
          type: 'string',
          description:
            'Chrome UX Report API key. Defaults to SEO_CRUX_API_KEY.',
        },
        refresh: {
          type: 'boolean',
          default: false,
          description: 'Bypass the local performance report cache.',
        },
        json: { type: 'boolean', default: false },
      },
      run: async ({ args }) => {
        const json = jsonFlag(args)
        const project = await resolveClient({
          client: projectArg(args),
          options: { json },
        })
        const url = stringArg(args.url) ?? project?.startUrl
        if (!url) {
          throw new Error(
            'No URL selected. Pass --url or use --project with a crawl URL.',
          )
        }
        const report = await performanceAudit({
          url,
          strategy: strategy(args.strategy),
          lighthouseBin: stringArg(args['lighthouse-bin']),
          cruxApiKey:
            stringArg(args['crux-key']) ?? process.env.SEO_CRUX_API_KEY,
          refresh: booleanArg(args.refresh),
        })
        if (json) {
          printJson(report)
          return
        }
        printKeyValue([
          ['URL', report.url],
          ['Source', report.source],
          ['Strategy', report.strategy],
          [
            'Score',
            report.score === undefined ? 'unknown' : `${report.score}/100`,
          ],
          ['Grade', report.grade],
          ['Headline', report.headline],
          ['FCP', metric(report.metrics.firstContentfulPaint)],
          ['LCP', metric(report.metrics.largestContentfulPaint)],
          ['TBT', metric(report.metrics.totalBlockingTime)],
          ['CLS', metric(report.metrics.cumulativeLayoutShift)],
          ['Response', metric(report.metrics.responseTime)],
          ['Field data', report.fieldData ? 'attached' : 'not attached'],
        ])
        printActionDetails(
          'Top actions',
          report.topActions.map((action) => ({
            label: action.title,
            action: action.action,
            context: action.plainEnglish,
          })),
        )
        printNotes('Caveats', report.caveats)
      },
    }),
  },
})
