import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { crawlSite, explainRule, groupCrawlIssues } from '@seo/core'
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
    topFixes: report.issueGroups.slice(0, 10),
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
      },
    },
    async ({
      url,
      site,
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
    }) => {
      try {
        const report = await crawlSite({
          url,
          site,
          maxPages,
          maxDepth,
          concurrency,
          include,
          exclude,
          useSitemap,
          respectRobots,
          js: js ? true : false,
        })
        return toolSuccess(
          `Crawl complete for ${url}. Found ${report.issues.length} issues across ${report.summary.totalPages} pages.`,
          compactCrawlResult(report, { includePages, includeIssues }),
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
        url: z.string().url(),
        site: z.string().optional(),
        maxPages: z.number().int().positive().optional(),
        maxDepth: z.number().int().nonnegative().optional(),
        category: z.string().optional(),
        limit: z.number().int().positive().optional(),
      },
    },
    async ({ url, site, maxPages, maxDepth, category, limit }) => {
      try {
        const report = await crawlSite({ url, site, maxPages, maxDepth })
        const groups = groupCrawlIssues(
          category
            ? report.issues.filter((issue) => issue.category === category)
            : report.issues,
        ).slice(0, limit ?? 10)
        return toolSuccess(
          `Found ${groups.length} top fix groups for ${url}.`,
          {
            url,
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
}
