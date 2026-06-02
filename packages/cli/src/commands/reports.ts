import { monthlyReport, reportNarrative } from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  fetchRateArg,
  jsonFlag,
  numberArg,
  stringArg,
} from '../args.js'
import { resolveClientSelection } from '../selection.js'
import { printJson } from '../utils.js'

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
    'include-brand': {
      type: 'boolean',
      default: false,
      description: 'Include branded queries in opportunity reports.',
    },
    'verify-content': {
      type: 'boolean',
      default: false,
      description:
        'Verify top quick wins against page title, meta, and content.',
    },
    'verify-limit': {
      type: 'string',
      description: 'Maximum quick-win URLs to verify. Defaults to 3.',
    },
    js: {
      type: 'boolean',
      default: false,
      description: 'Force JavaScript rendering for verified pages.',
    },
    'fetch-concurrency': {
      type: 'string',
      description: 'Maximum concurrent page fetches per host. Defaults to 4.',
    },
    'fetch-interval-cap': {
      type: 'string',
      description: 'Maximum page fetches per interval per host. Defaults to 4.',
    },
    'fetch-interval-ms': {
      type: 'string',
      description: 'Fetch rate interval in milliseconds. Defaults to 1000.',
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
      brandTerms: selection.client?.brandTerms,
      includeBrand: booleanArg(args['include-brand']),
      verifyContent: booleanArg(args['verify-content']),
      verifyLimit: numberArg(args['verify-limit']) ?? 3,
      js: booleanArg(args.js) ? true : undefined,
      rate: fetchRateArg(args),
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
    'include-brand': {
      type: 'boolean',
      default: false,
      description: 'Include branded queries in opportunity reports.',
    },
    'verify-content': {
      type: 'boolean',
      default: false,
      description:
        'Verify top quick wins against page title, meta, and content.',
    },
    'verify-limit': {
      type: 'string',
      description: 'Maximum quick-win URLs to verify. Defaults to 3.',
    },
    js: {
      type: 'boolean',
      default: false,
      description: 'Force JavaScript rendering for verified pages.',
    },
    'fetch-concurrency': {
      type: 'string',
      description: 'Maximum concurrent page fetches per host. Defaults to 4.',
    },
    'fetch-interval-cap': {
      type: 'string',
      description: 'Maximum page fetches per interval per host. Defaults to 4.',
    },
    'fetch-interval-ms': {
      type: 'string',
      description: 'Fetch rate interval in milliseconds. Defaults to 1000.',
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
      brandTerms: selection.client?.brandTerms,
      includeBrand: booleanArg(args['include-brand']),
      verifyContent: booleanArg(args['verify-content']),
      verifyLimit: numberArg(args['verify-limit']) ?? 3,
      js: booleanArg(args.js) ? true : undefined,
      rate: fetchRateArg(args),
      refresh: booleanArg(args.refresh),
    })

    if (json) {
      printJson(report)
      return
    }
    process.stdout.write(`${report.markdown}\n`)
  },
})
