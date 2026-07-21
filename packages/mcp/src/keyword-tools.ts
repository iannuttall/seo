import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  keywordMetricsReport,
  keywordOpportunitiesReport,
  keywordResearchReport,
  serpResultsReport,
} from '@seo/core'
import * as z from 'zod/v4'
import { compactAgentWorkflowOutput } from './agent-output-budget.js'
import { toolError, toolSuccess } from './tool-result.js'

const keywordInput = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine(
    (value) => value.split(/\s+/u).length <= 10,
    'Use at most 10 words per keyword.',
  )

const locationInput = z
  .strictObject({
    code: z.number().int().positive().optional(),
    name: z.string().trim().min(1).max(500).optional(),
  })
  .refine((value) => value.code !== undefined || value.name !== undefined, {
    message: 'A location needs a code or name.',
  })

const countryCodeInput = z
  .string()
  .trim()
  .regex(/^[a-z]{2}$/i)

const languageCodeInput = z
  .string()
  .trim()
  .min(2)
  .max(35)
  .regex(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i)

const keywordResearchInput = z
  .strictObject({
    seeds: z.array(keywordInput).min(1).max(5),
    sources: z
      .array(z.enum(['ideas', 'related', 'suggestions']))
      .min(1)
      .max(3)
      .default(['ideas', 'related', 'suggestions']),
    countryCode: countryCodeInput,
    languageCode: languageCodeInput,
    searchEngine: z.enum(['google', 'bing']).default('google'),
    location: locationInput.optional(),
    device: z.enum(['desktop', 'mobile']).optional(),
    limit: z.number().int().min(1).max(100).default(50),
    provider: z.enum(['dataforseo', 'semrush', 'ahrefs']).optional(),
    refresh: z.boolean().optional(),
  })
  .superRefine((input, context) => {
    const seeds = new Set(
      input.seeds.map((seed) =>
        seed.trim().replace(/\s+/gu, ' ').toLowerCase(),
      ),
    ).size
    const sources = new Set(input.sources)
    const providerRequests = [...sources].reduce(
      (total, source) => total + (source === 'ideas' ? 1 : seeds),
      0,
    )
    if (input.limit < providerRequests) {
      context.addIssue({
        code: 'custom',
        path: ['limit'],
        message: `Use a limit of at least ${providerRequests} to sample every requested source and seed.`,
      })
    }
  })

const serpResultsInput = z.strictObject({
  keyword: keywordInput,
  countryCode: countryCodeInput,
  languageCode: languageCodeInput,
  searchEngine: z.enum(['google', 'bing']).default('google'),
  location: locationInput.optional(),
  device: z.enum(['desktop', 'mobile']).default('desktop'),
  depth: z.number().int().min(1).max(100).default(10),
  provider: z.enum(['dataforseo', 'semrush', 'ahrefs']).optional(),
  refresh: z.boolean().optional(),
})

const keywordOpportunitiesInput = z
  .strictObject({
    site: z.string().trim().min(1).max(2_048),
    days: z.number().int().min(1).max(548).optional(),
    minImpressions: z.number().int().min(0).max(1_000_000_000).optional(),
    limit: z.number().int().min(1).max(25).optional(),
    keywordLimit: z.number().int().min(1).max(50).optional(),
    queriesPerPage: z.number().int().min(1).max(5).optional(),
    clusterLimit: z.number().int().min(1).max(20).optional(),
    brandTerms: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
    includeBrand: z.boolean().optional(),
    includeExternal: z.boolean().default(false),
    countryCode: countryCodeInput.optional(),
    languageCode: languageCodeInput.optional(),
    searchEngine: z.enum(['google', 'bing']).default('google'),
    location: locationInput.optional(),
    device: z.enum(['desktop', 'mobile']).optional(),
    provider: z.enum(['dataforseo', 'semrush', 'ahrefs']).optional(),
    refresh: z.boolean().optional(),
  })
  .superRefine((input, context) => {
    const hasExternalOptions = Boolean(
      input.countryCode ||
        input.languageCode ||
        input.location ||
        input.device ||
        input.provider,
    )
    if (!input.includeExternal && hasExternalOptions) {
      context.addIssue({
        code: 'custom',
        path: ['includeExternal'],
        message:
          'Set includeExternal to true before passing market or provider options.',
      })
    }
    if (input.includeExternal && (!input.countryCode || !input.languageCode)) {
      context.addIssue({
        code: 'custom',
        path: ['includeExternal'],
        message:
          'External keyword context requires countryCode and languageCode.',
      })
    }
  })

export function registerKeywordTools(
  server: McpServer,
  dependencies: {
    keywordMetricsReport?: typeof keywordMetricsReport
    keywordOpportunitiesReport?: typeof keywordOpportunitiesReport
    keywordResearchReport?: typeof keywordResearchReport
    serpResultsReport?: typeof serpResultsReport
  } = {},
): void {
  server.registerTool(
    'seo_keyword_metrics',
    {
      description:
        'Compare bounded third-party keyword demand, cost, competition, difficulty, intent, result-count, and trend evidence',
      inputSchema: {
        keywords: z.array(keywordInput).min(1).max(50),
        countryCode: countryCodeInput,
        languageCode: languageCodeInput,
        searchEngine: z.enum(['google', 'bing']).default('google'),
        location: locationInput.optional(),
        device: z.enum(['desktop', 'mobile']).optional(),
        provider: z.enum(['dataforseo', 'semrush', 'ahrefs']).optional(),
        refresh: z.boolean().optional(),
      },
    },
    async ({
      keywords,
      countryCode,
      languageCode,
      searchEngine,
      location,
      device,
      provider,
      refresh,
    }) => {
      try {
        const report = await (
          dependencies.keywordMetricsReport ?? keywordMetricsReport
        )({
          keywords,
          market: {
            countryCode,
            languageCode,
            searchEngine,
            location,
            device,
          },
          provider,
          refresh,
        })
        return toolSuccess(
          report.summary.verdict,
          compactAgentWorkflowOutput(
            report as unknown as Record<string, unknown>,
          ),
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_keyword_research',
    {
      description:
        'Discover bounded keyword ideas with typed source, market, metric, coverage, cache, and cost evidence',
      inputSchema: keywordResearchInput,
    },
    async ({
      seeds,
      sources,
      countryCode,
      languageCode,
      searchEngine,
      location,
      device,
      limit,
      provider,
      refresh,
    }) => {
      try {
        const report = await (
          dependencies.keywordResearchReport ?? keywordResearchReport
        )({
          seeds,
          sources,
          market: {
            countryCode,
            languageCode,
            searchEngine,
            location,
            device,
          },
          limit,
          provider,
          refresh,
        })
        return toolSuccess(
          report.summary.verdict,
          compactAgentWorkflowOutput(
            report as unknown as Record<string, unknown>,
          ),
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_serp_results',
    {
      description:
        'Inspect one bounded live result snapshot with exact organic ranks, domains, features, market, cache, and cost evidence',
      inputSchema: serpResultsInput,
    },
    async ({
      keyword,
      countryCode,
      languageCode,
      searchEngine,
      location,
      device,
      depth,
      provider,
      refresh,
    }) => {
      try {
        const report = await (
          dependencies.serpResultsReport ?? serpResultsReport
        )({
          keyword,
          market: {
            countryCode,
            languageCode,
            searchEngine,
            location,
            device,
          },
          depth,
          provider,
          refresh,
        })
        return toolSuccess(
          report.summary.verdict,
          compactAgentWorkflowOutput(
            report as unknown as Record<string, unknown>,
          ),
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'seo_keyword_opportunities',
    {
      description:
        'Combine bounded Search Console opportunity evidence with optional provider-neutral keyword context and programmatic SEO clusters',
      inputSchema: keywordOpportunitiesInput,
    },
    async ({
      site,
      days,
      minImpressions,
      limit,
      keywordLimit,
      queriesPerPage,
      clusterLimit,
      brandTerms,
      includeBrand,
      includeExternal,
      countryCode,
      languageCode,
      searchEngine,
      location,
      device,
      provider,
      refresh,
    }) => {
      try {
        const report = await (
          dependencies.keywordOpportunitiesReport ?? keywordOpportunitiesReport
        )({
          site,
          days,
          minImpressions,
          limit,
          keywordLimit,
          queriesPerPage,
          clusterLimit,
          brandTerms,
          includeBrand,
          includeExternal,
          ...(includeExternal && countryCode && languageCode
            ? {
                market: {
                  countryCode,
                  languageCode,
                  searchEngine,
                  location,
                  device,
                },
              }
            : {}),
          provider,
          refresh,
        })
        return toolSuccess(
          report.summary.verdict,
          compactAgentWorkflowOutput(
            report as unknown as Record<string, unknown>,
          ),
        )
      } catch (error) {
        return toolError(error)
      }
    },
  )
}
