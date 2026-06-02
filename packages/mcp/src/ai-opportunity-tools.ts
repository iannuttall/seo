import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  aiReferralsReport,
  communityIntentReport,
  pageOpportunitiesReport,
  seoToAiQueryReport,
} from '@seo/core'
import * as z from 'zod/v4'
import { mcpReportInputSchema } from './report-options.js'
import { toolError, toolSuccess } from './tool-result.js'

export function registerAiOpportunityTools(server: McpServer): void {
  server.registerTool(
    'seo_ai_referrals',
    {
      description: 'Find AI referral traffic detected in GA4',
      inputSchema: {
        property: z.string(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().optional(),
      },
    },
    async ({ property, startDate, endDate, limit }) => {
      try {
        const result = await aiReferralsReport({
          property,
          startDate,
          endDate,
          limit,
        })
        return toolSuccess(
          `${result.summary.sessions} AI referral session(s) detected across ${result.summary.sources} source(s).`,
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
          'includeBrand',
          'verifyContent',
          'refresh',
          'js',
        ]),
        url: z.string().url(),
      },
    },
    async ({
      site,
      url,
      days,
      limit,
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
          includeBrand,
          verifyContent,
          refresh,
          js: js ? true : 'auto',
        })
        return toolSuccess(
          `${result.summary.opportunities} opportunity item(s) found from ${result.summary.queries} page query row(s).`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_to_ai_query',
    {
      description:
        'Convert GSC search queries into natural-language AI monitoring prompts',
      inputSchema: {
        ...mcpReportInputSchema([
          'site',
          'days',
          'limit',
          'minImpressions',
          'includeBrand',
          'refresh',
        ]),
      },
    },
    async ({ site, days, limit, minImpressions, includeBrand, refresh }) => {
      try {
        const result = await seoToAiQueryReport({
          site,
          days,
          limit,
          minImpressions,
          includeBrand,
          refresh,
        })
        return toolSuccess(
          `${result.summary.prompts} AI-style prompt(s) generated from ${result.summary.sourceQueries} GSC queries.`,
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
        'Find GSC queries with forum, review, comparison, and lived-experience intent',
      inputSchema: {
        ...mcpReportInputSchema([
          'site',
          'days',
          'limit',
          'minImpressions',
          'includeBrand',
          'refresh',
        ]),
      },
    },
    async ({ site, days, limit, minImpressions, includeBrand, refresh }) => {
      try {
        const result = await communityIntentReport({
          site,
          days,
          limit,
          minImpressions,
          includeBrand,
          refresh,
        })
        return toolSuccess(
          `${result.summary.items} community-intent queries found.`,
          result,
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )
}
