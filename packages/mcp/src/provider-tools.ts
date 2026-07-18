import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { bingWebmasterOverview } from '@seo/core'
import * as z from 'zod/v4'
import { toolError, toolSuccess } from './tool-result.js'

const MAX_AGENT_ROWS_PER_SECTION = 14

type BingOverview = Awaited<ReturnType<typeof bingWebmasterOverview>>

function compactRows<T extends { rows: unknown[] }>(data: T) {
  const rows = data.rows.slice(-MAX_AGENT_ROWS_PER_SECTION)
  return {
    ...data,
    rows,
    outputSelection: {
      strategy: 'most-recent' as const,
      availableRows: data.rows.length,
      returnedRows: rows.length,
      omittedRows: Math.max(0, data.rows.length - rows.length),
    },
  }
}

export function compactBingWebmasterOverview(result: BingOverview) {
  return {
    ...result,
    traffic:
      result.traffic.status === 'unavailable'
        ? result.traffic
        : {
            ...result.traffic,
            data: compactRows(result.traffic.data),
          },
    crawl:
      result.crawl.status === 'unavailable'
        ? result.crawl
        : {
            ...result.crawl,
            data: compactRows(result.crawl.data),
          },
    outputBudget: {
      maxRowsPerSection: MAX_AGENT_ROWS_PER_SECTION,
      strategy: 'most-recent' as const,
    },
  }
}

export function registerProviderTools(server: McpServer): void {
  server.registerTool(
    'seo_bing_webmaster_overview',
    {
      description:
        'Report bounded Bing Webmaster search and crawl evidence for one verified site',
      inputSchema: {
        site: z.string().url().max(2_000),
      },
    },
    async ({ site }) => {
      try {
        const result = await bingWebmasterOverview({ site })
        const clicks =
          result.traffic.status === 'unavailable'
            ? 'unavailable'
            : String(result.traffic.data.clicks)
        return toolSuccess(
          `Bing evidence is ${result.dataStatus}. Observed clicks: ${clicks}.`,
          compactBingWebmasterOverview(result),
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )
}
