import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  affectedUrls,
  aiReadiness,
  auditLlmsTxt,
  buildOkfBundle,
  compareCrawlReports,
  crawlSite,
  entityReadiness,
  explainOkfValidation,
  explainRule,
  generateLlmsTxt,
  geoGaps,
  latestCrawlReport,
  listCrawlReports,
  listRules,
  loadCrawlReport,
  saveCrawlReport,
  topFixes,
  validateOkfFiles,
} from '@seo/core'
import * as z from 'zod/v4'
import { fetchRateInput } from './fetch-rate.js'
import { toolError, toolSuccess } from './tool-result.js'

function compactCrawlResult(
  report: Awaited<ReturnType<typeof crawlSite>>,
  opts: { includePages?: boolean; includeIssues?: boolean } = {},
) {
  const requestHeadline =
    report.requestEvidenceStatus === 'available'
      ? `Processed ${report.requests.length} URL requests into ${report.summary.totalPages} unique documents.`
      : report.requestEvidenceStatus === 'partial'
        ? `Observed ${report.requests.length} URL requests and retained ${report.summary.totalPages} unique documents; some started requests were still in flight when the crawl stopped.`
        : `Loaded ${report.summary.totalPages} unique documents; request evidence is unavailable for this legacy report.`
  const payload: Record<string, unknown> = {
    id: report.id,
    definitionId: report.definitionId,
    headline: `${requestHeadline} Found ${report.summary.highIssues} high, ${report.summary.mediumIssues} medium, and ${report.summary.lowIssues} low issues.`,
    status: report.status,
    requestEvidenceStatus: report.requestEvidenceStatus,
    configHash: report.configHash,
    summary: report.summary,
    dataSources: report.dataSources,
    ai: report.ai
      ? {
          robotsTxt: report.ai.robotsTxt,
          llmsTxt: report.ai.llmsTxt,
          agentResources: report.ai.agentResources,
        }
      : undefined,
    topFixes: topFixes(report, { limit: 10 }),
    warnings: report.warnings,
    caveats: report.caveats,
  }
  if (opts.includeIssues) payload.issues = report.issues
  if (opts.includePages) {
    payload.requests = report.requests
    payload.pages = report.pages
  }
  return payload
}

function resolveSavedReportAlias(input: {
  value?: string
  site?: string
  skipId?: string
}) {
  if (!input.value || input.value === 'latest' || input.value === 'previous') {
    const reports = listCrawlReports({ site: input.site, limit: 20 }).filter(
      (report) => report.id !== input.skipId,
    )
    const meta = input.value === 'previous' ? reports[1] : reports[0]
    return meta ? loadCrawlReport(meta.id) : undefined
  }
  return loadCrawlReport(input.value)
}

export function registerCrawlerTools(server: McpServer): void {
  server.registerTool(
    'seo_crawl_site',
    {
      description:
        'Crawl a site and run technical SEO checks. Compact by default; set includePages/includeIssues for raw data.',
      inputSchema: {
        url: z.string().url(),
        site: z.string().optional(),
        ga4PropertyId: z.string().optional(),
        maxPages: z.number().int().positive().optional(),
        maxDepth: z.number().int().nonnegative().optional(),
        concurrency: z.number().int().positive().optional(),
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
      site,
      ga4PropertyId,
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
        const report = await crawlSite({
          url,
          site,
          ga4PropertyId,
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
    'seo_audit_urls',
    {
      description:
        'Audit an explicit list of URLs with technical SEO checks. Compact by default; set includePages/includeIssues for raw data.',
      inputSchema: {
        urls: z.array(z.string().url()).min(1),
        site: z.string().optional(),
        ga4PropertyId: z.string().optional(),
        maxPages: z.number().int().positive().optional(),
        concurrency: z.number().int().positive().optional(),
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
      ga4PropertyId,
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
        const report = await crawlSite({
          url: urls[0] ?? '',
          urls,
          mode: 'list',
          site,
          ga4PropertyId,
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
        maxPages: z.number().int().positive().optional(),
        maxDepth: z.number().int().nonnegative().optional(),
        fetchIntervalCap: z.number().int().positive().optional(),
        fetchIntervalMs: z.number().int().positive().optional(),
        refresh: z.boolean().optional(),
        category: z.string().optional(),
        limit: z.number().int().positive().optional(),
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
        return toolSuccess(
          `Found ${groups.length} top fix groups for ${report.config.url}.`,
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
        maxPages: z.number().int().positive().optional(),
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
        const urls = affectedUrls(report, {
          ruleId,
          category,
          severity,
          limit,
        })
        return toolSuccess(
          `Found ${urls.length} affected URLs for ${report.config.url}.`,
          {
            url: report.config.url,
            reportId: report.id,
            dataSources: report.dataSources,
            affectedUrls: urls,
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
    'seo_geo_gaps',
    {
      description:
        'Return crawl and indexability blockers for Google AI Search eligibility, with optional page observations kept separate. Snippet eligibility is explicitly not yet evaluated.',
      inputSchema: {
        url: z.string().url().optional(),
        reportId: z.string().optional(),
        site: z.string().optional(),
        maxPages: z.number().int().positive().optional(),
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
        const gaps = geoGaps(report, { limit })
        return toolSuccess(
          `Found ${gaps.length} AI Search technical eligibility gap pages for ${report.config.url}.`,
          {
            url: report.config.url,
            reportId: report.id,
            eligibilityGaps: gaps,
          },
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_ai_readiness',
    {
      description:
        'Score observed crawl and technical signals for AI discovery workflows. Paragraph shape and llms.txt are unscored observations, and the report does not predict citations.',
      inputSchema: {
        url: z.string().url().optional(),
        reportId: z.string().optional(),
        site: z.string().optional(),
        maxPages: z.number().int().positive().optional(),
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
        const readiness = aiReadiness(report)
        return toolSuccess(readiness.headline, readiness)
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_llms_txt_audit',
    {
      description:
        'Inspect optional llms.txt presence from a saved or freshly crawled report and return current Google guidance plus candidate pages.',
      inputSchema: {
        url: z.string().url().optional(),
        reportId: z.string().optional(),
        site: z.string().optional(),
        maxPages: z.number().int().positive().optional(),
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
        const audit = auditLlmsTxt(report)
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
        'Generate an llms.txt draft from a saved or freshly crawled report. Returns content and metadata.',
      inputSchema: {
        url: z.string().url().optional(),
        reportId: z.string().optional(),
        site: z.string().optional(),
        maxPages: z.number().int().positive().optional(),
        maxUrls: z.number().int().positive().optional(),
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

  server.registerTool(
    'seo_entity_readiness',
    {
      description:
        'Check schema, sameAs, social profile, author/date, and naming signals from a saved or freshly crawled report.',
      inputSchema: {
        url: z.string().url().optional(),
        reportId: z.string().optional(),
        site: z.string().optional(),
        maxPages: z.number().int().positive().optional(),
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
        const readiness = entityReadiness(report)
        return toolSuccess(readiness.headline, readiness)
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_okf_build',
    {
      description:
        'Build a compact OKF site knowledge manifest from a saved or freshly crawled report. Set includeFiles for bounded inline markdown.',
      inputSchema: {
        url: z.string().url().optional(),
        reportId: z.string().optional(),
        site: z.string().optional(),
        maxPages: z.number().int().positive().optional(),
        maxConcepts: z.number().int().min(1).max(100).optional(),
        includeFiles: z.boolean().optional(),
        title: z.string().min(1).max(200).optional(),
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
      maxConcepts,
      includeFiles,
      title,
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
        const bundle = buildOkfBundle(report, {
          maxConcepts: maxConcepts ?? (includeFiles ? 25 : 100),
          title,
        })
        const validation = validateOkfFiles(bundle.files)
        const { files, ...manifest } = bundle
        return toolSuccess(
          `Built OKF bundle with ${bundle.conceptCount} concepts.`,
          {
            manifest: {
              ...manifest,
              filePaths: files.map((file) => file.path),
            },
            ...(includeFiles ? { files } : {}),
            validation,
          },
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_okf_validate',
    {
      description:
        'Validate OKF markdown files supplied by an agent. Use seo_okf_build to generate files from a crawl.',
      inputSchema: {
        files: z
          .array(
            z.object({
              path: z.string().min(1).max(512),
              content: z.string().max(2_000_000),
            }),
          )
          .min(1)
          .max(5_006),
      },
    },
    async ({ files }) => {
      const validation = validateOkfFiles(files)
      return toolSuccess(
        validation.valid
          ? 'Bundle passes seo OKF checks.'
          : 'Bundle has seo OKF issues.',
        {
          validation,
          explanation: explainOkfValidation(validation),
        },
      )
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
