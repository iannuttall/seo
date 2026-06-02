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
import { toolError, toolSuccess } from './tool-result.js'

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
        site: z.string(),
        days: z.number().optional(),
        recentDays: z.number().optional(),
        limit: z.number().optional(),
        refresh: z.boolean().optional(),
      },
    },
    async ({ site, days, recentDays, limit, refresh }) => {
      try {
        const result = await diagnoseProperty({
          site,
          days,
          recentDays,
          limit,
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
        site: z.string(),
        dimension: z.enum(['page', 'query', 'country', 'device']).optional(),
        days: z.number().optional(),
        compareDays: z.number().optional(),
        limit: z.number().optional(),
        refresh: z.boolean().optional(),
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
        site: z.string(),
        days: z.number().optional(),
        minImpressions: z.number().optional(),
        limit: z.number().optional(),
        verifyContent: z.boolean().optional(),
        verifyLimit: z.number().optional(),
        js: z.boolean().optional(),
        fetchConcurrency: z.number().optional(),
        fetchIntervalCap: z.number().optional(),
        fetchIntervalMs: z.number().optional(),
        refresh: z.boolean().optional(),
      },
    },
    async ({
      site,
      days,
      minImpressions,
      limit,
      verifyContent,
      verifyLimit,
      js,
      fetchConcurrency,
      fetchIntervalCap,
      fetchIntervalMs,
      refresh,
    }) => {
      try {
        const result = await strikingDistance({
          site,
          days,
          minImpressions,
          limit,
          verifyContent,
          verifyLimit,
          js: js ? true : undefined,
          rate: fetchRateInput({
            fetchConcurrency,
            fetchIntervalCap,
            fetchIntervalMs,
          }),
          refresh,
        })
        return toolSuccess(
          `${result.items.length} striking-distance opportunities found.`,
          result,
        )
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
        site: z.string(),
        days: z.number().optional(),
        recentDays: z.number().optional(),
        refresh: z.boolean().optional(),
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
        site: z.string(),
        days: z.number().optional(),
        recentDays: z.number().optional(),
        paddingDays: z.number().optional(),
        refresh: z.boolean().optional(),
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
