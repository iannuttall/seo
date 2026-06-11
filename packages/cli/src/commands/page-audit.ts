import { auditPage } from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, stringArg, projectArg } from '../args.js'
import { printJson, printKeyValue, printTable } from '../utils.js'
import { formatFetchDiagnostics, selectedSiteOrThrow } from './shared.js'

export const auditPageCommand = defineCommand({
  meta: {
    name: 'audit-page',
    description:
      'Fetch one page and audit title, metadata, content, links, and schema',
  },
  args: {
    url: { type: 'string', required: true, description: 'URL to audit.' },
    site: {
      type: 'string',
      description: 'GSC property URL, for example sc-domain:example.com.',
    },
    client: {
      type: 'string',
      description: 'Legacy alias for --project.',
    },
    project: {
      type: 'string',
      description: 'Saved project id or name.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
    js: {
      type: 'boolean',
      default: false,
      description: 'Force JavaScript rendering for extraction.',
    },
    refresh: {
      type: 'boolean',
      default: false,
      description: 'Bypass local HTTP cache.',
    },
  },
  run: async ({ args }) => {
    const report = await auditPage({
      url: stringArg(args.url) ?? '',
      site: await selectedSiteOrThrow(
        { client: projectArg(args), site: stringArg(args.site) },
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
