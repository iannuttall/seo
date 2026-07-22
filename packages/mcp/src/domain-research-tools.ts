import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  competitorKeywordGapReport,
  domainOverviewReport,
  rankedKeywordsReport,
  rankingPagesReport,
  serpCompetitorsReport,
} from '@seo/core'
import * as z from 'zod/v4'
import { compactAgentWorkflowOutput } from './agent-output-budget.js'
import {
  providerCountryCodeInput as countryCodeInput,
  providerKeywordInput as keywordInput,
  providerLanguageCodeInput as languageCodeInput,
  providerIdInput,
} from './provider-inputs.js'
import { toolError, toolSuccess } from './tool-result.js'

const domainInput = z.string().trim().min(3).max(253)
const siteInput = z.string().trim().min(1).max(2_048)
const projectIdInput = z.string().trim().min(1).max(80).optional()
const resultTypesInput = z
  .array(
    z.enum([
      'organic',
      'paid',
      'featured_snippet',
      'local_pack',
      'ai_overview_reference',
    ]),
  )
  .min(1)
  .max(5)
  .optional()
const marketInput = {
  countryCode: countryCodeInput,
  languageCode: languageCodeInput,
  searchEngine: z.literal('google').default('google'),
}
const commonInput = {
  ...marketInput,
  provider: providerIdInput.optional(),
  projectId: projectIdInput,
  refresh: z.boolean().optional(),
}
const declaredCompetitorInput = z.strictObject({
  domain: domainInput,
  siteType: z.enum([
    'business',
    'publisher',
    'directory',
    'community',
    'marketplace',
    'unknown',
  ]),
})
const gapCompetitorInput = z.strictObject({
  domain: domainInput,
  siteType: z.enum([
    'business',
    'publisher',
    'directory',
    'community',
    'marketplace',
  ]),
})

const domainOverviewInput = z.strictObject({
  domain: domainInput,
  site: siteInput.optional(),
  days: z.number().int().min(1).max(548).optional(),
  ...commonInput,
})

const rankedKeywordsInput = z.strictObject({
  target: z.string().trim().min(3).max(2_048),
  site: siteInput.optional(),
  days: z.number().int().min(1).max(548).optional(),
  includeSubdomains: z.boolean().optional(),
  resultTypes: resultTypesInput,
  minSearchVolume: z.number().int().min(0).optional(),
  maxRank: z.number().int().min(1).max(100).optional(),
  excludeTerms: z.array(z.string().trim().min(1).max(80)).max(5).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).max(100_000).default(0),
  ...commonInput,
})

const rankingPagesInput = z.strictObject({
  domain: domainInput,
  site: siteInput.optional(),
  days: z.number().int().min(1).max(548).optional(),
  minEstimatedTraffic: z.number().min(0).optional(),
  minRankedKeywords: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).max(100_000).default(0),
  ...commonInput,
})

const serpCompetitorsInput = z.strictObject({
  keywords: z.array(keywordInput).min(2).max(200),
  targetDomain: domainInput.optional(),
  declaredCompetitors: z.array(declaredCompetitorInput).max(10).optional(),
  resultTypes: resultTypesInput,
  limit: z.number().int().min(1).max(100).default(25),
  offset: z.number().int().min(0).max(100_000).default(0),
  ...commonInput,
})

const competitorGapInput = z.strictObject({
  site: siteInput,
  competitors: z.array(gapCompetitorInput).min(1).max(3),
  days: z.number().int().min(1).max(548).optional(),
  limitPerDomain: z.number().int().min(1).max(250).default(100),
  candidateLimit: z.number().int().min(1).max(100).default(50),
  minSearchVolume: z.number().int().min(0).optional(),
  maxRank: z.number().int().min(1).max(100).optional(),
  includeSubdomains: z.boolean().optional(),
  ...commonInput,
})

function market(input: {
  countryCode: string
  languageCode: string
  searchEngine: 'google'
}) {
  return {
    countryCode: input.countryCode,
    languageCode: input.languageCode,
    searchEngine: input.searchEngine,
  }
}

function result(report: { summary: { verdict: string } }) {
  return toolSuccess(
    report.summary.verdict,
    compactAgentWorkflowOutput(report as unknown as Record<string, unknown>),
  )
}

export function registerDomainResearchTools(
  server: McpServer,
  dependencies: {
    domainOverviewReport?: typeof domainOverviewReport
    rankedKeywordsReport?: typeof rankedKeywordsReport
    rankingPagesReport?: typeof rankingPagesReport
    serpCompetitorsReport?: typeof serpCompetitorsReport
    competitorKeywordGapReport?: typeof competitorKeywordGapReport
  } = {},
): void {
  server.registerTool(
    'seo_domain_overview',
    {
      description:
        'Compare a bounded country-level domain footprint with optional owner-verified Search Console totals',
      inputSchema: domainOverviewInput,
    },
    async (input) => {
      try {
        return result(
          await (dependencies.domainOverviewReport ?? domainOverviewReport)({
            ...input,
            market: market(input),
          }),
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_ranked_keywords',
    {
      description:
        'Review bounded provider keyword and ranking-page evidence with an optional matching Search Console comparison',
      inputSchema: rankedKeywordsInput,
    },
    async (input) => {
      try {
        return result(
          await (dependencies.rankedKeywordsReport ?? rankedKeywordsReport)({
            ...input,
            market: market(input),
          }),
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_ranking_pages',
    {
      description:
        "Find a domain's bounded ranking-page footprint, repeated URL patterns, and optional matching Search Console pages",
      inputSchema: rankingPagesInput,
    },
    async (input) => {
      try {
        return result(
          await (dependencies.rankingPagesReport ?? rankingPagesReport)({
            ...input,
            market: market(input),
          }),
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_serp_competitors',
    {
      description:
        'Identify repeated search competitors across an explicit bounded keyword set without guessing their business type',
      inputSchema: serpCompetitorsInput,
    },
    async (input) => {
      try {
        return result(
          await (dependencies.serpCompetitorsReport ?? serpCompetitorsReport)({
            ...input,
            market: market(input),
          }),
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_competitor_keyword_gap',
    {
      description:
        'Compare up to three explicit domains with bounded provider keywords, Search Console themes, and programmatic page patterns',
      inputSchema: competitorGapInput,
    },
    async (input) => {
      try {
        return result(
          await (
            dependencies.competitorKeywordGapReport ??
            competitorKeywordGapReport
          )({
            ...input,
            market: market(input),
          }),
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )
}
