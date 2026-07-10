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
import { resolveJsOption } from './input-schemas.js'
import { mcpReportInputSchema } from './report-options.js'
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
          js: resolveJsOption(js, 'auto'),
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
        "Inspect a bounded URL set against Google's indexed snapshot and separate current issues, regressions, recoveries, and operational failures",
      inputSchema: {
        site: z.string(),
        urls: z.array(z.string().url()).min(1).max(100),
        languageCode: z.string().min(1).max(35).optional(),
        dailyLimit: z.number().int().min(1).max(2_000).optional(),
      },
    },
    async ({ site, urls, languageCode, dailyLimit }) => {
      try {
        const result = await indexWatch({
          site,
          urls,
          languageCode,
          dailyLimit,
        })
        return toolSuccess(
          `Inspected ${result.summary.inspected} URLs. ${result.summary.currentIssues} current reviews, ${result.summary.regressions} regressions, ${result.summary.failed} failed, ${result.summary.quotaBlocked} quota-blocked, ${result.summary.deferred} deferred.`,
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
        sitemaps: z.array(z.string().url()).min(1).max(20),
        properties: z.array(z.string()).optional(),
        dailyLimit: z.number().int().min(1).max(2_000).optional(),
        targetCycleDays: z.number().int().min(1).max(365).optional(),
        maxUrls: z.number().int().min(1).max(250_000).optional(),
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
        "Run bounded, locally quota-enforced URL Inspection monitoring from XML sitemaps and store Google's indexed snapshots",
      inputSchema: {
        site: z.string(),
        sitemaps: z.array(z.string().url()).min(1).max(20),
        properties: z.array(z.string()).optional(),
        dailyLimit: z.number().int().min(1).max(2_000).optional(),
        inspectLimit: z.number().int().min(1).max(100).optional(),
        maxUrls: z.number().int().min(1).max(250_000).optional(),
        languageCode: z.string().min(1).max(35).optional(),
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
          `Inventory ${result.summary.inventoryUrls}; ${result.summary.due} due, ${result.summary.selected} selected, ${result.summary.inspected} inspected, ${result.summary.unselectedDue} due but not selected. ${result.summary.currentIssues} current reviews in selected results, ${result.summary.regressions} regressions, ${result.summary.failed} failed, ${result.summary.quotaBlocked} quota-blocked, ${result.summary.deferred} deferred.`,
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
          js: resolveJsOption(js, 'auto'),
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
        ...mcpReportInputSchema([
          'site',
          'days',
          'limit',
          'minImpressions',
          'refresh',
          'js',
        ]),
        minClicks: z.number().optional(),
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
          js: resolveJsOption(js, 'auto'),
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
