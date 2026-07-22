import { aiMentionResearchReport } from '@seo/core'
import * as z from 'zod/v4'
import { compactAgentWorkflowOutput } from '../agent-output-budget.js'
import {
  providerCountryCodeInput,
  providerIdInput,
  providerLanguageCodeInput,
  providerLocationInput,
} from '../provider-inputs.js'
import { type ToolResult, toolError, toolSuccess } from '../tool-result.js'

const targetInput = z.strictObject({
  label: z.string().trim().min(1).max(250),
  aliases: z.array(z.string().trim().min(1).max(250)).max(5).optional(),
})

export const aiMentionResearchInputSchema = z.strictObject({
  target: targetInput,
  competitors: z.array(targetInput).max(5).optional(),
  domain: z.string().trim().min(1).max(2_048).optional(),
  surface: z.enum(['google-ai-overview', 'chatgpt']),
  countryCode: providerCountryCodeInput,
  languageCode: providerLanguageCodeInput,
  location: providerLocationInput,
  provider: providerIdInput.optional(),
  includeSamples: z.boolean().default(true),
  sampleLimit: z.number().int().min(1).max(25).default(10),
  site: z.string().trim().min(1).max(2_048).optional(),
  days: z.number().int().min(1).max(548).optional(),
  refresh: z.boolean().optional(),
})

export function createAiMentionResearchHandler(
  dependencies: {
    aiMentionResearchReport?: typeof aiMentionResearchReport
  } = {},
): (input: Record<string, unknown>) => Promise<ToolResult> {
  return async (input) => {
    const {
      target,
      competitors,
      domain,
      surface,
      countryCode,
      languageCode,
      location,
      provider,
      includeSamples,
      sampleLimit,
      site,
      days,
      refresh,
    } = aiMentionResearchInputSchema.parse(input)
    try {
      const report = await (
        dependencies.aiMentionResearchReport ?? aiMentionResearchReport
      )({
        target,
        competitors,
        domain,
        market: { surface, countryCode, languageCode, location },
        provider,
        includeSamples,
        sampleLimit,
        site,
        days,
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
