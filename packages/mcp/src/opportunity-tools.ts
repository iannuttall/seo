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

export function registerOpportunityTools(server: McpServer): void {
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
      description: 'Detect decaying query performance',
      inputSchema: {
        ...mcpReportInputSchema(['site', 'includeBrand']),
        minDropPct: z.number().optional(),
        minPreviousClicks: z.number().optional(),
        minClickLoss: z.number().optional(),
      },
    },
    async ({
      site,
      minDropPct,
      minPreviousClicks,
      minClickLoss,
      includeBrand,
    }) => {
      try {
        const result = await decayingReport({
          site,
          minDropPct,
          minPreviousClicks,
          minClickLoss,
          includeBrand,
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
        const result = await quickWinsReport({
          site,
          days,
          limit,
          minImpressions,
          brandTerms,
          verifyContent,
          verifyLimit,
          includeBrand,
          js: js ? true : undefined,
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
        const result = await internalLinksReport({
          site,
          targetUrl,
          days,
          limit,
          checkLimit,
          minImpressions,
          brandTerms,
          includeBrand,
          js: js ? true : undefined,
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
        ...mcpReportInputSchema(['site', 'minImpressions', 'includeBrand']),
      },
    },
    async ({ site, minImpressions, includeBrand }) => {
      try {
        const result = await ctrUnderperformersReport({
          site,
          minImpressions,
          includeBrand,
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
        ]),
        scope: z.string().optional(),
      },
    },
    async ({ site, scope, includeBrand, minImpressions, limit }) => {
      try {
        const result = await queryClusterReport({
          site,
          scope,
          includeBrand,
          minImpressions,
          limit,
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
        const provider = getKeywordProvider('authoritative')
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
