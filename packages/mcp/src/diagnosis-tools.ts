import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  diagnoseProperty,
  runDoctor,
  segmentImpact,
  strikingDistance,
  trafficAnomaly,
  updateCorrelation,
} from '@seo/core'
import * as z from 'zod/v4'
import { fetchRateInput } from './fetch-rate.js'
import { mcpReportInputSchema } from './report-options.js'
import { toolError, toolSuccess } from './tool-result.js'

type StrikingDistanceToolInput = {
  site: string
  days?: number
  minImpressions?: number
  limit?: number
  verifyContent?: boolean
  verifyLimit?: number
  includeBrand?: boolean
  brandTerms?: string[]
  js?: boolean
  fetchConcurrency?: number
  fetchIntervalCap?: number
  fetchIntervalMs?: number
  refresh?: boolean
}

export function registerDiagnosisTools(server: McpServer): void {
  server.registerTool(
    'seo_doctor',
    {
      description: 'Check local auth, scopes, config, and defaults',
      inputSchema: {},
    },
    async () => {
      try {
        const result = await runDoctor()
        return toolSuccess(
          result.ok
            ? 'Local seo setup is ready.'
            : 'Local seo setup needs attention.',
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_diagnose_property',
    {
      description:
        'Run end-to-end property diagnosis across anomaly, update, segment, decay, cannibalisation, and opportunity signals',
      inputSchema: {
        ...mcpReportInputSchema([
          'site',
          'days',
          'recentDays',
          'limit',
          'includeBrand',
          'refresh',
        ]),
      },
    },
    async ({ site, days, recentDays, limit, includeBrand, refresh }) => {
      try {
        const result = await diagnoseProperty({
          site,
          days,
          recentDays,
          limit,
          includeBrand,
          refresh,
        })
        return toolSuccess(
          `Diagnosis complete. Classification: ${result.summary.classification}.`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_segment_impact',
    {
      description:
        'Compare GSC movement by page, query, device, or country across two adjacent periods',
      inputSchema: {
        ...mcpReportInputSchema(['site', 'days', 'limit', 'refresh']),
        dimension: z.enum(['page', 'query', 'country', 'device']).optional(),
        compareDays: z.number().optional(),
      },
    },
    async ({ site, dimension, days, compareDays, limit, refresh }) => {
      try {
        const result = await segmentImpact({
          site,
          dimension,
          days,
          compareDays,
          limit,
          refresh,
        })
        return toolSuccess(
          `${result.items.length} ${result.dimension} segments compared.`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_striking_distance',
    {
      description: 'Find position 11-20 query/page opportunities from GSC',
      inputSchema: {
        ...mcpReportInputSchema([
          'site',
          'days',
          'minImpressions',
          'limit',
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
        minImpressions: z.number().int().min(0).max(1_000_000_000).optional(),
        limit: z.number().int().min(1).max(100).optional(),
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
      minImpressions,
      limit,
      verifyContent,
      verifyLimit,
      includeBrand,
      brandTerms,
      js,
      fetchConcurrency,
      fetchIntervalCap,
      fetchIntervalMs,
      refresh,
    }: StrikingDistanceToolInput) => {
      try {
        const result = await strikingDistance({
          site,
          days,
          minImpressions,
          limit,
          verifyContent,
          verifyLimit,
          includeBrand,
          brandTerms,
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
    'seo_traffic_anomaly',
    {
      description:
        'Detect statistically significant recent GSC traffic movement',
      inputSchema: {
        ...mcpReportInputSchema(['site', 'days', 'recentDays', 'refresh']),
      },
    },
    async ({ site, days, recentDays, refresh }) => {
      try {
        const result = await trafficAnomaly({ site, days, recentDays, refresh })
        return toolSuccess(
          `${result.anomalies.filter((item) => item.significant).length} significant anomalies found.`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_update_correlate',
    {
      description:
        'Overlay recent traffic anomalies against official Google ranking update windows',
      inputSchema: {
        ...mcpReportInputSchema(['site', 'days', 'recentDays', 'refresh']),
        paddingDays: z.number().optional(),
      },
    },
    async ({ site, days, recentDays, paddingDays, refresh }) => {
      try {
        const result = await updateCorrelation({
          site,
          days,
          recentDays,
          paddingDays,
          refresh,
        })
        return toolSuccess(`Classification: ${result.classification}.`, result)
      } catch (error) {
        return toolError(error)
      }
    },
  )
}
