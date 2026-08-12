import { agentActionsView, SeoError } from '@seo/core'
import * as z from 'zod/v4'
import { compactAgentWorkflowOutput } from './agent-output-budget.js'
import { getCheckFix, listFixableChecks } from './check-fixes.js'
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

export function listReports(category?: ReportCategory): ReportSummary[] {
  return listReportDefinitions(category)
}

export function describeReportCheck(id: string, check: string) {
  const report = getReportDefinition(id)
  if (!report) throw new SeoError('INVALID_INPUT', `Unknown report: ${id}.`)
  const fixableChecks = listFixableChecks(report.id)
  if (fixableChecks.length === 0) {
    throw new SeoError(
      'INVALID_INPUT',
      `Report ${report.id} has no per-check fix guidance yet.`,
    )
  }
  const checkFix = getCheckFix(report.id, check)
  if (!checkFix) {
    throw new SeoError(
      'INVALID_INPUT',
      `Unknown check ${check} for ${report.id}. Fix guidance exists for: ${fixableChecks.join(', ')}.`,
    )
  }
  return {
    id: report.id,
    category: report.category,
    name: report.name,
    check,
    checkFix,
  }
}

export function describeReport(id: string) {
  const report = getReportDefinition(id)
  if (!report) throw new SeoError('INVALID_INPUT', `Unknown report: ${id}.`)
  const fixableChecks = listFixableChecks(report.id)
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
    ...(fixableChecks.length > 0 ? { fixableChecks } : {}),
    inputSchema: z.toJSONSchema(report.inputSchema),
  }
}

export async function executeReport(
  id: string,
  params: Record<string, unknown> = {},
  options: { view?: 'full' | 'actions' } = {},
): Promise<ToolResult> {
  const report = getReportDefinition(id)
  if (!report) throw new SeoError('INVALID_INPUT', `Unknown report: ${id}.`)

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
