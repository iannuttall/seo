import { reportNarrative } from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag, numberArg, stringArg } from '../../args.js'
import { createProgressReporter } from '../../progress.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson } from '../../utils.js'
import { printNextCommand } from '../output.js'
import { cliReportArgs } from '../report-options.js'
import {
  reportFetchArgs,
  reportFetchOptions,
  reportSelectionArgs,
  reportSelectionInput,
} from './args.js'

export const reportNarrativeCommand = defineCommand({
  meta: {
    name: 'report-narrative',
    description: 'Generate a client-ready SEO narrative from diagnosis data',
  },
  args: {
    ...reportSelectionArgs,
    ...cliReportArgs(['days', 'recentDays'], {
      days: { description: 'Diagnosis window length in days. Defaults to 90.' },
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
    ...reportFetchArgs,
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const selectionInput = reportSelectionInput(args)
    const selection = await resolveClientSelection({
      client: selectionInput.client,
      site: selectionInput.site,
      options: { json, refresh: selectionInput.refresh },
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
      progress: createProgressReporter(!json),
    })

    if (json) {
      printJson(report)
      return
    }
    process.stdout.write(`${report.markdown}\n`)
    const target = selection.client
      ? `--project ${JSON.stringify(selection.client.id)}`
      : `--site ${JSON.stringify(selection.site)}`
    process.stdout.write('\n')
    printNextCommand(`seo export narrative ${target}`)
  },
})
