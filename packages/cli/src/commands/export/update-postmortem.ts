import { updatePostmortemCsvFiles, updatePostmortemWorkflow } from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, numberArg, stringArg, projectArg } from '../../args.js'
import { resolveClientSelection } from '../../selection.js'
import { cliReportArgs } from '../report-options.js'
import {
  defaultOutDir,
  exportSelectionArgs,
  outArg,
  printWritten,
  writeCsvFiles,
} from './shared.js'

export const exportUpdatePostmortemCommand = defineCommand({
  meta: {
    name: 'update-postmortem',
    description:
      'Export update postmortem attribution, findings, template movement, and segment movers.',
  },
  args: {
    ...exportSelectionArgs,
    out: outArg('update-postmortem'),
    ...cliReportArgs(
      ['days', 'recentDays', 'limit', 'includeBrand', 'refresh'],
      {
        days: {
          description: 'Diagnosis window length in days. Defaults to 90.',
        },
        limit: {
          description: 'Maximum winners/losers per segment. Defaults to 20.',
        },
      },
    ),
    'known-change': {
      type: 'string',
      description:
        'Manual site-side change to treat as a confounder, for example pruning pages or blocking traffic.',
    },
    'ignore-change-log': {
      type: 'boolean',
      default: false,
      description: 'Do not use saved change-log entries as confounders.',
    },
  },
  run: async ({ args }) => {
    const selection = await resolveClientSelection({
      client: projectArg(args),
      site: stringArg(args.site),
      options: { refresh: booleanArg(args.refresh) },
    })
    const report = await updatePostmortemWorkflow({
      site: selection.site,
      days: numberArg(args.days),
      recentDays: numberArg(args.recent),
      limit: numberArg(args.limit),
      brandTerms: selection.client?.brandTerms,
      includeBrand: booleanArg(args['include-brand']),
      knownConfounders: stringArg(args['known-change'])
        ? [stringArg(args['known-change']) ?? '']
        : undefined,
      includeChangeLog: !booleanArg(args['ignore-change-log']),
      refresh: booleanArg(args.refresh),
    })
    const outDir =
      stringArg(args.out) ??
      defaultOutDir({
        report: 'update-postmortem',
        clientId: selection.client?.id,
        site: selection.site,
      })
    const written = await writeCsvFiles(
      outDir,
      updatePostmortemCsvFiles(report),
    )
    printWritten(outDir, written)
  },
})
