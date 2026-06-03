import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { monthlyReport } from '@seo/core'
import * as z from 'zod/v4'
import { mcpReportInputSchema } from '../report-options.js'
import { toolError, toolSuccess } from '../tool-result.js'
import {
  type ReportFetchToolInput,
  reportFetchInputSchema,
  reportFetchOptions,
} from './input.js'

type MonthlyReportToolInput = ReportFetchToolInput & {
  site: string
  month?: string
  limit?: number
  includeBrand?: boolean
}

export function registerMonthlyReportTool(server: McpServer): void {
  server.registerTool(
    'seo_monthly_report',
    {
      description: 'Generate a monthly SEO report narrative',
      inputSchema: {
        ...mcpReportInputSchema(['site', 'limit', 'includeBrand']),
        month: z.string().optional(),
        ...reportFetchInputSchema,
      },
    },
    async ({
      site,
      month,
      limit,
      includeBrand,
      ...fetchInput
    }: MonthlyReportToolInput) => {
      try {
        const result = await monthlyReport({
          site,
          month,
          limit,
          includeBrand,
          ...reportFetchOptions(fetchInput),
        })
        return toolSuccess(
          `Monthly report generated for ${result.month}. ${result.headline}`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )
}
