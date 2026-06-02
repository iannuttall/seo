import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { crawlDiff, indexWatch } from '@seo/core'
import * as z from 'zod/v4'
import { toolError, toolSuccess } from './tool-result.js'

export function registerMonitoringTools(server: McpServer): void {
  server.registerTool(
    'seo_crawl_diff',
    {
      description:
        'Crawl a bounded same-origin URL set and compare technical/page changes with the previous run',
      inputSchema: {
        startUrl: z.string().url(),
        site: z.string().optional(),
        limit: z.number().optional(),
        refresh: z.boolean().optional(),
        js: z.boolean().optional(),
      },
    },
    async ({ startUrl, site, limit, refresh, js }) => {
      try {
        const result = await crawlDiff({
          startUrl,
          site,
          limit,
          refresh,
          js: js ? true : 'auto',
        })
        return toolSuccess(
          `Crawled ${result.summary.crawled} URLs. ${result.summary.changed} changed vs previous run.`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_index_watch',
    {
      description:
        'Inspect URLs with GSC URL Inspection and alert on index status changes',
      inputSchema: {
        site: z.string(),
        urls: z.array(z.string().url()),
        languageCode: z.string().optional(),
      },
    },
    async ({ site, urls, languageCode }) => {
      try {
        const result = await indexWatch({ site, urls, languageCode })
        return toolSuccess(
          `Inspected ${result.summary.inspected} URLs. ${result.summary.alerts} alerts.`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )
}
