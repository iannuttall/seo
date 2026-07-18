import { monthlyReport } from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag, numberArg, stringArg } from '../../args.js'
import { createProgressReporter } from '../../progress.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson } from '../../utils.js'
import { printNextCommand } from '../output.js'
import {
  printReportHtmlPath,
  reportHtmlArgs,
  reportHtmlOptions,
  writeReportHtml,
} from '../report-html.js'
import { cliReportArgs } from '../report-options.js'
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
    ...cliReportArgs(['limit'], {
      limit: {
        description: 'Maximum rows per diagnostic section. Defaults to 10.',
      },
    }),
    ...reportFetchArgs,
    ...reportHtmlArgs,
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const html = reportHtmlOptions(args)
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
      progress: createProgressReporter(!json),
    })

    if (json) {
      printJson(report)
      return
    }
    if (html) {
      const path = await writeReportHtml({
        report,
        reportName: 'monthly-report',
        title: `Monthly SEO report for ${report.month}`,
        options: html,
        projectId: selection.client?.id,
      })
      printReportHtmlPath(path)
      return
    }
    process.stdout.write(`${report.markdown}\n`)
    const target = selection.client
      ? `--project ${JSON.stringify(selection.client.id)}`
      : `--site ${JSON.stringify(selection.site)}`
    const month = stringArg(args.month)
    process.stdout.write('\n')
    printNextCommand(
      `seo export monthly ${target}${month ? ` --month ${JSON.stringify(month)}` : ''}`,
    )
  },
})
