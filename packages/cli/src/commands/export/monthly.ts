import { monthlyReport, narrativeCsvFiles } from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, numberArg, stringArg } from '../../args.js'
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

export const exportMonthlyCommand = defineCommand({
  meta: {
    name: 'monthly',
    description:
      'Export monthly report tables plus the underlying diagnosis detail CSVs.',
  },
  args: {
    ...exportSelectionArgs,
    out: outArg('monthly'),
    month: {
      type: 'string',
      description:
        'Report month as YYYY-MM. Defaults to the latest month with final GSC data.',
    },
    ...cliReportArgs(['limit'], {
      limit: {
        description: 'Maximum rows per diagnostic section. Defaults to 10.',
      },
    }),
    ...exportReportFetchArgs,
  },
  run: async ({ args }) => {
    const selection = await resolveClientSelection({
      client: stringArg(args.client),
      site: stringArg(args.site),
      options: { refresh: booleanArg(args.refresh) },
    })
    const report = await monthlyReport({
      site: selection.site,
      month: stringArg(args.month),
      limit: numberArg(args.limit),
      brandTerms: selection.client?.brandTerms,
      ...reportFetchOptions(args),
      progress: createProgressReporter(true),
    })
    const outDir =
      stringArg(args.out) ??
      defaultOutDir({
        report: 'monthly',
        clientId: selection.client?.id,
        site: selection.site,
      })
    const written = await writeCsvFiles(outDir, narrativeCsvFiles(report))
    printWritten(outDir, written)
  },
})
