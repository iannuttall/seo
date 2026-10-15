import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { indexCoverageSignals, linkRecover, redirectTrace } from '@seo/core'
import * as z from 'zod/v4'
import { resolveJsOption } from './input-schemas.js'
import { mcpReportInputSchema } from './report-options.js'
import { toolError, toolSuccess } from './tool-result.js'

export function registerMonitoringTools(server: McpServer): void {
  server.registerTool(
    'seo_index_coverage',
    {
      description:
        'Crawl the site, compare it and its sitemap with Search Console page results, then choose representative URLs for URL Inspection',
      inputSchema: {
        site: z.string().min(1),
        url: z
          .string()
          .url()
          .optional()
          .describe('Start URL to crawl. Defaults to the home page.'),
        sitemaps: z.array(z.string().url()).min(1).max(20).optional(),
        days: z.number().int().min(1).max(548).optional(),
        rowLimit: z.number().int().min(1).max(250_000).optional(),
        maxSitemapUrls: z.number().int().min(1).max(250_000).optional(),
        itemsPerSection: z.number().int().min(1).max(1_000).optional(),
        templateClusters: z.number().int().min(1).max(200).optional(),
        templateSamples: z.number().int().min(1).max(25).optional(),
        refresh: z.boolean().optional(),
      },
    },
    async ({
      site,
      url,
      sitemaps,
      days,
      rowLimit,
      maxSitemapUrls,
      itemsPerSection,
      templateClusters,
      templateSamples,
      refresh,
    }) => {
      try {
        const result = await indexCoverageSignals({
          site,
          url,
          sitemaps,
          days,
          rowLimit,
          maxSitemapUrls,
          itemsPerSection,
          templateClusters,
          templateSamples,
          refresh,
        })
        return toolSuccess(
          `${result.summary.retainedSearchVisibleUrls} URLs appeared in the returned Search Console data. ${result.summary.crawlableCandidatesWithoutRetainedSearchVisibility} crawlable URLs need evidence review before choosing representative URL Inspection checks.`,
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
