import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  crawlDiff,
  indexCoveragePlan,
  indexMonitor,
  indexWatch,
  linkRecover,
  redirectTrace,
} from '@seo/core'
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

  server.registerTool(
    'seo_index_coverage_plan',
    {
      description:
        'Plan sitemap URL allocation across GSC properties and suggest URL-prefix properties for better URL Inspection coverage',
      inputSchema: {
        site: z.string(),
        sitemaps: z.array(z.string().url()),
        properties: z.array(z.string()).optional(),
        dailyLimit: z.number().optional(),
        targetCycleDays: z.number().optional(),
        maxUrls: z.number().optional(),
      },
    },
    async ({
      site,
      sitemaps,
      properties,
      dailyLimit,
      targetCycleDays,
      maxUrls,
    }) => {
      try {
        const result = await indexCoveragePlan({
          site,
          sitemaps,
          properties,
          dailyLimit,
          targetCycleDays,
          maxUrls,
        })
        return toolSuccess(
          `Planned ${result.summary.urlCount} sitemap URLs across ${result.summary.properties} properties. ${result.summary.suggestedProperties} suggested properties.`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_index_monitor',
    {
      description:
        'Run quota-aware URL Inspection monitoring from XML sitemaps and store index snapshots',
      inputSchema: {
        site: z.string(),
        sitemaps: z.array(z.string().url()),
        properties: z.array(z.string()).optional(),
        dailyLimit: z.number().optional(),
        inspectLimit: z.number().optional(),
        maxUrls: z.number().optional(),
        languageCode: z.string().optional(),
      },
    },
    async ({
      site,
      sitemaps,
      properties,
      dailyLimit,
      inspectLimit,
      maxUrls,
      languageCode,
    }) => {
      try {
        const result = await indexMonitor({
          site,
          sitemaps,
          properties,
          dailyLimit,
          inspectLimit,
          maxUrls,
          languageCode,
        })
        return toolSuccess(
          `Inspected ${result.summary.inspected} of ${result.summary.inventoryUrls} sitemap URLs. ${result.summary.alerts} alerts.`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_redirect_trace',
    {
      description:
        'Trace redirects and report final indexability/canonical issues for a URL',
      inputSchema: {
        url: z.string().url(),
        maxHops: z.number().optional(),
        refresh: z.boolean().optional(),
        js: z.boolean().optional(),
      },
    },
    async ({ url, maxHops, refresh, js }) => {
      try {
        const result = await redirectTrace({
          url,
          maxHops,
          refresh,
          js: js ? true : 'auto',
        })
        return toolSuccess(
          `Traced ${result.summary.hops} hops. Final status ${result.summary.finalStatus}. ${result.summary.issues.length} issues.`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_link_recover',
    {
      description:
        'Find GSC search-value URLs that are now broken, blocked, or poorly redirected',
      inputSchema: {
        site: z.string(),
        days: z.number().optional(),
        limit: z.number().optional(),
        minClicks: z.number().optional(),
        minImpressions: z.number().optional(),
        refresh: z.boolean().optional(),
        js: z.boolean().optional(),
      },
    },
    async ({ site, days, limit, minClicks, minImpressions, refresh, js }) => {
      try {
        const result = await linkRecover({
          site,
          days,
          limit,
          minClicks,
          minImpressions,
          refresh,
          js: js ? true : 'auto',
        })
        return toolSuccess(
          `Checked ${result.summary.checked} search-value URLs. ${result.summary.recoverable} recoverable issues.`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )
}
