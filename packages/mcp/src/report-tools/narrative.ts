import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { reportNarrative } from '@seo/core'
import * as z from 'zod/v4'
import { toolError, toolSuccess } from '../tool-result.js'
import { reportFetchInputSchema, reportFetchOptions } from './input.js'

export function registerNarrativeReportTool(server: McpServer): void {
  server.registerTool(
    'seo_report_narrative',
    {
      description:
        'Generate a client-ready SEO narrative across diagnosis, changes, and monitoring',
      inputSchema: {
        site: z.string(),
        days: z.number().optional(),
        recentDays: z.number().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().optional(),
        changeLimit: z.number().optional(),
        ...reportFetchInputSchema,
      },
    },
    async ({
      site,
      days,
      recentDays,
      startDate,
      endDate,
      limit,
      changeLimit,
      ...fetchInput
    }) => {
      try {
        const result = await reportNarrative({
          site,
          days,
          recentDays,
          startDate,
          endDate,
          limit,
          changeLimit,
          ...reportFetchOptions(fetchInput),
        })
        return toolSuccess(result.headline, result)
      } catch (error) {
        return toolError(error)
      }
    },
  )
}
