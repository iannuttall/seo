import { aiPromptObservationsReport } from '@seo/core'
import * as z from 'zod/v4'
import { compactAgentWorkflowOutput } from '../agent-output-budget.js'
import {
  providerCountryCodeInput,
  providerIdInput,
  providerLanguageCodeInput,
} from '../provider-inputs.js'
import { type ToolResult, toolError, toolSuccess } from '../tool-result.js'

const promptInput = z.strictObject({
  id: z.string().trim().min(1).max(100).optional(),
  group: z.string().trim().min(1).max(100).optional(),
  prompt: z.string().trim().min(1).max(500),
})

const modelInput = z.strictObject({
  surface: z.enum(['chatgpt', 'claude', 'gemini', 'perplexity']),
  model: z.string().trim().min(1).max(200),
})

const targetInput = z.strictObject({
  label: z.string().trim().min(1).max(250),
  aliases: z.array(z.string().trim().min(1).max(250)).max(5).optional(),
  domains: z.array(z.string().trim().min(1).max(2_048)).max(5).optional(),
})

export const aiPromptObservationsInputSchema = z.strictObject({
  prompts: z.array(promptInput).min(1).max(5),
  models: z.array(modelInput).min(1).max(4),
  target: targetInput,
  competitors: z.array(targetInput).max(5).optional(),
  countryCode: providerCountryCodeInput,
  languageCode: providerLanguageCodeInput,
  provider: providerIdInput.optional(),
  webSearch: z.boolean().default(true),
  maxOutputTokens: z.number().int().min(1).max(4_096).default(2_048),
  site: z.string().trim().min(1).max(2_048).optional(),
  days: z.number().int().min(1).max(548).optional(),
  refresh: z.boolean().optional(),
})

export function createAiPromptObservationsHandler(
  dependencies: {
    aiPromptObservationsReport?: typeof aiPromptObservationsReport
  } = {},
): (input: Record<string, unknown>) => Promise<ToolResult> {
  return async (input) => {
    const {
      prompts,
      models,
      target,
      competitors,
      countryCode,
      languageCode,
      provider,
      webSearch,
      maxOutputTokens,
      site,
      days,
      refresh,
    } = aiPromptObservationsInputSchema.parse(input)
    try {
      const report = await (
        dependencies.aiPromptObservationsReport ?? aiPromptObservationsReport
      )({
        prompts,
        models,
        target,
        competitors,
        market: { countryCode, languageCode },
        provider,
        webSearch,
        maxOutputTokens,
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
