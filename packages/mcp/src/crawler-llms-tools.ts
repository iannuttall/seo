import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  auditLlmsTxtLive,
  crawlSite,
  generateLlmsTxt,
  latestCrawlReport,
  loadCrawlReport,
} from '@seo/core'
import * as z from 'zod/v4'
import { assertExclusiveReportInput } from './crawler-tool-helpers.js'
import * as crawlerInputs from './crawler-tool-inputs.js'
import { fetchRateInput } from './fetch-rate.js'
import { toolError, toolSuccess } from './tool-result.js'

export function registerCrawlerLlmsTools(server: McpServer): void {
  server.registerTool(
    'seo_llms_txt_audit',
    {
      description:
        'Fetch and check an optional llms.txt file body and links. The file does not affect Google rankings.',
      inputSchema: {
        url: z.string().url().optional(),
        reportId: z.string().optional(),
        site: z.string().optional(),
        maxPages: crawlerInputs.crawlPageLimit,
        fetchIntervalCap: z.number().int().positive().optional(),
        fetchIntervalMs: z.number().int().positive().optional(),
        refresh: z.boolean().optional(),
      },
    },
    async ({
      url,
      reportId,
      site,
      maxPages,
      fetchIntervalCap,
      fetchIntervalMs,
      refresh,
    }) => {
      try {
        assertExclusiveReportInput(url, reportId)
        const report = url
          ? await crawlSite({
              url,
              site,
              maxPages,
              refresh,
              useSitemap: true,
              checkExternal: false,
              fetchRate: fetchRateInput({
                fetchIntervalCap,
                fetchIntervalMs,
              }),
            })
          : reportId
            ? loadCrawlReport(reportId)
            : latestCrawlReport(site)
        if (!report) {
          return toolError(
            'No crawl report found. Pass url, reportId, or run seo_crawl_site with saveReport first.',
          )
        }
        const audit = await auditLlmsTxtLive(report)
        return toolSuccess(audit.headline, audit)
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_llms_txt_generate',
    {
      description:
        'Generate a valid llms.txt v2 draft from saved or fresh crawl data. Returns content and metadata.',
      inputSchema: {
        url: z.string().url().optional(),
        reportId: z.string().optional(),
        site: z.string().optional(),
        maxPages: crawlerInputs.crawlPageLimit,
        maxUrls: z.number().int().min(1).max(100).optional(),
        tokenBudget: z.number().int().positive().optional(),
        exclude: z.array(z.string()).optional(),
        title: z.string().optional(),
        description: z.string().optional(),
        fetchIntervalCap: z.number().int().positive().optional(),
        fetchIntervalMs: z.number().int().positive().optional(),
        refresh: z.boolean().optional(),
      },
    },
    async ({
      url,
      reportId,
      site,
      maxPages,
      maxUrls,
      tokenBudget,
      exclude,
      title,
      description,
      fetchIntervalCap,
      fetchIntervalMs,
      refresh,
    }) => {
      try {
        const report = url
          ? await crawlSite({
              url,
              site,
              maxPages,
              refresh,
              fetchRate: fetchRateInput({
                fetchIntervalCap,
                fetchIntervalMs,
              }),
            })
          : reportId
            ? loadCrawlReport(reportId)
            : latestCrawlReport(site)
        if (!report) {
          return toolError(
            'No crawl report found. Pass url, reportId, or run seo_crawl_site with saveReport first.',
          )
        }
        const generated = generateLlmsTxt(report, {
          maxUrls,
          tokenBudget,
          exclude,
          title,
          description,
        })
        return toolSuccess(
          `Generated llms.txt with ${generated.includedUrls} URLs.`,
          generated,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )
}
