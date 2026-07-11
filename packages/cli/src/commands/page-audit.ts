import { auditPage } from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, projectArg, stringArg } from '../args.js'
import { resolveClient } from '../selection.js'
import { printJson, printKeyValue, printTable } from '../utils.js'
import { formatFetchDiagnostics } from './shared.js'

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
      description:
        'Optional GSC property for page search metrics, for example sc-domain:example.com.',
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
    const project = projectArg(args)
    const explicitSite = stringArg(args.site)
    const selectedProject = project
      ? await resolveClient({ project, options: { json: jsonFlag(args) } })
      : undefined
    const defaultProject =
      project || explicitSite
        ? undefined
        : await resolveClient({ options: { json: jsonFlag(args) } })
    const report = await auditPage({
      url: stringArg(args.url) ?? '',
      site: selectedProject?.siteUrl ?? explicitSite ?? defaultProject?.siteUrl,
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
