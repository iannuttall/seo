import {
  type AiReadinessReport,
  aiReadiness,
  type CrawlReport,
  latestCrawlReport,
  loadCrawlReport,
} from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag, projectArg, stringArg } from '../args.js'
import { resolveClientSelection } from '../selection.js'
import { printJson, printSemanticReport } from '../utils.js'

export async function resolveSavedCrawlReport(
  args: Record<string, unknown>,
  options: { json?: boolean } = {},
): Promise<CrawlReport> {
  const reportId = stringArg(args['report-id'])
  if (reportId) {
    const report = loadCrawlReport(reportId)
    if (!report) throw new Error(`No saved crawl report found for ${reportId}.`)
    return report
  }

  const project = projectArg(args)
  const site = stringArg(args.site)
  const selection =
    project || site
      ? await resolveClientSelection({
          client: project,
          site,
          options,
        })
      : undefined
  const report = latestCrawlReport(selection?.site)
  if (!report) {
    throw new Error(
      selection?.site
        ? `No saved crawl report found for ${selection.site}. Run \`seo crawl --project ${selection.client?.id ?? selection.site} --save\` first.`
        : 'No saved crawl report found. Run `seo crawl <url> --save` first, or pass --report-id.',
    )
  }
  return report
}

function printAiReadiness(report: AiReadinessReport): void {
  const count = (status: string) =>
    report.checks.filter((check) => check.status === status).length
  const failed = count('fail')
  const warnings = count('warning')
  const unknown = count('unknown')
  const passed = count('pass')
  const status = failed
    ? 'fail'
    : warnings
      ? 'warning'
      : unknown
        ? 'unknown'
        : 'pass'
  printSemanticReport({
    title: 'AI search evidence',
    target: report.url,
    status,
    summary: report.headline,
    metrics: [
      { label: 'Passed', value: passed, status: 'pass' },
      { label: 'Review', value: warnings, status: 'warning' },
      { label: 'Failed', value: failed, status: 'fail' },
      { label: 'Unknown', value: unknown, status: 'unknown' },
    ],
    sections: report.sections.map((section) => ({
      title: section.title,
      diagnostics: section.checks.map((check) => ({
        status: check.status,
        title: check.title,
        explanation: check.plainEnglish,
        fix: check.status === 'pass' ? undefined : check.action,
        evidence: (check.urls ?? []).slice(0, 5),
      })),
    })),
    notes: [
      `Data: ${report.dataStatus}. Report: ${report.reportId}.`,
      ...report.caveats,
    ],
  })
}

export const aiReadinessCommand = defineCommand({
  meta: {
    name: 'ai-readiness',
    description:
      'Review AI-search technical evidence and optional observations',
  },
  args: {
    'report-id': {
      type: 'string',
      description: 'Saved crawl report id to analyze.',
    },
    site: {
      type: 'string',
      description: 'GSC property URL for selecting the latest saved crawl.',
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
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const report = await resolveSavedCrawlReport(args, { json })
    const readiness = aiReadiness(report)
    if (json) {
      printJson(readiness)
      return
    }
    printAiReadiness(readiness)
  },
})
