import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  auditPage,
  monthlyReport,
  reportNarrative,
  secondPage,
} from '@seo/core'
import * as z from 'zod/v4'
import { fetchRateInput } from './fetch-rate.js'
import { toolError, toolSuccess } from './tool-result.js'

export function registerReportTools(server: McpServer): void {
  server.registerTool(
    'seo_report_narrative',
    {
      description:
        'Generate a client-ready SEO narrative across diagnosis, changes, and monitoring',
      inputSchema: {
        site: z.string(),
        days: z.number().optional(),
        recentDays: z.number().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().optional(),
        changeLimit: z.number().optional(),
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
      recentDays,
      startDate,
      endDate,
      limit,
      changeLimit,
      verifyContent,
      verifyLimit,
      js,
      fetchConcurrency,
      fetchIntervalCap,
      fetchIntervalMs,
      refresh,
    }) => {
      try {
        const result = await reportNarrative({
          site,
          days,
          recentDays,
          startDate,
          endDate,
          limit,
          changeLimit,
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
        return toolSuccess(result.headline, result)
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_monthly_report',
    {
      description: 'Generate a monthly SEO report narrative',
      inputSchema: {
        site: z.string(),
        month: z.string().optional(),
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
      month,
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
        const result = await monthlyReport({
          site,
          month,
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
          `Monthly report generated for ${result.month}. ${result.headline}`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_audit_page',
    {
      description: 'Run a single-page technical and content audit',
      inputSchema: {
        url: z.string().url(),
        site: z.string().optional(),
        js: z.boolean().optional(),
        refresh: z.boolean().optional(),
      },
    },
    async ({ url, site, js, refresh }) => {
      try {
        const result = await auditPage({
          url,
          site,
          js: js ? true : 'auto',
          refresh,
        })
        return toolSuccess(
          `Audit complete for ${url}. Found ${result.issues.length} issues.`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_second_page',
    {
      description:
        'Find page-two opportunities with evidence-grounded recommendations',
      inputSchema: {
        site: z.string(),
        range: z.number().optional(),
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
      range,
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
        const result = await secondPage({
          site,
          range,
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
          `${result.items.length} page-two opportunities found.`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )
}
