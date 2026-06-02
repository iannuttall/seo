import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { monthlyReport } from '@seo/core'
import * as z from 'zod/v4'
import { toolError, toolSuccess } from '../tool-result.js'
import { reportFetchInputSchema, reportFetchOptions } from './input.js'

export function registerMonthlyReportTool(server: McpServer): void {
  server.registerTool(
    'seo_monthly_report',
    {
      description: 'Generate a monthly SEO report narrative',
      inputSchema: {
        site: z.string(),
        month: z.string().optional(),
        limit: z.number().optional(),
        ...reportFetchInputSchema,
      },
    },
    async ({ site, month, limit, ...fetchInput }) => {
      try {
        const result = await monthlyReport({
          site,
          month,
          limit,
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
