import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  aiReferralsReport,
  communityIntentReport,
  contentOptimizationReport,
  countLabel,
  pageOpportunitiesReport,
  performanceAudit,
  seoToAiQueryReport,
} from '@seo/core'
import * as z from 'zod/v4'
import { mcpReportInputSchema } from './report-options.js'
import { toolError, toolSuccess } from './tool-result.js'

const ga4DateSchema = z
  .string()
  .regex(
    /^(?:\d{4}-\d{2}-\d{2}|today|yesterday|\d+daysAgo)$/,
    'Use YYYY-MM-DD or a GA4 relative date.',
  )

const gscDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date.')

const queryOpportunitySchema = {
  site: z.string().trim().min(1),
  days: z.number().int().min(1).max(548).optional(),
  startDate: gscDateSchema.optional(),
  endDate: gscDateSchema.optional(),
  limit: z.number().int().min(1).max(100).optional(),
  minImpressions: z.number().int().min(0).max(1_000_000_000).optional(),
  maxRows: z.number().int().min(1).max(50_000).optional(),
  brandTerms: z.array(z.string().trim().min(1)).max(100).optional(),
  includeBrand: z.boolean().optional(),
  refresh: z.boolean().optional(),
} as const

export function registerAiOpportunityTools(
  server: McpServer,
  dependencies: {
    aiReferralsReport?: typeof aiReferralsReport
    seoToAiQueryReport?: typeof seoToAiQueryReport
    communityIntentReport?: typeof communityIntentReport
  } = {},
): void {
  server.registerTool(
    'seo_ai_referrals',
    {
      description:
        'Find AI referral traffic detected in GA4. Returns the explicit ai-referrals schema v2 contract.',
      inputSchema: {
        property: z.string().trim().min(1),
        startDate: ga4DateSchema.optional(),
        endDate: ga4DateSchema.optional(),
        maxRows: z.number().int().min(1).max(100_000).optional(),
        limit: z.number().int().min(1).max(100_000).optional(),
        refresh: z.boolean().optional(),
      },
    },
    async ({ property, startDate, endDate, maxRows, limit, refresh }) => {
      try {
        const result = await (
          dependencies.aiReferralsReport ?? aiReferralsReport
        )({
          property,
          startDate,
          endDate,
          maxRows,
          limit,
          refresh,
        })
        return toolSuccess(
          `${countLabel(result.summary.sessions, 'AI referral session')} detected across ${countLabel(result.summary.sources, 'source')}; evidence is ${result.dataStatus}.`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_page_opportunities',
    {
      description:
        'Find first-party traffic growth opportunities for one URL from GSC and page content',
      inputSchema: {
        ...mcpReportInputSchema([
          'site',
          'days',
          'limit',
          'minImpressions',
          'includeBrand',
          'verifyContent',
          'refresh',
          'js',
        ]),
        days: z.number().int().min(1).max(548).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        minImpressions: z.number().int().positive().optional(),
        url: z.string().url(),
      },
    },
    async ({
      site,
      url,
      days,
      limit,
      minImpressions,
      includeBrand,
      verifyContent,
      refresh,
      js,
    }) => {
      try {
        const result = await pageOpportunitiesReport({
          site,
          url,
          days,
          limit,
          minImpressions,
          includeBrand,
          verifyContent,
          refresh,
          js: js ? true : 'auto',
        })
        return toolSuccess(result.summary.verdict, result)
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_content_optimization',
    {
      description:
        'Build a content optimization brief for one URL from first-party GSC queries and page content checks',
      inputSchema: {
        ...mcpReportInputSchema([
          'site',
          'days',
          'limit',
          'minImpressions',
          'includeBrand',
          'verifyContent',
          'refresh',
          'js',
        ]),
        days: z.number().int().min(1).max(548).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        minImpressions: z.number().int().positive().optional(),
        url: z.string().url(),
      },
    },
    async ({
      site,
      url,
      days,
      limit,
      minImpressions,
      includeBrand,
      verifyContent,
      refresh,
      js,
    }) => {
      try {
        const result = await contentOptimizationReport({
          site,
          url,
          days,
          limit,
          minImpressions,
          includeBrand,
          verifyContent,
          refresh,
          js: js ? true : 'auto',
        })
        return toolSuccess(result.summary.verdict, result)
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_performance_audit',
    {
      description:
        'Run a local Lighthouse lab audit and optional device-specific CrUX field Core Web Vitals. Configure CrUX with SEO_CRUX_API_KEY.',
      inputSchema: {
        url: z.string().url(),
        strategy: z.enum(['mobile', 'desktop']).optional(),
        refresh: z.boolean().optional(),
      },
    },
    async ({ url, strategy, refresh }) => {
      try {
        const result = await performanceAudit({
          url,
          strategy,
          refresh,
        })
        return toolSuccess(result.headline, result)
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_to_ai_query',
    {
      description:
        'Convert retained GSC queries into deterministic AI monitoring-prompt suggestions with source completeness and heuristic caveats',
      inputSchema: queryOpportunitySchema,
    },
    async ({
      site,
      days,
      startDate,
      endDate,
      limit,
      minImpressions,
      maxRows,
      brandTerms,
      includeBrand,
      refresh,
    }) => {
      try {
        const result = await (
          dependencies.seoToAiQueryReport ?? seoToAiQueryReport
        )({
          site,
          days,
          startDate,
          endDate,
          limit,
          minImpressions,
          maxRows,
          brandTerms,
          includeBrand,
          refresh,
        })
        return toolSuccess(
          `${countLabel(result.summary.prompts, 'monitoring-prompt suggestion')} generated from ${countLabel(result.summary.returnedQueries, 'retained GSC query')}; evidence is ${result.dataStatus}.`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_community_intent',
    {
      description:
        'Classify explicit forum, review, comparison, experience, and recommendation language in retained GSC queries as review hypotheses',
      inputSchema: queryOpportunitySchema,
    },
    async ({
      site,
      days,
      startDate,
      endDate,
      limit,
      minImpressions,
      maxRows,
      brandTerms,
      includeBrand,
      refresh,
    }) => {
      try {
        const result = await (
          dependencies.communityIntentReport ?? communityIntentReport
        )({
          site,
          days,
          startDate,
          endDate,
          limit,
          minImpressions,
          maxRows,
          brandTerms,
          includeBrand,
          refresh,
        })
        return toolSuccess(
          `Evidence status: ${result.dataStatus}. ${result.summary.verdict}`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )
}
