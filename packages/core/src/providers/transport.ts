import { setTimeout as delay } from 'node:timers/promises'
import { type RequestInit, type Response } from 'undici'
import { z } from 'zod'
import {
  readBoundedResponseText,
  ResponseSizeLimitError,
} from '../fetch/http-client.js'
import type { ProviderId } from './contracts.js'
import { ProviderError } from './errors.js'

export type ProviderFetch = (
  url: string | URL,
  init?: RequestInit,
) => Promise<Response>

export type ProviderRequestInput = {
  provider: ProviderId
  operation: string
  url: string | URL
  init?: RequestInit
  fetch: ProviderFetch
  maxResponseBytes: number
  timeoutMs: number
  retry?: 'never' | 'safe'
  retryDelayMs?: number
}

function httpError(input: ProviderRequestInput, status: number): ProviderError {
  if (status === 401 || status === 403) {
    return new ProviderError({
      provider: input.provider,
      operation: input.operation,
      code: 'authentication',
      message: `${input.provider} rejected the configured credentials.`,
      status,
    })
  }
  if (status === 429) {
    return new ProviderError({
      provider: input.provider,
      operation: input.operation,
      code: 'rate-limit',
      message: `${input.provider} rate limited the request.`,
      status,
      retryable: true,
    })
  }
  return new ProviderError({
    provider: input.provider,
    operation: input.operation,
    code: 'remote-error',
    message: `${input.provider} returned HTTP ${status}.`,
    status,
    retryable: status >= 500,
  })
}

function requestError(
  input: ProviderRequestInput,
  error: unknown,
): ProviderError {
  if (error instanceof ProviderError) return error
  if (error instanceof ResponseSizeLimitError) {
    return new ProviderError({
      provider: input.provider,
      operation: input.operation,
      code: 'response-too-large',
      message: error.message,
      cause: error,
    })
  }
  if (
    error instanceof DOMException &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  ) {
    return new ProviderError({
      provider: input.provider,
      operation: input.operation,
      code: 'timeout',
      message: `${input.provider} did not respond within ${input.timeoutMs}ms.`,
      retryable: true,
      cause: error,
    })
  }
  return new ProviderError({
    provider: input.provider,
    operation: input.operation,
    code: 'remote-error',
    message: `${input.provider} request failed before a valid response arrived.`,
    retryable: true,
    cause: error,
  })
}

async function requestOnce(input: ProviderRequestInput): Promise<string> {
  try {
    const response = await input.fetch(input.url, {
      ...input.init,
      signal: input.init?.signal ?? AbortSignal.timeout(input.timeoutMs),
    })
    const text = await readBoundedResponseText(
      response,
      input.maxResponseBytes,
      `${input.provider} response`,
    )
    if (!response.ok) throw httpError(input, response.status)
    return text
  } catch (error) {
    throw requestError(input, error)
  }
}

export async function providerRequestText(
  input: ProviderRequestInput,
): Promise<string> {
  const attempts = input.retry === 'safe' ? 2 : 1
  let lastError: ProviderError | undefined
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await requestOnce(input)
    } catch (error) {
      lastError = requestError(input, error)
      if (!lastError.retryable || attempt === attempts) throw lastError
      await delay(input.retryDelayMs ?? 250)
    }
  }
  throw lastError
}

export async function providerRequestJson<T>(
  input: ProviderRequestInput & { schema: z.ZodType<T> },
): Promise<T> {
  const text = await providerRequestText(input)
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error) {
    throw new ProviderError({
      provider: input.provider,
      operation: input.operation,
      code: 'invalid-response',
      message: `${input.provider} returned malformed JSON.`,
      cause: error,
    })
  }

  const parsed = input.schema.safeParse(value)
  if (!parsed.success) {
    throw new ProviderError({
      provider: input.provider,
      operation: input.operation,
      code: 'invalid-response',
      message: `${input.provider} returned data that does not match the expected response schema.`,
      cause: parsed.error,
    })
  }
  return parsed.data
}
