import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  type TelemetryOptions,
  telemetryErrorCategory,
  trackTelemetryReportComplete,
  trackTelemetryReportFailed,
  trackTelemetryReportStart,
} from '@seo/core'
import * as z from 'zod/v4'
import { REPORT_CATEGORIES } from './report-registry.js'
import { describeReport, listReports, runReport } from './reports.js'
import { toolError, toolSuccess } from './tool-result.js'

const openOutputSchema = z.looseObject({})
const reportIds = new Set(listReports().map((report) => report.id))

export function registerDiscoveryTools(
  server: McpServer,
  options: { telemetry?: () => TelemetryOptions } = {},
): void {
  server.registerTool(
    'seo_list_reports',
    {
      description:
        'List compact SEO report ids, names, and purposes, optionally by category',
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
      const reports = listReports(category)
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
        'Explain when to use one SEO report, what it returns, and which parameters it accepts',
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
      try {
        const report = describeReport(id)
        return toolSuccess(`${report.id}: ${report.description}`, { report })
      } catch (error) {
        return toolError(error)
      }
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
      const telemetry = reportIds.has(id) ? options.telemetry?.() : undefined
      if (telemetry) trackTelemetryReportStart(id, telemetry)
      try {
        const result = await runReport(id, params)
        if (telemetry) {
          if (result.isError) {
            trackTelemetryReportFailed(
              id,
              telemetryErrorCategory(result.structuredContent?.error),
              telemetry,
            )
          } else {
            trackTelemetryReportComplete(id, telemetry)
          }
        }
        return result
      } catch (error) {
        if (telemetry) {
          trackTelemetryReportFailed(
            id,
            telemetryErrorCategory(error),
            telemetry,
          )
        }
        throw error
      }
    },
  )
}
