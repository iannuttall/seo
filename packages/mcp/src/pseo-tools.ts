import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  countLabel,
  pseoAuditReport,
  pseoOpportunitiesReport,
  pseoPresentation,
  renderPseoMarkdown,
} from '@seo/core'
import * as z from 'zod/v4'
import { compactAgentWorkflowOutput } from './agent-output-budget.js'
import { resolveJsOption } from './input-schemas.js'
import {
  providerCountryCodeInput,
  providerDeviceInput,
  providerIdInput,
  providerLanguageCodeInput,
  providerLocationInput,
  providerSearchEngineInput,
} from './provider-inputs.js'
import { toolError, toolSuccess } from './tool-result.js'

const pseoOpportunitiesInput = z
  .strictObject({
    site: z.string().trim().min(1).max(2_048),
    days: z.number().int().min(1).max(548).optional(),
    sitemaps: z.array(z.string().url()).max(20).optional(),
    maxSitemapUrls: z.number().int().min(1).max(100_000).optional(),
    templateLimit: z.number().int().min(1).max(25).optional(),
    clusterLimit: z.number().int().min(1).max(25).optional(),
    minimumTemplateUrls: z.number().int().min(2).max(100).optional(),
    minimumTemplateShare: z.number().min(0).max(1).optional(),
    minimumTemplateImpressions: z.number().min(0).max(1_000_000_000).optional(),
    brandTerms: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
    includeBrand: z.boolean().optional(),
    includeExternal: z.boolean().default(false),
    countryCode: providerCountryCodeInput.optional(),
    languageCode: providerLanguageCodeInput.optional(),
    searchEngine: providerSearchEngineInput,
    location: providerLocationInput.optional(),
    device: providerDeviceInput.optional(),
    provider: providerIdInput.optional(),
    discoverySources: z
      .array(z.enum(['ideas', 'related', 'suggestions']))
      .min(1)
      .max(3)
      .default(['suggestions']),
    discoveryLimit: z.number().int().min(1).max(100).optional(),
    candidateLimit: z.number().int().min(1).max(25).optional(),
    serpLimit: z.number().int().min(0).max(3).default(0),
    serpDepth: z.number().int().min(1).max(20).optional(),
    refresh: z.boolean().optional(),
  })
  .superRefine((input, context) => {
    const hasExternalOptions = Boolean(
      input.countryCode ||
        input.languageCode ||
        input.location ||
        input.device ||
        input.provider ||
        input.serpLimit,
    )
    if (!input.includeExternal && hasExternalOptions) {
      context.addIssue({
        code: 'custom',
        path: ['includeExternal'],
        message:
          'Set includeExternal to true before passing market, provider, or SERP options.',
      })
    }
    if (input.includeExternal && (!input.countryCode || !input.languageCode)) {
      context.addIssue({
        code: 'custom',
        path: ['includeExternal'],
        message:
          'External pSEO research requires countryCode and languageCode.',
      })
    }
  })

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

export function registerPseoTools(
  server: McpServer,
  dependencies: {
    pseoAuditReport?: typeof pseoAuditReport
    pseoOpportunitiesReport?: typeof pseoOpportunitiesReport
  } = {},
): void {
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
        fetchConcurrency: z.number().int().min(1).max(16).optional(),
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
        const result = await (dependencies.pseoAuditReport ?? pseoAuditReport)({
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
          js: resolveJsOption(js, 'auto'),
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

  server.registerTool(
    'seo_pseo_opportunities',
    {
      description:
        'Combine bounded template, Search Console cluster, optional keyword discovery, live SERP, competitor pattern, cost, and data-source evidence for programmatic SEO research',
      inputSchema: pseoOpportunitiesInput,
    },
    async ({
      site,
      days,
      sitemaps,
      maxSitemapUrls,
      templateLimit,
      clusterLimit,
      minimumTemplateUrls,
      minimumTemplateShare,
      minimumTemplateImpressions,
      brandTerms,
      includeBrand,
      includeExternal,
      countryCode,
      languageCode,
      searchEngine,
      location,
      device,
      provider,
      discoverySources,
      discoveryLimit,
      candidateLimit,
      serpLimit,
      serpDepth,
      refresh,
    }) => {
      try {
        const report = await (
          dependencies.pseoOpportunitiesReport ?? pseoOpportunitiesReport
        )({
          site,
          days,
          sitemaps,
          maxSitemapUrls,
          templateLimit,
          clusterLimit,
          minimumTemplateUrls,
          minimumTemplateShare,
          minimumTemplateImpressions,
          brandTerms,
          includeBrand,
          includeExternal,
          market:
            countryCode && languageCode
              ? {
                  countryCode,
                  languageCode,
                  searchEngine,
                  location,
                  device,
                }
              : undefined,
          provider,
          discoverySources,
          discoveryLimit,
          candidateLimit,
          serpLimit,
          serpDepth,
          refresh,
        })
        return toolSuccess(
          report.summary.verdict,
          compactAgentWorkflowOutput(
            report as unknown as Record<string, unknown>,
          ),
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )
}
