import { monthlyReport } from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag, numberArg, stringArg } from '../../args.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson } from '../../utils.js'
import {
  reportFetchArgs,
  reportFetchOptions,
  reportSelectionArgs,
  reportSelectionInput,
} from './args.js'

export const monthlyReportCommand = defineCommand({
  meta: {
    name: 'monthly-report',
    description: 'Generate a monthly SEO report narrative',
  },
  args: {
    ...reportSelectionArgs,
    month: {
      type: 'string',
      description:
        'Report month as YYYY-MM. Defaults to the latest month with final GSC data.',
    },
    limit: {
      type: 'string',
      description: 'Maximum rows per diagnostic section. Defaults to 10.',
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
    const report = await monthlyReport({
      site: selection.site,
      month: stringArg(args.month),
      limit: numberArg(args.limit),
      brandTerms: selection.client?.brandTerms,
      ...reportFetchOptions(args),
    })

    if (json) {
      printJson(report)
      return
    }
    process.stdout.write(`${report.markdown}\n`)
  },
})
