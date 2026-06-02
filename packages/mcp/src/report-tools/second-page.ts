import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { secondPage } from '@seo/core'
import * as z from 'zod/v4'
import { toolError, toolSuccess } from '../tool-result.js'
import { reportFetchInputSchema, reportFetchOptions } from './input.js'

export function registerSecondPageTool(server: McpServer): void {
  server.registerTool(
    'seo_second_page',
    {
      description:
        'Find page-two opportunities with evidence-grounded recommendations',
      inputSchema: {
        site: z.string(),
        range: z.number().optional(),
        minImpressions: z.number().optional(),
        limit: z.number().optional(),
        ...reportFetchInputSchema,
      },
    },
    async ({ site, range, minImpressions, limit, ...fetchInput }) => {
      try {
        const result = await secondPage({
          site,
          range,
          minImpressions,
          limit,
          ...reportFetchOptions(fetchInput),
        })
        const templateCount = new Set(
          result.items.map((item) => item.template.id),
        ).size
        return toolSuccess(
          `${result.items.length} page-two opportunities found across ${templateCount} template group(s).`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )
}
