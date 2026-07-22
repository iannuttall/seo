import { localSearchReport } from '@seo/core'
import * as z from 'zod/v4'
import { compactAgentWorkflowOutput } from '../agent-output-budget.js'
import {
  providerCountryCodeInput,
  providerDeviceInput,
  providerIdInput,
  providerLanguageCodeInput,
  providerLocationInput,
  providerSearchEngineInput,
} from '../provider-inputs.js'
import { type ToolResult, toolError, toolSuccess } from '../tool-result.js'

export const localSearchDemandInputSchema = z
  .strictObject({
    site: z.string().trim().min(1).max(2_048),
    days: z.number().int().min(1).max(548).optional(),
    locationTerms: z
      .array(z.string().trim().min(1).max(100))
      .max(100)
      .optional(),
    minImpressions: z.number().int().min(0).max(1_000_000_000).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    maxRows: z.number().int().min(1).max(50_000).optional(),
    brandTerms: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
    includeBrand: z.boolean().optional(),
    includeSerps: z.boolean().default(false),
    countryCode: providerCountryCodeInput.optional(),
    languageCode: providerLanguageCodeInput.optional(),
    searchEngine: providerSearchEngineInput,
    location: providerLocationInput.optional(),
    device: providerDeviceInput.optional(),
    provider: providerIdInput.optional(),
    serpLimit: z.number().int().min(1).max(3).optional(),
    serpDepth: z.number().int().min(1).max(20).optional(),
    refresh: z.boolean().optional(),
  })
  .superRefine((input, context) => {
    const hasSerpOptions = Boolean(
      input.countryCode ||
        input.languageCode ||
        input.location ||
        input.device ||
        input.provider ||
        input.serpLimit ||
        input.serpDepth,
    )
    if (!input.includeSerps && hasSerpOptions) {
      context.addIssue({
        code: 'custom',
        path: ['includeSerps'],
        message:
          'Set includeSerps to true before passing market, provider, or SERP options.',
      })
    }
    if (
      input.includeSerps &&
      (!input.countryCode || !input.languageCode || !input.location)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['includeSerps'],
        message:
          'Local SERP evidence requires countryCode, languageCode, and a canonical location.',
      })
    }
  })

export function createLocalSearchDemandHandler(
  dependencies: { localSearchReport?: typeof localSearchReport } = {},
): (input: Record<string, unknown>) => Promise<ToolResult> {
  return async (input) => {
    const {
      site,
      days,
      locationTerms,
      minImpressions,
      limit,
      maxRows,
      brandTerms,
      includeBrand,
      includeSerps,
      countryCode,
      languageCode,
      searchEngine,
      location,
      device,
      provider,
      serpLimit,
      serpDepth,
      refresh,
    } = localSearchDemandInputSchema.parse(input)
    try {
      const report = await (
        dependencies.localSearchReport ?? localSearchReport
      )({
        site,
        days,
        locationTerms,
        minImpressions,
        limit,
        maxRows,
        brandTerms,
        includeBrand,
        includeSerps,
        ...(includeSerps && countryCode && languageCode && location
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
        serpLimit,
        serpDepth,
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
  }
}
