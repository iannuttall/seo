import type { SeoErrorCode } from '../errors.js'
import type { ExternalServiceId } from './contracts.js'

export type ProviderErrorCode =
  | 'configuration'
  | 'authentication'
  | 'rate-limit'
  | 'timeout'
  | 'response-too-large'
  | 'invalid-response'
  | 'remote-error'

// The product error each provider failure reports as, so a rejected key or a
// provider outage is not counted or shown as a bug.
export const PROVIDER_ERROR_CODES: Record<ProviderErrorCode, SeoErrorCode> = {
  configuration: 'AUTH_CONFIG_REQUIRED',
  authentication: 'AUTH_CONFIG_REQUIRED',
  'rate-limit': 'RATE_LIMITED',
  timeout: 'PROVIDER_UNAVAILABLE',
  'response-too-large': 'PROVIDER_UNAVAILABLE',
  'invalid-response': 'PROVIDER_UNAVAILABLE',
  'remote-error': 'PROVIDER_UNAVAILABLE',
}

export class ProviderError extends Error {
  readonly provider: ExternalServiceId
  readonly operation: string
  readonly code: ProviderErrorCode
  readonly status: number | null
  readonly retryable: boolean

  constructor(input: {
    provider: ExternalServiceId
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
