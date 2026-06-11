import { narrativeCsvFiles, reportNarrative } from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, numberArg, stringArg, projectArg } from '../../args.js'
import { createProgressReporter } from '../../progress.js'
import { resolveClientSelection } from '../../selection.js'
import { cliReportArgs } from '../report-options.js'
import { reportFetchOptions } from '../reports/args.js'
import {
  defaultOutDir,
  exportReportFetchArgs,
  exportSelectionArgs,
  outArg,
  printWritten,
  writeCsvFiles,
} from './shared.js'

export const exportNarrativeCommand = defineCommand({
  meta: {
    name: 'narrative',
    description:
      'Export report narrative tables plus the underlying diagnosis detail CSVs.',
  },
  args: {
    ...exportSelectionArgs,
    out: outArg('narrative'),
    ...cliReportArgs(['days', 'recentDays'], {
      days: {
        description: 'Diagnosis window length in days. Defaults to 90.',
      },
    }),
    'start-date': {
      type: 'string',
      description: 'Optional report start date as YYYY-MM-DD.',
    },
    'end-date': {
      type: 'string',
      description: 'Optional report end date as YYYY-MM-DD.',
    },
    ...cliReportArgs(['limit'], {
      limit: {
        description: 'Maximum rows per diagnostic section. Defaults to 10.',
      },
    }),
    'change-limit': {
      type: 'string',
      description: 'Maximum saved changes to measure. Defaults to 5.',
    },
    ...exportReportFetchArgs,
  },
  run: async ({ args }) => {
    const selection = await resolveClientSelection({
      client: projectArg(args),
      site: stringArg(args.site),
      options: { refresh: booleanArg(args.refresh) },
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
      ...reportFetchOptions(args),
      progress: createProgressReporter(true),
    })
    const outDir =
      stringArg(args.out) ??
      defaultOutDir({
        report: 'narrative',
        clientId: selection.client?.id,
        site: selection.site,
      })
    const written = await writeCsvFiles(outDir, narrativeCsvFiles(report))
    printWritten(outDir, written)
  },
})
