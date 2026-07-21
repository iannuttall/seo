import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  cannibalReport,
  ctrUnderperformersReport,
  decayingReport,
  getKeywordProvider,
  internalLinksReport,
  queryClusterReport,
  quickWinsReport,
} from '@seo/core'
import * as z from 'zod/v4'
import { fetchRateInput } from './fetch-rate.js'
import { resolveJsOption } from './input-schemas.js'
import { mcpReportInputSchema } from './report-options.js'
import { summarize, toolError, toolSuccess } from './tool-result.js'

type QuickWinsToolInput = {
  site: string
  days?: number
  limit?: number
  minImpressions?: number
  brandTerms?: string[]
  verifyContent?: boolean
  verifyLimit?: number
  includeBrand?: boolean
  js?: boolean
  fetchConcurrency?: number
  fetchIntervalCap?: number
  fetchIntervalMs?: number
  refresh?: boolean
}

type InternalLinksToolInput = {
  site: string
  targetUrl: string
  days?: number
  limit?: number
  checkLimit?: number
  minImpressions?: number
  brandTerms?: string[]
  includeBrand?: boolean
  js?: boolean
  fetchConcurrency?: number
  fetchIntervalCap?: number
  fetchIntervalMs?: number
  refresh?: boolean
}

export function registerOpportunityTools(
  server: McpServer,
  dependencies: {
    ctrUnderperformersReport?: typeof ctrUnderperformersReport
    internalLinksReport?: typeof internalLinksReport
    queryClusterReport?: typeof queryClusterReport
    quickWinsReport?: typeof quickWinsReport
  } = {},
): void {
  server.registerTool(
    'seo_cannibal',
    {
      description:
        'Find multi-URL query exposure candidates for intent and technical review',
      inputSchema: {
        ...mcpReportInputSchema([
          'site',
          'days',
          'limit',
          'minImpressions',
          'includeBrand',
          'refresh',
        ]),
        days: z.number().int().min(1).max(548).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        minImpressions: z.number().int().min(0).max(1_000_000_000).optional(),
        brandTerms: z
          .array(z.string().trim().min(1).max(200))
          .max(20)
          .optional(),
      },
    },
    async ({
      site,
      days,
      limit,
      minImpressions,
      brandTerms,
      includeBrand,
      refresh,
    }) => {
      try {
        const result = await cannibalReport({
          site,
          days,
          limit,
          minImpressions,
          brandTerms,
          includeBrand,
          refresh,
        })
        return toolSuccess(result.summary.verdict, result)
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_decaying',
    {
      description:
        'Find query/page click declines observed in both retained GSC windows and investigation signals',
      inputSchema: {
        ...mcpReportInputSchema([
          'site',
          'days',
          'limit',
          'includeBrand',
          'refresh',
        ]),
        days: z.number().int().min(1).max(548).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        comparison: z.enum(['previous-period', 'year-over-year']).optional(),
        minDropPct: z.number().min(0).max(100).optional(),
        minPreviousClicks: z.number().min(0).max(1_000_000_000).optional(),
        minClickLoss: z.number().min(0).max(1_000_000_000).optional(),
        brandTerms: z
          .array(z.string().trim().min(1).max(200))
          .max(20)
          .optional(),
      },
    },
    async ({
      site,
      days,
      limit,
      comparison,
      minDropPct,
      minPreviousClicks,
      minClickLoss,
      brandTerms,
      includeBrand,
      refresh,
    }) => {
      try {
        const result = await decayingReport({
          site,
          days,
          limit,
          comparison,
          minDropPct,
          minPreviousClicks,
          minClickLoss,
          brandTerms,
          includeBrand,
          refresh,
        })
        return toolSuccess(result.summary.verdict, result)
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_quick_wins',
    {
      description: 'Find quick-win CTR/position opportunities',
      inputSchema: {
        ...mcpReportInputSchema([
          'site',
          'days',
          'limit',
          'minImpressions',
          'verifyContent',
          'verifyLimit',
          'includeBrand',
          'js',
          'fetchConcurrency',
          'fetchIntervalCap',
          'fetchIntervalMs',
          'refresh',
        ]),
        days: z.number().int().min(1).max(548).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        minImpressions: z.number().int().min(0).max(1_000_000_000).optional(),
        verifyLimit: z.number().int().min(0).max(100).optional(),
        brandTerms: z
          .array(z.string().trim().min(1).max(200))
          .max(20)
          .optional(),
        fetchConcurrency: z.number().int().min(1).max(16).optional(),
        fetchIntervalCap: z.number().int().min(1).max(60).optional(),
        fetchIntervalMs: z.number().int().min(100).max(60_000).optional(),
      },
    },
    async ({
      site,
      days,
      limit,
      minImpressions,
      brandTerms,
      verifyContent,
      verifyLimit,
      includeBrand,
      js,
      fetchConcurrency,
      fetchIntervalCap,
      fetchIntervalMs,
      refresh,
    }: QuickWinsToolInput) => {
      try {
        const result = await (dependencies.quickWinsReport ?? quickWinsReport)({
          site,
          days,
          limit,
          minImpressions,
          brandTerms,
          verifyContent,
          verifyLimit,
          includeBrand,
          js: resolveJsOption(js, undefined),
          rate: fetchRateInput({
            fetchConcurrency,
            fetchIntervalCap,
            fetchIntervalMs,
          }),
          refresh,
        })
        return toolSuccess(result.summary.verdict, result)
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_internal_links',
    {
      description:
        'Find verified internal-link review candidates for a target URL',
      inputSchema: {
        ...mcpReportInputSchema([
          'site',
          'days',
          'limit',
          'checkLimit',
          'minImpressions',
          'includeBrand',
          'js',
          'fetchConcurrency',
          'fetchIntervalCap',
          'fetchIntervalMs',
          'refresh',
        ]),
        targetUrl: z
          .string()
          .url()
          .refine((value) => /^https?:\/\//.test(value), 'Use an HTTP(S) URL.'),
        days: z.number().int().min(1).max(548).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        checkLimit: z.number().int().min(1).max(200).optional(),
        minImpressions: z.number().min(0).max(1_000_000_000).optional(),
        brandTerms: z
          .array(z.string().trim().min(1).max(200))
          .max(20)
          .optional(),
        fetchConcurrency: z.number().int().min(1).max(16).optional(),
        fetchIntervalCap: z.number().int().min(1).max(60).optional(),
        fetchIntervalMs: z.number().int().min(100).max(60_000).optional(),
      },
    },
    async ({
      site,
      targetUrl,
      days,
      limit,
      checkLimit,
      minImpressions,
      brandTerms,
      includeBrand,
      js,
      fetchConcurrency,
      fetchIntervalCap,
      fetchIntervalMs,
      refresh,
    }: InternalLinksToolInput) => {
      try {
        const result = await (
          dependencies.internalLinksReport ?? internalLinksReport
        )({
          site,
          targetUrl,
          days,
          limit,
          checkLimit,
          minImpressions,
          brandTerms,
          includeBrand,
          js: resolveJsOption(js, undefined),
          rate: fetchRateInput({
            fetchConcurrency,
            fetchIntervalCap,
            fetchIntervalMs,
          }),
          refresh,
        })
        return toolSuccess(result.summary.verdict, result)
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_ctr_underperformers',
    {
      description:
        'Find high-impression queries underperforming CTR expectations',
      inputSchema: {
        ...mcpReportInputSchema([
          'site',
          'minImpressions',
          'limit',
          'includeBrand',
          'refresh',
        ]),
        site: z.string().trim().min(1),
        minImpressions: z.number().int().min(1).max(1_000_000_000).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        brandTerms: z
          .array(z.string().trim().min(1).max(200))
          .max(20)
          .optional(),
      },
    },
    async ({
      site,
      minImpressions,
      limit,
      brandTerms,
      includeBrand,
      refresh,
    }) => {
      try {
        const result = await (
          dependencies.ctrUnderperformersReport ?? ctrUnderperformersReport
        )({
          site,
          minImpressions,
          limit,
          brandTerms,
          includeBrand,
          refresh,
        })
        return toolSuccess(result.summary.verdict, result)
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_query_cluster',
    {
      description: 'Cluster queries by token overlap',
      inputSchema: {
        ...mcpReportInputSchema([
          'site',
          'includeBrand',
          'minImpressions',
          'limit',
          'refresh',
        ]),
        site: z.string().trim().min(1),
        scope: z.string().trim().min(1).max(2_000).optional(),
        minImpressions: z.number().int().min(1).max(1_000_000_000).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        brandTerms: z
          .array(z.string().trim().min(1).max(200))
          .max(20)
          .optional(),
      },
    },
    async ({
      site,
      scope,
      brandTerms,
      includeBrand,
      minImpressions,
      limit,
      refresh,
    }) => {
      try {
        const result = await (
          dependencies.queryClusterReport ?? queryClusterReport
        )({
          site,
          scope,
          brand: brandTerms?.[0],
          brandTerms,
          includeBrand,
          minImpressions,
          limit,
          refresh,
        })
        return toolSuccess(result.summary.verdict, result)
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'semrush_call',
    {
      description:
        'Raw-ish Semrush passthrough for supported keyword endpoints',
      inputSchema: {
        endpoint: z.enum(['phrase_this', 'phrase_related', 'phrase_questions']),
        phrase: z.string(),
      },
    },
    async ({ endpoint, phrase }) => {
      try {
        const provider = await getKeywordProvider('authoritative')
        if (!provider) {
          throw new Error('No keyword provider configured.')
        }

        const result =
          endpoint === 'phrase_this'
            ? await provider.keywordOverview(phrase)
            : endpoint === 'phrase_related'
              ? await provider.relatedKeywords?.(phrase)
              : await provider.questions?.(phrase)

        if (!result) {
          throw new Error(
            `Endpoint ${endpoint} is not supported by the active provider.`,
          )
        }

        return toolSuccess(summarize(result.data), result)
      } catch (error) {
        return toolError(error)
      }
    },
  )
}
