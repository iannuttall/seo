import { monthlyReport, reportNarrative } from '@seo/core'
import { defineCommand } from 'citty'
import { resolveClientSelection } from '../selection.js'
import { printJson } from '../utils.js'

const stringArg = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined

const booleanArg = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined

const numberArg = (value: unknown): number | undefined => {
  if (typeof value === 'number') return value
  if (typeof value !== 'string' || !value.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const jsonFlag = (args: Record<string, unknown>): boolean => args.json === true

export const reportNarrativeCommand = defineCommand({
  meta: {
    name: 'report-narrative',
    description: 'Generate a client-ready SEO narrative from diagnosis data',
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
    days: {
      type: 'string',
      description: 'Diagnosis window length in days. Defaults to 90.',
    },
    recent: {
      type: 'string',
      description: 'Recent anomaly window in days. Defaults to 14.',
    },
    'start-date': {
      type: 'string',
      description: 'Optional report start date as YYYY-MM-DD.',
    },
    'end-date': {
      type: 'string',
      description: 'Optional report end date as YYYY-MM-DD.',
    },
    limit: {
      type: 'string',
      description: 'Maximum rows per diagnostic section. Defaults to 10.',
    },
    'change-limit': {
      type: 'string',
      description: 'Maximum saved changes to measure. Defaults to 5.',
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
    const report = await reportNarrative({
      site: selection.site,
      days: numberArg(args.days),
      recentDays: numberArg(args.recent),
      startDate: stringArg(args['start-date']),
      endDate: stringArg(args['end-date']),
      limit: numberArg(args.limit),
      changeLimit: numberArg(args['change-limit']),
      refresh: booleanArg(args.refresh),
    })

    if (json) {
      printJson(report)
      return
    }
    process.stdout.write(`${report.markdown}\n`)
  },
})

export const monthlyReportCommand = defineCommand({
  meta: {
    name: 'monthly-report',
    description: 'Generate a monthly SEO report narrative',
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
    month: {
      type: 'string',
      description:
        'Report month as YYYY-MM. Defaults to the latest month with final GSC data.',
    },
    limit: {
      type: 'string',
      description: 'Maximum rows per diagnostic section. Defaults to 10.',
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
    const report = await monthlyReport({
      site: selection.site,
      month: stringArg(args.month),
      limit: numberArg(args.limit),
      refresh: booleanArg(args.refresh),
    })

    if (json) {
      printJson(report)
      return
    }
    process.stdout.write(`${report.markdown}\n`)
  },
})
