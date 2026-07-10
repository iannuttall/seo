import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SeoError } from '@seo/core'
import * as z from 'zod/v4'
import {
  getReportDefinition,
  listReportDefinitions,
  REPORT_CATEGORIES,
} from './report-registry.js'
import { toolError, toolSuccess } from './tool-result.js'

const openOutputSchema = z.looseObject({})

function validationMessage(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'input'
      return `${path}: ${issue.message}`
    })
    .join('; ')
}

export function registerDiscoveryTools(server: McpServer): void {
  server.registerTool(
    'seo_list_reports',
    {
      description:
        'List compact SEO report ids and descriptions, optionally by category',
      inputSchema: {
        category: z.enum(REPORT_CATEGORIES).optional(),
      },
      outputSchema: openOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ category }) => {
      const reports = listReportDefinitions(category)
      const categories = [...new Set(reports.map((report) => report.category))]
      return toolSuccess(
        `${reports.length} SEO reports available across ${categories.length} categories.`,
        { reports, categories },
      )
    },
  )

  server.registerTool(
    'seo_describe_report',
    {
      description:
        'Describe one SEO report and return the JSON Schema for its parameters',
      inputSchema: {
        id: z.string().trim().min(1).max(100),
      },
      outputSchema: openOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ id }) => {
      const report = getReportDefinition(id)
      if (!report) {
        return toolError(
          new SeoError('INVALID_INPUT', `Unknown report: ${id}.`),
        )
      }
      return toolSuccess(`${report.id}: ${report.description}`, {
        report: {
          id: report.id,
          category: report.category,
          description: report.description,
          inputSchema: z.toJSONSchema(report.inputSchema),
        },
      })
    },
  )

  server.registerTool(
    'seo_run_report',
    {
      description:
        'Run one SEO report by id with parameters from seo_describe_report',
      inputSchema: {
        id: z.string().trim().min(1).max(100),
        params: z.record(z.string(), z.unknown()).optional(),
      },
      outputSchema: openOutputSchema,
      annotations: {
        destructiveHint: false,
      },
    },
    async ({ id, params }) => {
      const report = getReportDefinition(id)
      if (!report) {
        return toolError(
          new SeoError('INVALID_INPUT', `Unknown report: ${id}.`),
        )
      }

      const parsed = report.inputSchema.safeParse(params ?? {})
      if (!parsed.success) {
        return toolError(
          new SeoError(
            'INVALID_INPUT',
            `Invalid parameters for ${id}: ${validationMessage(parsed.error)}`,
          ),
        )
      }

      try {
        return await report.handler(parsed.data)
      } catch (error) {
        return toolError(error)
      }
    },
  )
}
