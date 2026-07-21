import type { ProviderId } from './contracts.js'

export type ProviderErrorCode =
  | 'configuration'
  | 'authentication'
  | 'rate-limit'
  | 'timeout'
  | 'response-too-large'
  | 'invalid-response'
  | 'remote-error'

export class ProviderError extends Error {
  readonly provider: ProviderId
  readonly operation: string
  readonly code: ProviderErrorCode
  readonly status: number | null
  readonly retryable: boolean

  constructor(input: {
    provider: ProviderId
    operation: string
    code: ProviderErrorCode
    message: string
    status?: number
    retryable?: boolean
    cause?: unknown
  }) {
    super(input.message, { cause: input.cause })
    this.name = 'ProviderError'
    this.provider = input.provider
    this.operation = input.operation
    this.code = input.code
    this.status = input.status ?? null
    this.retryable = input.retryable ?? false
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      provider: this.provider,
      operation: this.operation,
      code: this.code,
      message: this.message,
      status: this.status,
      retryable: this.retryable,
    }
  }
}
