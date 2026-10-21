import { readJson } from './http/read-json.js'

// A decision model reads some state and typed questions and returns a
// probability for each allowed answer. It never writes text. Code owns the
// workflow and the rules; the model only picks among the options it is given.
//
// The request and answer shapes follow the System One API, so another
// provider that speaks it (TypeSafe's Jev first) plugs in as one adapter with
// no change to the questions or the rules that read the answers.
// Pure fetch and `readJson`, so it runs in Node and in Workers.

export type DecisionQuestion =
  | {
      type: 'noul'
      instructions: unknown
      criteria?: { true?: unknown; false?: unknown }
    }
  | { type: 'choice'; instructions: unknown; criteria: Record<string, unknown> }

export type DecisionAnswer =
  | { type: 'noul'; noul: number }
  | {
      type: 'choice'
      choice: string
      confidence: number
      probabilities: Record<string, number>
    }

export interface DecisionRequest {
  state: unknown
  questions: Record<string, DecisionQuestion>
}

export interface DecisionResponse {
  model: string
  answers: Record<string, DecisionAnswer>
  inputTokens: number
}

export interface DecisionModel {
  // Who serves it and what the person is billed, for the result.
  provider: string
  name: string
  pricePerMillionInputTokens: number
  // One attempt. Retries and concurrency belong to the runner.
  ask(request: DecisionRequest, signal?: AbortSignal): Promise<DecisionResponse>
}

export type DecisionErrorKind =
  | 'auth'
  | 'rate-limit'
  | 'invalid'
  | 'unavailable'

export class DecisionModelError extends Error {
  constructor(
    readonly kind: DecisionErrorKind,
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message)
    this.name = 'DecisionModelError'
  }

  get retryable(): boolean {
    return this.kind === 'rate-limit' || this.kind === 'unavailable'
  }
}

const TYPESAFE_URL = 'https://api.typesafe.ai/v1/systemone'
// Jev bills input tokens only: $0.042 per million (docs.typesafe.ai/models).
const JEV_PRICE_PER_MILLION = 0.042
const REQUEST_TIMEOUT_MS = 60_000
const MAX_RESPONSE_BYTES = 1024 * 1024

function retryAfter(response: Response): number | undefined {
  const value = Number(response.headers.get('retry-after'))
  return Number.isFinite(value) && value > 0
    ? Math.min(value, 30) * 1000
    : undefined
}

// TypeSafe's Jev through its HTTP API.
export function typesafeDecisionModel(input: {
  apiKey: string
  model?: string
  fetch?: typeof fetch
}): DecisionModel {
  const call = input.fetch ?? fetch
  const model = input.model ?? 'jev-latest'
  return {
    provider: 'typesafe',
    name: model,
    pricePerMillionInputTokens: JEV_PRICE_PER_MILLION,
    async ask(request, signal) {
      const controller = new AbortController()
      const abort = () => controller.abort()
      const timer = setTimeout(abort, REQUEST_TIMEOUT_MS)
      signal?.addEventListener('abort', abort, { once: true })
      let response: Response
      try {
        response = await call(TYPESAFE_URL, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${input.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ model, ...request }),
          signal: controller.signal,
        })
      } catch (error) {
        throw new DecisionModelError(
          'unavailable',
          `TypeSafe could not be reached: ${error instanceof Error ? error.message : String(error)}`,
        )
      } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
      }
      if (response.status === 401 || response.status === 403) {
        await response.body?.cancel()
        throw new DecisionModelError(
          'auth',
          'TypeSafe rejected the API key. Replace it at https://seoskill.dev/account#keys or in TYPESAFE_API_KEY.',
        )
      }
      if (response.status === 429 || response.status === 529) {
        await response.body?.cancel()
        throw new DecisionModelError(
          'rate-limit',
          `TypeSafe returned HTTP ${response.status}.`,
          retryAfter(response),
        )
      }
      if (response.status >= 500) {
        await response.body?.cancel()
        throw new DecisionModelError(
          'unavailable',
          `TypeSafe returned HTTP ${response.status}.`,
        )
      }
      if (!response.ok) {
        await response.body?.cancel()
        throw new DecisionModelError(
          'invalid',
          `TypeSafe did not accept the request (HTTP ${response.status}).`,
        )
      }
      const body = await readJson<{
        model?: string
        answers?: Record<string, DecisionAnswer>
        usage?: { input_tokens?: number }
      }>(response, 'TypeSafe', { maxBytes: MAX_RESPONSE_BYTES })
      return {
        model: body.model ?? model,
        answers: body.answers ?? {},
        inputTokens: body.usage?.input_tokens ?? 0,
      }
    },
  }
}

export interface DecisionUsage {
  provider: string
  model: string
  requests: number
  failedRequests: number
  inputTokens: number
  costUsd: number
}

const MAX_CONCURRENCY = 32
const MIN_CONCURRENCY = 2
const MAX_ATTEMPTS = 5

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Sends requests to a model with up to 32 in flight. A rate limit halves how
// many run at once; steady successes raise it again. Retries rate limits and
// outages with backoff. A rejected key stops every later request. Keeps the
// count of requests, tokens and cost for the result.
export class DecisionRunner {
  private limit = MAX_CONCURRENCY
  private active = 0
  private streak = 0
  private readonly waiting: Array<() => void> = []
  private served = ''
  private requests = 0
  private failed = 0
  private tokens = 0
  // Set when the key is rejected: no later request can succeed.
  authError: DecisionModelError | null = null

  constructor(readonly model: DecisionModel) {}

  usage(): DecisionUsage {
    return {
      provider: this.model.provider,
      model: this.served || this.model.name,
      requests: this.requests,
      failedRequests: this.failed,
      inputTokens: this.tokens,
      costUsd:
        Math.round(
          ((this.tokens * this.model.pricePerMillionInputTokens) / 1_000_000) *
            10_000,
        ) / 10_000,
    }
  }

  private async slot(): Promise<void> {
    while (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.waiting.push(resolve))
    }
    this.active += 1
  }

  private release(): void {
    this.active -= 1
    this.waiting.shift()?.()
  }

  // The answers, or null when the request failed after its retries.
  async ask(request: DecisionRequest): Promise<DecisionResponse | null> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      if (this.authError) break
      let delay = 0
      await this.slot()
      try {
        const response = await this.model.ask(request)
        this.requests += 1
        this.tokens += response.inputTokens
        this.served = response.model
        this.streak += 1
        if (this.streak >= 50 && this.limit < MAX_CONCURRENCY) {
          this.limit += 1
          this.streak = 0
          this.waiting.shift()?.()
        }
        return response
      } catch (error) {
        const failure =
          error instanceof DecisionModelError
            ? error
            : new DecisionModelError('unavailable', String(error))
        if (failure.kind === 'auth') {
          this.authError = failure
          break
        }
        if (!failure.retryable || attempt === MAX_ATTEMPTS) break
        if (failure.kind === 'rate-limit') {
          this.limit = Math.max(MIN_CONCURRENCY, Math.floor(this.limit / 2))
          this.streak = 0
        }
        delay =
          failure.retryAfterMs ??
          2 ** attempt * 250 + Math.floor(Math.random() * 250)
      } finally {
        this.release()
      }
      // The slot is free while this request waits to retry.
      await sleep(delay)
    }
    this.failed += 1
    return null
  }
}
