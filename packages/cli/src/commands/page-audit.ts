import { auditPage } from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, projectArg, stringArg } from '../args.js'
import { resolveClient } from '../selection.js'
import { printJson } from '../utils.js'
import { printReportSummary } from './output.js'
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
    printReportSummary({
      title: 'Page audit',
      target: report.url,
      status: report.issues.some((issue) => issue.severity === 'high')
        ? 'fail'
        : report.issues.length > 0
          ? 'warning'
          : 'pass',
      summary:
        report.issues.length > 0
          ? `${report.issues.length} ${report.issues.length === 1 ? 'issue needs' : 'issues need'} review.`
          : 'No page issues were found by the available checks.',
      metrics: [
        { label: 'Final URL', value: report.page.finalUrl },
        { label: 'Title', value: report.page.title ?? 'Missing' },
        {
          label: 'Meta description',
          value: report.page.metaDescription ?? 'Missing',
        },
        { label: 'Words', value: report.page.wordCount },
        {
          label: 'Fetch',
          value: formatFetchDiagnostics(report.fetchDiagnostics),
        },
      ],
      diagnostics: [
        {
          title: 'Issues',
          items: report.issues.map((issue) => ({
            status: issue.severity === 'high' ? 'fail' : 'warning',
            title: `${issue.code}: ${issue.principle}`,
            explanation: issue.detail,
          })),
        },
      ],
    })
  },
})
