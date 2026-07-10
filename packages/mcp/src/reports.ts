import { SeoError } from '@seo/core'
import * as z from 'zod/v4'
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

export function describeReport(id: string) {
  const report = getReportDefinition(id)
  if (!report) throw new SeoError('INVALID_INPUT', `Unknown report: ${id}.`)
  return {
    id: report.id,
    category: report.category,
    name: report.name,
    description: report.description,
    useWhen: report.useWhen,
    avoidWhen: report.avoidWhen,
    outcome: report.outcome,
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
