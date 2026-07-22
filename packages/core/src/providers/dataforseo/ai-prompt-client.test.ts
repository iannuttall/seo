import assert from 'node:assert/strict'
import test from 'node:test'
import type { AiPromptObservationRequest } from '../contracts.js'
import { ProviderError } from '../errors.js'
import {
  aiPromptPaidRequest,
  validateAiPromptModel,
} from './ai-prompt-client.js'

const context = {
  reportId: 'ai-prompt-observations',
  reportRunId: 'run-1',
}

test('AI prompt request maps only fields supported by each surface', () => {
  const gemini = aiPromptPaidRequest(
    {
      prompt: '  Which option is best?  ',
      surface: 'gemini',
      model: 'gemini-model',
      countryCode: 'GB',
      webSearch: true,
      maxOutputTokens: 2_048,
      context,
    },
    1_000,
  )
  assert.deepEqual(gemini.request, {
    user_prompt: 'Which option is best?',
    model_name: 'gemini-model',
    max_output_tokens: 2_048,
    web_search: true,
  })

  const perplexity = aiPromptPaidRequest(
    {
      prompt: 'Which option is best?',
      surface: 'perplexity',
      model: 'sonar',
      countryCode: 'GB',
      webSearch: true,
      maxOutputTokens: 2_048,
      context,
    },
    1_000,
  )
  assert.deepEqual(perplexity.request, {
    user_prompt: 'Which option is best?',
    model_name: 'sonar',
    max_output_tokens: 2_048,
    web_search_country_iso_code: 'GB',
  })
})

test('AI prompt request rejects an impossible Perplexity web setting', () => {
  assert.throws(
    () =>
      aiPromptPaidRequest(
        {
          prompt: 'Which option is best?',
          surface: 'perplexity',
          model: 'sonar',
          countryCode: 'US',
          webSearch: false,
          maxOutputTokens: 2_048,
          context,
        },
        1_000,
      ),
    (error) =>
      error instanceof ProviderError &&
      /require web search/i.test(error.message),
  )
})

test('AI prompt model validation prevents paid invalid model requests', () => {
  const request: AiPromptObservationRequest = {
    prompt: 'Which option is best?',
    surface: 'claude',
    model: 'claude-current',
    market: { countryCode: 'US', languageCode: 'en' },
    webSearch: true,
    maxOutputTokens: 1_024,
  }
  assert.throws(
    () =>
      validateAiPromptModel({
        request,
        models: [
          {
            name: 'claude-current',
            reasoning: true,
            webSearchSupported: true,
          },
        ],
      }),
    /at least 1025 output tokens/i,
  )
  assert.throws(
    () =>
      validateAiPromptModel({
        request: { ...request, model: 'retired-model', maxOutputTokens: 2_048 },
        models: [
          {
            name: 'claude-current',
            reasoning: false,
            webSearchSupported: true,
          },
        ],
      }),
    /not in the current claude model catalog/i,
  )
})
