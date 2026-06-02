import { auditPage } from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, stringArg } from '../args.js'
import { printJson, printKeyValue, printTable } from '../utils.js'
import { formatFetchDiagnostics, selectedSiteOrThrow } from './shared.js'

export const auditPageCommand = defineCommand({
  args: {
    url: { type: 'string', required: true },
    site: { type: 'string' },
    client: { type: 'string' },
    json: { type: 'boolean', default: false },
    js: { type: 'boolean', default: false },
    refresh: { type: 'boolean', default: false },
  },
  run: async ({ args }) => {
    const report = await auditPage({
      url: stringArg(args.url) ?? '',
      site: await selectedSiteOrThrow(
        { client: stringArg(args.client), site: stringArg(args.site) },
        {
          json: jsonFlag(args),
          refresh: booleanArg(args.refresh),
        },
      ),
      js: booleanArg(args.js) ? true : 'auto',
      refresh: booleanArg(args.refresh),
    })
    if (jsonFlag(args)) {
      printJson(report)
      return
    }
    printKeyValue([
      ['URL', report.url],
      ['Final URL', report.page.finalUrl],
      ['Title', report.page.title ?? 'missing'],
      ['Meta description', report.page.metaDescription ?? 'missing'],
      ['Word count', String(report.page.wordCount)],
      ['Fetch', formatFetchDiagnostics(report.fetchDiagnostics)],
    ])
    if (report.issues.length) {
      process.stdout.write('\nIssues\n')
      printTable(
        ['Code', 'Severity', 'Principle', 'Detail'],
        report.issues.map((issue) => [
          issue.code,
          issue.severity,
          issue.principle,
          issue.detail,
        ]),
      )
    }
  },
})
