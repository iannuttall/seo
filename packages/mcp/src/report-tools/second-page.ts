import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { secondPage } from '@seo/core'
import * as z from 'zod/v4'
import { mcpReportInputSchema } from '../report-options.js'
import { toolError, toolSuccess } from '../tool-result.js'
import {
  type ReportFetchToolInput,
  reportFetchInputSchema,
  reportFetchOptions,
} from './input.js'

type SecondPageToolInput = ReportFetchToolInput & {
  site: string
  range?: number
  minImpressions?: number
  limit?: number
  includeBrand?: boolean
  brandTerms?: string[]
}

export function registerSecondPageTool(server: McpServer): void {
  server.registerTool(
    'seo_second_page',
    {
      description:
        'Find URLs with GSC average position above 10 through 20 and return evidence-grounded investigation prompts',
      inputSchema: {
        ...mcpReportInputSchema([
          'site',
          'range',
          'minImpressions',
          'limit',
          'includeBrand',
        ]),
        ...reportFetchInputSchema,
        range: z.number().int().min(1).max(548).optional(),
        minImpressions: z.number().int().min(0).max(1_000_000_000).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        verifyLimit: z.number().int().min(0).max(100).optional(),
        brandTerms: z
          .array(z.string().trim().min(1).max(200))
          .max(20)
          .optional(),
        fetchConcurrency: z.number().int().min(1).max(16).optional(),
        fetchIntervalCap: z.number().int().min(1).max(60).optional(),
        fetchIntervalMs: z.number().int().min(100).max(60_000).optional(),
      },
    },
    async ({
      site,
      range,
      minImpressions,
      limit,
      includeBrand,
      brandTerms,
      ...fetchInput
    }: SecondPageToolInput) => {
      try {
        const result = await secondPage({
          site,
          range,
          minImpressions,
          limit,
          includeBrand,
          brandTerms,
          ...reportFetchOptions(fetchInput),
        })
        return toolSuccess(result.summary.verdict, result)
      } catch (error) {
        return toolError(error)
      }
    },
  )
}
