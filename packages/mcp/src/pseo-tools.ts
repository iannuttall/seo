import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  countLabel,
  pseoAuditReport,
  pseoPresentation,
  renderPseoMarkdown,
} from '@seo/core'
import * as z from 'zod/v4'
import { toolError, toolSuccess } from './tool-result.js'

export function compactPseoReport(
  result: Awaited<ReturnType<typeof pseoAuditReport>>,
) {
  return {
    schemaVersion: result.schemaVersion,
    methodology: result.methodology,
    site: result.site,
    generatedAt: result.generatedAt,
    range: result.range,
    dataStatus: result.dataStatus,
    summary: result.summary,
    source: result.source,
    selection: result.selection,
    caveats: result.caveats,
    warnings: result.warnings,
    templates: result.templates.map((template) => ({
      signature: template.signature,
      urlCount: template.urlCount,
      sampleUrls: template.sampleUrls,
      population: template.population,
      verdict: template.verdict,
      confidence: template.confidence,
      metrics: template.metrics,
      crawl: {
        requested: template.crawl.requested,
        attempted: template.crawl.attempted,
        usable: template.crawl.usable,
        blockedOrFailed: template.crawl.blockedOrFailed,
      },
      inspection: {
        requested: template.inspection.requested,
        attempted: template.inspection.attempted,
        indexed: template.inspection.indexed,
        notIndexed: template.inspection.notIndexed,
        unknown: template.inspection.unknown,
      },
      evidence: template.evidence,
      recommendation: template.recommendation,
    })),
  }
}

export function registerPseoTools(server: McpServer): void {
  server.registerTool(
    'seo_pseo_audit',
    {
      description:
        'Audit pSEO templates with first-party GSC, optional crawl, and optional URL Inspection evidence',
      inputSchema: {
        site: z.string().min(1),
        days: z.number().int().min(1).max(548).optional(),
        sitemaps: z.array(z.string().url()).max(20).optional(),
        maxSitemapUrls: z.number().int().min(1).max(100_000).optional(),
        templateLimit: z.number().int().min(1).max(100).optional(),
        minimumTemplateUrls: z.number().int().min(2).max(100).optional(),
        minimumTemplateShare: z.number().min(0).max(1).optional(),
        minimumTemplateImpressions: z
          .number()
          .min(0)
          .max(1_000_000_000)
          .optional(),
        crawlSamples: z.number().int().min(0).max(10).optional(),
        inspectSamples: z.number().int().min(0).max(10).optional(),
        brandTerms: z.array(z.string().min(1).max(200)).max(20).optional(),
        includeBrand: z.boolean().optional(),
        refresh: z.boolean().optional(),
        js: z.boolean().optional(),
        fetchConcurrency: z.number().int().min(1).max(20).optional(),
        fetchIntervalCap: z.number().int().min(1).max(100).optional(),
        fetchIntervalMs: z.number().int().min(100).max(60_000).optional(),
        detail: z.enum(['summary', 'full']).optional(),
      },
    },
    async ({
      site,
      days,
      sitemaps,
      templateLimit,
      maxSitemapUrls,
      minimumTemplateUrls,
      minimumTemplateShare,
      minimumTemplateImpressions,
      crawlSamples,
      inspectSamples,
      brandTerms,
      includeBrand,
      refresh,
      js,
      fetchConcurrency,
      fetchIntervalCap,
      fetchIntervalMs,
      detail,
    }) => {
      try {
        const result = await pseoAuditReport({
          site,
          days,
          sitemaps,
          maxSitemapUrls,
          templateLimit,
          minimumTemplateUrls,
          minimumTemplateShare,
          minimumTemplateImpressions,
          crawlSamples,
          inspectSamples,
          brandTerms,
          includeBrand,
          refresh,
          js: js ? true : 'auto',
          rate: {
            concurrency: fetchConcurrency,
            intervalCap: fetchIntervalCap,
            intervalMs: fetchIntervalMs,
          },
        })
        const full = detail === 'full'
        return toolSuccess(
          `${countLabel(result.summary.templates, 'pSEO template')} audited from ${countLabel(result.summary.gscPages, 'GSC page')}.`,
          full
            ? { report: result, presentation: pseoPresentation(result) }
            : { report: compactPseoReport(result) },
          full ? { markdown: renderPseoMarkdown(result) } : undefined,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )
}
