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
  minImpressions?: number
  verifyContent?: boolean
  verifyLimit?: number
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
      description: 'Detect keyword cannibalisation',
      inputSchema: {
        site: z.string(),
        minImpressions: z.number().optional(),
        includeBrand: z.boolean().optional(),
      },
    },
    async ({ site, minImpressions, includeBrand }) => {
      try {
        const result = await cannibalReport({
          site,
          minImpressions,
          includeBrand,
        })
        return toolSuccess(
          `${result.items.length} cannibalisation clusters found; ${result.suppressed.length} likely false positives suppressed.`,
          result,
        )
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
        site: z.string(),
        minDropPct: z.number().optional(),
        minPreviousClicks: z.number().optional(),
        minClickLoss: z.number().optional(),
        includeBrand: z.boolean().optional(),
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
        return toolSuccess(
          `${result.items.length} decaying query/page rows found across ${result.groups.length} cluster(s).`,
          result,
        )
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
      },
    },
    async ({
      site,
      minImpressions,
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
          minImpressions,
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
        return toolSuccess(
          `${result.items.length} quick wins found across ${result.groups.length} repeated query/template cluster(s).`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_internal_links',
    {
      description: 'Find internal link opportunities for a target URL',
      inputSchema: {
        site: z.string(),
        targetUrl: z.string().url(),
        limit: z.number().optional(),
      },
    },
    async ({ site, targetUrl, limit }) => {
      try {
        const result = await internalLinksReport({ site, targetUrl, limit })
        return toolSuccess(
          `${result.items.length} internal link opportunities found.`,
          result,
        )
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
        site: z.string(),
        minImpressions: z.number().optional(),
        includeBrand: z.boolean().optional(),
      },
    },
    async ({ site, minImpressions, includeBrand }) => {
      try {
        const result = await ctrUnderperformersReport({
          site,
          minImpressions,
          includeBrand,
        })
        return toolSuccess(
          `${result.items.length} CTR underperformers found.`,
          result,
        )
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
        site: z.string(),
        scope: z.string().optional(),
      },
    },
    async ({ site, scope }) => {
      try {
        const result = await queryClusterReport({ site, scope })
        return toolSuccess(
          `${result.clusters.length} clusters generated.`,
          result,
        )
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
