import { performanceAudit, SeoError } from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, projectArg, stringArg } from '../args.js'
import { resolveClient } from '../selection.js'
import { printJson } from '../utils.js'
import { printActionDetails, printNotes, printReportSummary } from './output.js'

function strategy(value: unknown): 'mobile' | 'desktop' {
  const selected = stringArg(value) ?? 'mobile'
  if (selected !== 'mobile' && selected !== 'desktop') {
    throw new SeoError(
      'INVALID_INPUT',
      'Invalid --strategy. Use mobile or desktop.',
    )
  }
  return selected
}

function metric(value?: { displayValue?: string; value?: number }): string {
  if (!value) return 'not measured'
  return value.displayValue ?? String(value.value ?? 'not measured')
}

function fieldMetric(value?: {
  p75: number
  rating: string
  unit: 'milliseconds' | 'score'
}): string {
  if (!value) return 'not available'
  const suffix = value.unit === 'milliseconds' ? 'ms' : ''
  return `${value.p75}${suffix} (${value.rating})`
}

export const performanceCommand = defineCommand({
  meta: {
    name: 'perf',
    description: 'Audit lab performance and field Core Web Vitals',
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
            'Custom Lighthouse binary path. Defaults to the bundled version.',
        },
        'crux-key': {
          type: 'string',
          description:
            'CrUX API key. Prefer SEO_CRUX_API_KEY to avoid shell history.',
        },
        raw: {
          type: 'boolean',
          default: false,
          description: 'Include the full Lighthouse JSON in JSON output.',
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
          cruxApiKey: stringArg(args['crux-key']),
          refresh: booleanArg(args.refresh),
          includeRaw: json && booleanArg(args.raw),
        })
        if (json) {
          printJson(report)
          return
        }
        printReportSummary({
          title: 'Performance report',
          target: report.url,
          status:
            report.dataStatus === 'partial'
              ? 'unknown'
              : report.grade === 'good'
                ? 'pass'
                : 'warning',
          summary: report.headline,
          metrics: [
            { label: 'Source', value: report.source },
            { label: 'Strategy', value: report.strategy },
            {
              label: 'Lab score',
              value:
                report.score === undefined ? 'Unknown' : `${report.score}/100`,
            },
            { label: 'Lab grade', value: report.grade },
            { label: 'Evidence', value: report.dataStatus },
            {
              label: 'FCP',
              value: metric(report.metrics.firstContentfulPaint),
            },
            {
              label: 'LCP',
              value: metric(report.metrics.largestContentfulPaint),
            },
            { label: 'TBT', value: metric(report.metrics.totalBlockingTime) },
            {
              label: 'CLS',
              value: metric(report.metrics.cumulativeLayoutShift),
            },
            {
              label: 'INP',
              value: metric(report.metrics.interactionToNextPaint),
            },
            {
              label: 'Server response',
              value: metric(report.metrics.serverResponseTime),
            },
            {
              label: 'Fallback fetch',
              value: metric(report.metrics.fallbackFetchDuration),
            },
            {
              label: 'Field data',
              value: report.fieldData
                ? `${report.fieldData.scope} ${report.fieldData.formFactor.toLowerCase()} (${report.fieldData.assessment.status})`
                : report.fieldDataStatus.status,
            },
            {
              label: 'Field LCP p75',
              value: fieldMetric(
                report.fieldData?.metrics.largestContentfulPaint,
              ),
            },
            {
              label: 'Field INP p75',
              value: fieldMetric(
                report.fieldData?.metrics.interactionToNextPaint,
              ),
            },
            {
              label: 'Field CLS p75',
              value: fieldMetric(
                report.fieldData?.metrics.cumulativeLayoutShift,
              ),
            },
            {
              label: 'Field period',
              value:
                report.fieldData?.collectionPeriod?.firstDate &&
                report.fieldData.collectionPeriod.lastDate
                  ? `${report.fieldData.collectionPeriod.firstDate} to ${report.fieldData.collectionPeriod.lastDate}`
                  : 'Unavailable',
            },
          ],
        })
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
