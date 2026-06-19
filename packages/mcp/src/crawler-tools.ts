import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  crawlSite,
  explainRule,
  latestCrawlReport,
  listCrawlReports,
  listRules,
  loadCrawlReport,
  saveCrawlReport,
  topFixes,
} from '@seo/core'
import * as z from 'zod/v4'
import { toolError, toolSuccess } from './tool-result.js'

function compactCrawlResult(
  report: Awaited<ReturnType<typeof crawlSite>>,
  opts: { includePages?: boolean; includeIssues?: boolean } = {},
) {
  const payload: Record<string, unknown> = {
    id: report.id,
    headline: `Crawled ${report.summary.totalPages} pages. Found ${report.summary.highIssues} high, ${report.summary.mediumIssues} medium, and ${report.summary.lowIssues} low issues.`,
    status: report.status,
    configHash: report.configHash,
    summary: report.summary,
    topFixes: topFixes(report, { limit: 10 }),
    warnings: report.warnings,
    caveats: report.caveats,
  }
  if (opts.includeIssues) payload.issues = report.issues
  if (opts.includePages) payload.pages = report.pages
  return payload
}

export function registerCrawlerTools(server: McpServer): void {
  server.registerTool(
    'seo_crawl_site',
    {
      description:
        'Crawl a site and run technical SEO/GEO checks. Compact by default; set includePages/includeIssues for raw data.',
      inputSchema: {
        url: z.string().url(),
        site: z.string().optional(),
        ga4PropertyId: z.string().optional(),
        maxPages: z.number().int().positive().optional(),
        maxDepth: z.number().int().nonnegative().optional(),
        concurrency: z.number().int().positive().optional(),
        include: z.array(z.string()).optional(),
        exclude: z.array(z.string()).optional(),
        useSitemap: z.boolean().optional(),
        respectRobots: z.boolean().optional(),
        js: z.boolean().optional(),
        includePages: z.boolean().optional(),
        includeIssues: z.boolean().optional(),
        saveReport: z.boolean().optional(),
      },
    },
    async ({
      url,
      site,
      ga4PropertyId,
      maxPages,
      maxDepth,
      concurrency,
      include,
      exclude,
      useSitemap,
      respectRobots,
      js,
      includePages,
      includeIssues,
      saveReport,
    }) => {
      try {
        const report = await crawlSite({
          url,
          site,
          ga4PropertyId,
          maxPages,
          maxDepth,
          concurrency,
          include,
          exclude,
          useSitemap,
          respectRobots,
          js: Boolean(js),
        })
        const saved = saveReport ? saveCrawlReport(report) : undefined
        return toolSuccess(
          `Crawl complete for ${url}. Found ${report.issues.length} issues across ${report.summary.totalPages} pages.`,
          {
            ...compactCrawlResult(report, { includePages, includeIssues }),
            ...(saved ? { saved } : {}),
          },
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_top_fixes',
    {
      description:
        'Return top technical SEO/GEO fixes for a URL by running a compact crawl.',
      inputSchema: {
        url: z.string().url().optional(),
        reportId: z.string().optional(),
        site: z.string().optional(),
        maxPages: z.number().int().positive().optional(),
        maxDepth: z.number().int().nonnegative().optional(),
        category: z.string().optional(),
        limit: z.number().int().positive().optional(),
      },
    },
    async ({ url, reportId, site, maxPages, maxDepth, category, limit }) => {
      try {
        const report = url
          ? await crawlSite({ url, site, maxPages, maxDepth })
          : reportId
            ? loadCrawlReport(reportId)
            : latestCrawlReport(site)
        if (!report) {
          return toolError(
            'No crawl report found. Pass url, reportId, or run seo_crawl_site with saveReport first.',
          )
        }
        const groups = topFixes(report, { category, limit })
        return toolSuccess(
          `Found ${groups.length} top fix groups for ${report.config.url}.`,
          {
            url: report.config.url,
            reportId: report.id,
            summary: report.summary,
            topFixes: groups,
            warnings: report.warnings,
            caveats: report.caveats,
          },
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_explain_issue',
    {
      description:
        'Explain a crawler rule in plain English: why it matters, how to fix it, and how to verify it.',
      inputSchema: {
        ruleId: z.string(),
      },
    },
    async ({ ruleId }) => {
      const rule = explainRule(ruleId)
      if (!rule) {
        return toolError(`Unknown rule: ${ruleId}`)
      }
      return toolSuccess(`Rule guidance for ${ruleId}.`, rule)
    },
  )

  server.registerTool(
    'seo_list_rules',
    {
      description:
        'List crawler rule ids and guidance metadata. Use this before seo_explain_issue when you need valid rule ids.',
      inputSchema: {
        category: z.string().optional(),
      },
    },
    async ({ category }) => {
      const rules = listRules().filter((rule) =>
        category ? rule.category === category : true,
      )
      return toolSuccess(`Found ${rules.length} crawler rules.`, {
        rules,
      })
    },
  )

  server.registerTool(
    'seo_get_crawl_report',
    {
      description:
        'Return a saved crawl report by id, or the latest saved report for an optional site. Compact by default.',
      inputSchema: {
        id: z.string().optional(),
        site: z.string().optional(),
        includePages: z.boolean().optional(),
        includeIssues: z.boolean().optional(),
      },
    },
    async ({ id, site, includePages, includeIssues }) => {
      try {
        const report = id ? loadCrawlReport(id) : latestCrawlReport(site)
        if (!report) {
          return toolError(
            id
              ? `No saved crawl report found for ${id}.`
              : 'No saved crawl reports found.',
          )
        }
        return toolSuccess(`Saved crawl report ${report.id}.`, {
          ...compactCrawlResult(report, { includePages, includeIssues }),
          url: report.config.url,
          site: report.site,
          generatedAt: report.generatedAt,
        })
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_list_crawl_reports',
    {
      description:
        'List saved crawl report metadata, optionally filtered by GSC site/property.',
      inputSchema: {
        site: z.string().optional(),
        limit: z.number().int().positive().optional(),
      },
    },
    async ({ site, limit }) => {
      try {
        const reports = listCrawlReports({ site, limit })
        return toolSuccess(`Found ${reports.length} saved crawl reports.`, {
          reports,
        })
      } catch (error) {
        return toolError(error)
      }
    },
  )
}
