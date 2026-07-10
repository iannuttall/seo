import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { reportNarrative, reportPresentation } from '@seo/core'
import * as z from 'zod/v4'
import { calendarDateSchema } from '../input-schemas.js'
import { mcpReportInputSchema } from '../report-options.js'
import { toolError, toolSuccess } from '../tool-result.js'
import {
  type ReportFetchToolInput,
  reportFetchInputSchema,
  reportFetchOptions,
} from './input.js'

type NarrativeReportToolInput = ReportFetchToolInput & {
  site: string
  days?: number
  recentDays?: number
  startDate?: string
  endDate?: string
  limit?: number
  changeLimit?: number
  includeBrand?: boolean
}

export function registerNarrativeReportTool(server: McpServer): void {
  server.registerTool(
    'seo_report_narrative',
    {
      description:
        'Generate a client-ready SEO narrative across diagnosis, changes, and monitoring',
      inputSchema: {
        ...mcpReportInputSchema([
          'site',
          'days',
          'recentDays',
          'limit',
          'includeBrand',
        ]),
        startDate: calendarDateSchema.optional(),
        endDate: calendarDateSchema.optional(),
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
      includeBrand,
      ...fetchInput
    }: NarrativeReportToolInput) => {
      try {
        const result = await reportNarrative({
          site,
          days,
          recentDays,
          startDate,
          endDate,
          limit,
          changeLimit,
          includeBrand,
          ...reportFetchOptions(fetchInput),
        })
        return toolSuccess(
          result.headline,
          { ...result, presentation: reportPresentation(result) },
          { markdown: result.markdown },
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )
}
