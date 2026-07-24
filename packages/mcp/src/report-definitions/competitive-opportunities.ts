import { competitiveOpportunitiesReport } from '@seo/core'
import * as z from 'zod/v4'
import { compactAgentWorkflowOutput } from '../agent-output-budget.js'
import {
  providerCountryCodeInput,
  providerDeviceInput,
  providerIdInput,
  providerKeywordInput,
  providerLanguageCodeInput,
} from '../provider-inputs.js'
import { type ToolResult, toolError, toolSuccess } from '../tool-result.js'

const discoverySourceInput = z.enum(['ideas', 'related', 'suggestions'])

export const competitiveOpportunitiesInputSchema = z
  .strictObject({
    target: z.string().trim().min(3).max(253),
    seeds: z.array(providerKeywordInput).min(1).max(5),
    countryCode: providerCountryCodeInput,
    languageCode: providerLanguageCodeInput,
    searchEngine: z.literal('google').default('google'),
    device: providerDeviceInput.default('desktop'),
    keywordProvider: providerIdInput.optional(),
    discoverySources: z
      .array(discoverySourceInput)
      .min(1)
      .max(3)
      .default(['ideas', 'related', 'suggestions']),
    discoveryLimit: z.number().int().min(1).max(100).default(30),
    keywordLimit: z.number().int().min(1).max(10).default(5),
    serpProvider: providerIdInput.optional(),
    serpDepth: z.number().int().min(1).max(20).default(10),
    competitorLimit: z.number().int().min(1).max(10).default(5),
    competitionEvidence: z
      .enum(['serp', 'domain-rating', 'link-summary'])
      .default('domain-rating'),
    linkProvider: z.enum(['ahrefs', 'dataforseo']).optional(),
    projectId: z.string().trim().min(1).max(80).optional(),
    refresh: z.boolean().optional(),
  })
  .superRefine((input, context) => {
    const seedCount = new Set(
      input.seeds.map((seed) =>
        seed.trim().replace(/\s+/gu, ' ').toLowerCase(),
      ),
    ).size
    const sourceCount = new Set(input.discoverySources).size
    const minimumDiscoveryRows = seedCount * sourceCount
    if (input.discoveryLimit < minimumDiscoveryRows) {
      context.addIssue({
        code: 'custom',
        path: ['discoveryLimit'],
        message: `Use a discoveryLimit of at least ${minimumDiscoveryRows} to sample every requested source and seed.`,
      })
    }
    if (
      input.linkProvider !== undefined &&
      input.competitionEvidence !== 'link-summary'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['linkProvider'],
        message:
          'Set competitionEvidence to link-summary before choosing a link provider.',
      })
    }
  })

export function createCompetitiveOpportunitiesHandler(
  dependencies: {
    competitiveOpportunitiesReport?: typeof competitiveOpportunitiesReport
  } = {},
): (input: Record<string, unknown>) => Promise<ToolResult> {
  return async (input) => {
    const parsed = competitiveOpportunitiesInputSchema.parse(input)
    try {
      const report = await (
        dependencies.competitiveOpportunitiesReport ??
        competitiveOpportunitiesReport
      )({
        target: parsed.target,
        seeds: parsed.seeds,
        market: {
          countryCode: parsed.countryCode,
          languageCode: parsed.languageCode,
          searchEngine: parsed.searchEngine,
          device: parsed.device,
        },
        keywordProvider: parsed.keywordProvider,
        discoverySources: parsed.discoverySources,
        discoveryLimit: parsed.discoveryLimit,
        keywordLimit: parsed.keywordLimit,
        serpProvider: parsed.serpProvider,
        serpDepth: parsed.serpDepth,
        competitorLimit: parsed.competitorLimit,
        competitionEvidence: parsed.competitionEvidence,
        linkProvider: parsed.linkProvider,
        projectId: parsed.projectId,
        refresh: parsed.refresh,
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
  }
}
