import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { secondPage } from '@seo/core'
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
}

export function registerSecondPageTool(server: McpServer): void {
  server.registerTool(
    'seo_second_page',
    {
      description:
        'Find page-two opportunities with evidence-grounded recommendations',
      inputSchema: {
        ...mcpReportInputSchema([
          'site',
          'range',
          'minImpressions',
          'limit',
          'includeBrand',
        ]),
        ...reportFetchInputSchema,
      },
    },
    async ({
      site,
      range,
      minImpressions,
      limit,
      includeBrand,
      ...fetchInput
    }: SecondPageToolInput) => {
      try {
        const result = await secondPage({
          site,
          range,
          minImpressions,
          limit,
          includeBrand,
          ...reportFetchOptions(fetchInput),
        })
        return toolSuccess(result.summary.verdict, result)
      } catch (error) {
        return toolError(error)
      }
    },
  )
}
