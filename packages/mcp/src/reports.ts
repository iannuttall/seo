import { agentActionsView, SeoError } from '@seo/core'
import * as z from 'zod/v4'
import { compactAgentWorkflowOutput } from './agent-output-budget.js'
import {
  getReportDefinition,
  listReportDefinitions,
  type ReportCategory,
  type ReportSummary,
} from './report-registry.js'
import { type ToolResult, toolError } from './tool-result.js'

function validationMessage(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'input'
      return `${path}: ${issue.message}`
    })
    .join('; ')
}

// Removed report ids, with the command to use instead when there is one.
// Running one fails with a notice instead of `Unknown report`.
export const REMOVED_REPORT_IDS: Readonly<Record<string, string | null>> = {
  'affected-urls': 'seo crawl',
  'agent-readiness': null,
  'ai-mention-research': null,
  'ai-prompt-observations': null,
  'ai-readiness': null,
  'ai-search-scorecard': null,
  'bing-webmaster-overview': null,
  'community-intent': null,
  'compare-crawls': 'seo crawl',
  'competitive-opportunities': 'seo research',
  'competitor-keyword-gap': 'seo research competitors',
  'crawl-diff': 'seo crawl',
  'crawl-history': 'seo crawl',
  'crawl-report': 'seo crawl',
  'domain-overview': 'seo research ranked_keywords',
  'domain-rating': 'seo research',
  'entity-readiness': null,
  'generate-llms-txt': null,
  'geo-gaps': null,
  'index-coverage-plan': 'seo index',
  'index-monitor': 'seo index',
  'index-watch': 'seo page --url <url>',
  'keyword-metrics': 'seo research keyword_metrics',
  'keyword-opportunities': 'seo research',
  'keyword-research': 'seo research keyword_metrics',
  'link-evidence': 'seo research backlinks',
  'llms-txt-audit': null,
  'local-search-demand': null,
  'measure-change': 'seo compare --date <date>',
  'monthly-action-plan': 'seo report',
  'monthly-report': 'seo report',
  'narrative-report': 'seo report',
  'okf-build': null,
  'okf-validate': null,
  'pseo-audit': null,
  'pseo-opportunities': null,
  'pseo-patterns': null,
  'rank-tracking': null,
  'ranked-keywords': 'seo research ranked_keywords',
  'ranking-pages': 'seo research ranked_keywords',
  'saved-keywords': null,
  'seo-to-ai-query': null,
  'serp-competitors': 'seo research competitors',
  'serp-results': 'seo research serp',
  'server-log-analysis': null,
  'technical-watch': 'seo crawl',
}

function activeReport(id: string) {
  if (Object.hasOwn(REMOVED_REPORT_IDS, id)) {
    const replacement = REMOVED_REPORT_IDS[id]
    throw new SeoError(
      'INVALID_INPUT',
      replacement
        ? `The ${id} report was removed. Use \`${replacement}\` instead.`
        : `The ${id} report was removed. Run \`seo help\` for the commands.`,
    )
  }
  const report = getReportDefinition(id)
  if (!report) throw new SeoError('INVALID_INPUT', `Unknown report: ${id}.`)
  return report
}

export function listReports(category?: ReportCategory): ReportSummary[] {
  return listReportDefinitions(category)
}

export function describeReport(id: string) {
  const report = activeReport(id)
  return {
    id: report.id,
    category: report.category,
    name: report.name,
    description: report.description,
    useWhen: report.useWhen,
    avoidWhen: report.avoidWhen,
    outcome: report.outcome,
    readOrder: report.readOrder,
    doNotClaim: report.doNotClaim,
    verify: report.verify,
    related: report.related,
    agentWorkflow: {
      actionView: {
        mcp: { id: report.id, view: 'actions' as const },
        cli: `seo reports run ${report.id} --params '<json>' --actions-only --json`,
      },
      readOrder: [
        'findings.coverage and report-level caveats',
        'findings.items in returned priority order',
        'inventories row by row when present',
      ],
      completion:
        'Use each finding type and its allowed outcomes. Fix items support fixed, deferred, or not-needed. Review items support changed, no-change, or deferred. Verify changed items and rerun this report before closing them.',
    },
    inputSchema: z.toJSONSchema(report.inputSchema),
  }
}

export async function executeReport(
  id: string,
  params: Record<string, unknown> = {},
  options: { view?: 'full' | 'actions' } = {},
): Promise<ToolResult> {
  const report = activeReport(id)

  const parsed = report.inputSchema.safeParse(params)
  if (!parsed.success) {
    throw new SeoError(
      'INVALID_INPUT',
      `Invalid parameters for ${id}: ${validationMessage(parsed.error)}`,
    )
  }

  const result = await report.handler(parsed.data)
  if (result.isError || !result.structuredContent) return result

  const contractOptions = {
    reportId: report.id,
    verify: report.verify,
  }
  const structured =
    options.view === 'actions'
      ? agentActionsView(result.structuredContent, contractOptions)
      : result.structuredContent
  return {
    ...result,
    structuredContent: compactAgentWorkflowOutput(structured),
  }
}

export async function runReport(
  id: string,
  params: Record<string, unknown> = {},
  options: { view?: 'full' | 'actions' } = {},
): Promise<ToolResult> {
  try {
    return await executeReport(id, params, options)
  } catch (error) {
    return toolError(error)
  }
}
