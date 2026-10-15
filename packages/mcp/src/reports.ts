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

// Reports removed in 0.3.0. Their code stays until 0.4.0, but the catalog
// no longer lists or runs them.
export const REMOVED_REPORT_IDS = new Set([
  'agent-readiness',
  'ai-mention-research',
  'ai-prompt-observations',
  'ai-readiness',
  'ai-search-scorecard',
  'bing-webmaster-overview',
  'community-intent',
  'entity-readiness',
  'generate-llms-txt',
  'geo-gaps',
  'llms-txt-audit',
  'local-search-demand',
  'monthly-action-plan',
  'monthly-report',
  'narrative-report',
  'okf-build',
  'okf-validate',
  'pseo-audit',
  'pseo-opportunities',
  'pseo-patterns',
  'rank-tracking',
  'saved-keywords',
  'seo-to-ai-query',
  'server-log-analysis',
])

function activeReport(id: string) {
  if (REMOVED_REPORT_IDS.has(id)) {
    throw new SeoError(
      'INVALID_INPUT',
      `The ${id} report was removed in 0.3.0. Run \`seo help\` for the commands.`,
    )
  }
  const report = getReportDefinition(id)
  if (!report) throw new SeoError('INVALID_INPUT', `Unknown report: ${id}.`)
  return report
}

export function listReports(category?: ReportCategory): ReportSummary[] {
  return listReportDefinitions(category).filter(
    (report) => !REMOVED_REPORT_IDS.has(report.id),
  )
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
