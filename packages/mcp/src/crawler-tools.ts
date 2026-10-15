import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  compareCrawlReports,
  countLabel,
  crawlerRuleCategorySchema,
  crawlSite,
  explainRule,
  latestCrawlReport,
  listCrawlReports,
  listRules,
  loadCrawlReport,
  MAX_CRAWL_PAGES,
  SeoError,
  saveCrawlReport,
  selectAffectedUrls,
  topFixes,
} from '@seo/core'
import * as z from 'zod/v4'
import {
  assertExclusiveReportInput,
  compactCrawlResult,
  resolveSavedReportAlias,
} from './crawler-tool-helpers.js'
import * as crawlerInputs from './crawler-tool-inputs.js'
import { fetchRateInput } from './fetch-rate.js'
import { toolError, toolSuccess } from './tool-result.js'

export function registerCrawlerTools(server: McpServer): void {
  server.registerTool(
    'seo_crawl_site',
    {
      description:
        'Run a site crawl. Start with health=true for a fast uncached sitemap status and redirect pass, especially on large or unknown sites. Run the full crawl second when content-level evidence is needed. The compact result includes crawler identity and access-block guidance.',
      inputSchema: {
        url: z
          .string()
          .url()
          .optional()
          .describe(
            'Site start URL. Optional when sitemapUrl supplies the health-pass scope.',
          ),
        health: z
          .boolean()
          .optional()
          .describe(
            'Run the fast sitemap health pass before a full crawl. Downloads no page bodies and writes no page cache entries.',
          ),
        sitemapUrl: z
          .string()
          .url()
          .optional()
          .describe(
            'Explicit sitemap or sitemap index URL for the health pass.',
          ),
        site: z.string().optional(),
        googleAnalyticsPropertyId: z.string().optional(),
        clickySiteId: crawlerInputs.clickySiteIdInput,
        maxPages: crawlerInputs.crawlPageLimit,
        maxDepth: crawlerInputs.crawlDepthLimit,
        concurrency: crawlerInputs.crawlConcurrencyLimit,
        fetchIntervalCap: z.number().int().positive().optional(),
        fetchIntervalMs: z.number().int().positive().optional(),
        refresh: z.boolean().optional(),
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
      health,
      sitemapUrl,
      site,
      googleAnalyticsPropertyId,
      clickySiteId,
      maxPages,
      maxDepth,
      concurrency,
      fetchIntervalCap,
      fetchIntervalMs,
      refresh,
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
        const analyticsConnection = crawlerInputs.clickyAnalyticsConnection({
          googleAnalyticsPropertyId,
          clickySiteId,
        })
        const crawlUrl =
          url ?? (sitemapUrl ? new URL('/', sitemapUrl).toString() : undefined)
        if (!crawlUrl) {
          throw new SeoError(
            'INVALID_INPUT',
            'Pass url or an explicit sitemapUrl.',
          )
        }
        const report = await crawlSite({
          url: crawlUrl,
          mode: health || sitemapUrl ? 'sitemap' : 'site',
          strategy: health ? 'health' : 'full',
          sitemapUrl,
          site,
          googleAnalyticsPropertyId,
          analyticsConnection,
          maxPages,
          maxDepth,
          concurrency,
          refresh,
          fetchRate: fetchRateInput({
            fetchConcurrency: concurrency,
            fetchIntervalCap,
            fetchIntervalMs,
          }),
          include,
          exclude,
          useSitemap,
          respectRobots,
          js: Boolean(js),
        })
        const saved = saveReport ? saveCrawlReport(report) : undefined
        return toolSuccess(
          `${health ? 'Sitemap health pass' : 'Crawl'} complete for ${crawlUrl}. Found ${report.issues.length} issues across ${report.summary.totalPages} pages.`,
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
    'seo_audit_urls',
    {
      description:
        'Audit an explicit list of URLs with technical SEO checks. The compact result separates prioritised fixes from review observations. Set includePages/includeIssues for raw data.',
      inputSchema: {
        urls: z.array(z.string().url()).min(1).max(MAX_CRAWL_PAGES),
        site: z.string().optional(),
        googleAnalyticsPropertyId: z.string().optional(),
        clickySiteId: crawlerInputs.clickySiteIdInput,
        maxPages: crawlerInputs.crawlPageLimit,
        concurrency: crawlerInputs.crawlConcurrencyLimit,
        fetchIntervalCap: z.number().int().positive().optional(),
        fetchIntervalMs: z.number().int().positive().optional(),
        refresh: z.boolean().optional(),
        includePages: z.boolean().optional(),
        includeIssues: z.boolean().optional(),
        saveReport: z.boolean().optional(),
      },
    },
    async ({
      urls,
      site,
      googleAnalyticsPropertyId,
      clickySiteId,
      maxPages,
      concurrency,
      fetchIntervalCap,
      fetchIntervalMs,
      refresh,
      includePages,
      includeIssues,
      saveReport,
    }) => {
      try {
        const analyticsConnection = crawlerInputs.clickyAnalyticsConnection({
          googleAnalyticsPropertyId,
          clickySiteId,
        })
        const report = await crawlSite({
          url: urls[0] ?? '',
          urls,
          mode: 'list',
          site,
          googleAnalyticsPropertyId,
          analyticsConnection,
          maxPages: maxPages ?? urls.length,
          concurrency,
          refresh,
          fetchRate: fetchRateInput({
            fetchConcurrency: concurrency,
            fetchIntervalCap,
            fetchIntervalMs,
          }),
          useSitemap: false,
        })
        const saved = saveReport ? saveCrawlReport(report) : undefined
        return toolSuccess(
          `URL audit complete. Found ${report.issues.length} issues across ${report.summary.totalPages} pages.`,
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
        'Return top technical SEO fixes for a URL by running a compact crawl.',
      inputSchema: {
        url: z.string().url().optional(),
        reportId: z.string().optional(),
        site: z.string().optional(),
        maxPages: crawlerInputs.crawlPageLimit,
        maxDepth: crawlerInputs.crawlDepthLimit,
        fetchIntervalCap: z.number().int().positive().optional(),
        fetchIntervalMs: z.number().int().positive().optional(),
        refresh: z.boolean().optional(),
        category: z.string().optional(),
        limit: z.number().int().min(1).max(1_000).optional(),
      },
    },
    async ({
      url,
      reportId,
      site,
      maxPages,
      maxDepth,
      fetchIntervalCap,
      fetchIntervalMs,
      refresh,
      category,
      limit,
    }) => {
      try {
        assertExclusiveReportInput(url, reportId)
        const report = url
          ? await crawlSite({
              url,
              site,
              maxPages,
              maxDepth,
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
        const groups = topFixes(report, { category, limit })
        const coverage =
          report.status === 'completed'
            ? ''
            : ` Coverage is ${report.status}: ${countLabel(report.summary.crawledUrls, 'URL')} crawled from ${countLabel(report.summary.discoveredUrls, 'discovered URL')}. Review the returned warnings and caveats before treating this as sitewide.`
        return toolSuccess(
          `Found ${countLabel(groups.length, 'top fix group')} for ${report.config.url}.${coverage}`,
          {
            url: report.config.url,
            reportId: report.id,
            summary: report.summary,
            dataSources: report.dataSources,
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
        'List crawler rule ids and guidance metadata. Use this before the explain-crawl-issue report when you need valid rule ids.',
      inputSchema: {
        category: crawlerRuleCategorySchema.optional(),
      },
    },
    async ({ category }) => {
      const rules = listRules().filter((rule) =>
        category ? rule.category === category : true,
      )
      return toolSuccess(`Found ${countLabel(rules.length, 'crawler rule')}.`, {
        rules,
      })
    },
  )

  server.registerTool(
    'seo_affected_urls',
    {
      description:
        'Return affected URLs for a saved or freshly crawled report, filtered by rule, category, or severity.',
      inputSchema: {
        url: z.string().url().optional(),
        reportId: z.string().optional(),
        site: z.string().optional(),
        ruleId: z.string().optional(),
        category: z.string().optional(),
        severity: z.string().optional(),
        maxPages: crawlerInputs.crawlPageLimit,
        fetchIntervalCap: z.number().int().positive().optional(),
        fetchIntervalMs: z.number().int().positive().optional(),
        refresh: z.boolean().optional(),
        limit: z.number().int().positive().optional(),
      },
    },
    async ({
      url,
      reportId,
      site,
      ruleId,
      category,
      severity,
      maxPages,
      fetchIntervalCap,
      fetchIntervalMs,
      refresh,
      limit,
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
        const result = selectAffectedUrls(report, {
          ruleId,
          category,
          severity,
          limit,
        })
        return toolSuccess(
          `Returned ${result.selection.returnedRows} of ${result.selection.totalMatchedRows} affected URLs for ${report.config.url}.`,
          {
            url: report.config.url,
            reportId: report.id,
            dataSources: report.dataSources,
            affectedUrls: result.affectedUrls,
            selection: result.selection,
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

  server.registerTool(
    'seo_compare_crawl_reports',
    {
      description:
        'Compare two saved crawl reports and return page, issue, score, and plain-English change summaries.',
      inputSchema: {
        after: z.string().optional(),
        before: z.string().optional(),
        site: z.string().optional(),
      },
    },
    async ({ after, before, site }) => {
      try {
        const afterReport = resolveSavedReportAlias({
          value: after ?? 'latest',
          site,
        })
        if (!afterReport) {
          return toolError('No newer crawl report found.')
        }
        const beforeReport = resolveSavedReportAlias({
          value: before ?? 'previous',
          site: afterReport.site ?? site,
          skipId: afterReport.id,
        })
        if (!beforeReport) {
          return toolError(
            'No baseline crawl report found. Save at least two reports or pass before.',
          )
        }
        const diff = compareCrawlReports({
          before: beforeReport,
          after: afterReport,
        })
        return toolSuccess(diff.headline, diff)
      } catch (error) {
        return toolError(error)
      }
    },
  )
}
