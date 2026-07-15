import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  diagnosePropertyWorkflow,
  monthlyReportWorkflow,
  refreshPrioritiesWorkflow,
  renderWorkflowMarkdown,
  technicalWatchWorkflow,
  updatePostmortemWorkflow,
  type WorkflowReport,
  workflowPresentation,
} from '@seo/core'
import * as z from 'zod/v4'
import { calendarMonthSchema, resolveJsOption } from './input-schemas.js'
import { mcpReportInputSchema } from './report-options.js'
import { toolError, toolSuccess } from './tool-result.js'

const technicalWatchInputSchema = z
  .strictObject({
    site: z.string().trim().min(1).max(2_048),
    startUrl: z.string().url().optional(),
    urls: z.array(z.string().url()).min(1).max(100).optional(),
    sitemaps: z.array(z.string().url()).min(1).max(20).optional(),
    properties: z
      .array(z.string().trim().min(1).max(2_048))
      .min(1)
      .max(1_000)
      .optional(),
    limit: z.number().int().min(1).max(250_000).optional(),
    refresh: z.boolean().optional(),
    js: z.boolean().optional(),
    languageCode: z.string().trim().min(1).max(35).optional(),
    dailyLimit: z.number().int().min(1).max(2_000).optional(),
    inspectLimit: z.number().int().min(1).max(100).optional(),
    maxUrls: z.number().int().min(1).max(250_000).optional(),
    recoverLinks: z.boolean().optional(),
    recoverDays: z.number().int().min(1).max(548).optional(),
    recoverLimit: z.number().int().min(1).max(100).optional(),
    recoverMinClicks: z.number().int().min(0).max(1_000_000_000).optional(),
    recoverMinImpressions: z
      .number()
      .int()
      .min(0)
      .max(1_000_000_000)
      .optional(),
  })
  .superRefine((input, context) => {
    const hasIndexInput = Boolean(input.urls?.length || input.sitemaps?.length)
    if (!input.startUrl && !hasIndexInput && input.recoverLinks === false) {
      context.addIssue({
        code: 'custom',
        path: ['recoverLinks'],
        message:
          'Pass startUrl, urls, sitemaps, or enable link recovery for technical-watch.',
      })
    }
  })

function workflowSuccess(result: WorkflowReport<unknown>) {
  return toolSuccess(
    result.summary,
    {
      ...result,
      presentation: workflowPresentation(result),
    },
    {
      markdown: renderWorkflowMarkdown(result),
    },
  )
}

export function registerWorkflowTools(server: McpServer): void {
  server.registerTool(
    'seo_workflow_diagnose_property',
    {
      description:
        'Run the full agent workflow for property diagnosis and next actions',
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
        const result = await diagnosePropertyWorkflow({
          site,
          days,
          recentDays,
          limit,
          includeBrand,
          refresh,
        })
        return workflowSuccess(result)
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_workflow_monthly_report',
    {
      description: 'Run the monthly reporting workflow with next actions',
      inputSchema: {
        ...mcpReportInputSchema(['site', 'limit', 'includeBrand', 'refresh']),
        month: calendarMonthSchema.optional(),
      },
    },
    async ({ site, month, limit, includeBrand, refresh }) => {
      try {
        const result = await monthlyReportWorkflow({
          site,
          month,
          limit,
          includeBrand,
          refresh,
        })
        return workflowSuccess(result)
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_workflow_update_postmortem',
    {
      description:
        'Run winner/loser postmortem analysis for recent Google update exposure',
      inputSchema: {
        ...mcpReportInputSchema([
          'site',
          'days',
          'recentDays',
          'limit',
          'includeBrand',
          'refresh',
        ]),
        knownConfounders: z.array(z.string()).optional(),
        includeChangeLog: z.boolean().optional(),
      },
    },
    async ({
      site,
      days,
      recentDays,
      limit,
      includeBrand,
      knownConfounders,
      includeChangeLog,
      refresh,
    }) => {
      try {
        const result = await updatePostmortemWorkflow({
          site,
          days,
          recentDays,
          limit,
          includeBrand,
          knownConfounders,
          includeChangeLog,
          refresh,
        })
        return workflowSuccess(result)
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_workflow_technical_watch',
    {
      description:
        'Run scheduled-style crawl-diff and index-watch monitoring in one workflow',
      inputSchema: technicalWatchInputSchema,
    },
    async ({
      site,
      startUrl,
      urls,
      sitemaps,
      properties,
      limit,
      refresh,
      js,
      languageCode,
      dailyLimit,
      inspectLimit,
      maxUrls,
      recoverLinks,
      recoverDays,
      recoverLimit,
      recoverMinClicks,
      recoverMinImpressions,
    }) => {
      try {
        const result = await technicalWatchWorkflow({
          site,
          startUrl,
          urls,
          sitemaps,
          properties,
          limit,
          refresh,
          js: resolveJsOption(js, 'auto'),
          languageCode,
          dailyLimit,
          inspectLimit,
          maxUrls,
          recoverLinks,
          recoverDays,
          recoverLimit,
          recoverMinClicks,
          recoverMinImpressions,
        })
        return workflowSuccess(result)
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_workflow_refresh_priorities',
    {
      description:
        'Rank decay, striking-distance, quick-win, cannibalisation, and diagnosis signals into an action queue',
      inputSchema: {
        ...mcpReportInputSchema([
          'site',
          'days',
          'recentDays',
          'limit',
          'includeBrand',
          'verifyContent',
          'verifyLimit',
          'refresh',
        ]),
        googleAnalyticsPropertyId: z.string().optional(),
      },
    },
    async ({
      site,
      days,
      recentDays,
      limit,
      includeBrand,
      googleAnalyticsPropertyId,
      verifyContent,
      verifyLimit,
      refresh,
    }) => {
      try {
        const result = await refreshPrioritiesWorkflow({
          site,
          days,
          recentDays,
          limit,
          includeBrand,
          googleAnalyticsPropertyId,
          verifyContent,
          verifyLimit,
          refresh,
        })
        return workflowSuccess(result)
      } catch (error) {
        return toolError(error)
      }
    },
  )
}
