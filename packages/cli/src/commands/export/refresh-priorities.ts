import { refreshPrioritiesCsvFiles, refreshPrioritiesWorkflow } from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, numberArg, projectArg, stringArg } from '../../args.js'
import { resolveClientSelection } from '../../selection.js'
import { cliReportArgs } from '../report-options.js'
import {
  defaultOutDir,
  exportSelectionArgs,
  outArg,
  printWritten,
  writeCsvFiles,
} from './shared.js'

export const exportRefreshPrioritiesCommand = defineCommand({
  meta: {
    name: 'refresh-priorities',
    description:
      'Export the ranked SEO priority queue, score breakdowns, grouped findings, and diagnosis detail CSVs.',
  },
  args: {
    ...exportSelectionArgs,
    out: outArg('refresh-priorities'),
    ...cliReportArgs(
      ['days', 'recentDays', 'limit', 'includeBrand', 'refresh'],
      {
        days: {
          description: 'Diagnosis window length in days. Defaults to 90.',
        },
        limit: {
          description: 'Maximum queue items to export. Defaults to 25.',
        },
      },
    ),
    'ga4-property': {
      type: 'string',
      description:
        'GA4 property ID to use for analytics value. Defaults from the selected project.',
    },
    'verify-content': {
      type: 'boolean',
      default: true,
      description:
        'Verify top opportunities against page title, meta, and content. Defaults to true.',
    },
    'verify-limit': {
      type: 'string',
      description: 'Maximum opportunity URLs to verify. Defaults to 5.',
    },
  },
  run: async ({ args }) => {
    const selection = await resolveClientSelection({
      client: projectArg(args),
      site: stringArg(args.site),
      options: { refresh: booleanArg(args.refresh) },
    })
    const report = await refreshPrioritiesWorkflow({
      site: selection.site,
      days: numberArg(args.days),
      recentDays: numberArg(args.recent),
      limit: numberArg(args.limit),
      brandTerms: selection.client?.brandTerms,
      includeBrand: booleanArg(args['include-brand']),
      ga4PropertyId:
        stringArg(args['ga4-property']) ?? selection.client?.ga4PropertyId,
      verifyContent: booleanArg(args['verify-content']),
      verifyLimit: numberArg(args['verify-limit']),
      refresh: booleanArg(args.refresh),
    })
    const outDir =
      stringArg(args.out) ??
      defaultOutDir({
        report: 'refresh-priorities',
        clientId: selection.client?.id,
        site: selection.site,
      })
    const written = await writeCsvFiles(
      outDir,
      refreshPrioritiesCsvFiles(report),
    )
    printWritten(outDir, written)
  },
})
