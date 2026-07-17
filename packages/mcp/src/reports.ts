import { SeoError } from '@seo/core'
import * as z from 'zod/v4'
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
    ...(fixableChecks.length > 0 ? { fixableChecks } : {}),
    inputSchema: z.toJSONSchema(report.inputSchema),
  }
}

export async function executeReport(
  id: string,
  params: Record<string, unknown> = {},
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

  return report.handler(parsed.data)
}

export async function runReport(
  id: string,
  params: Record<string, unknown> = {},
): Promise<ToolResult> {
  try {
    return await executeReport(id, params)
  } catch (error) {
    return toolError(error)
  }
}
