export type SeoErrorCode =
  | 'ACCESS_DENIED'
  | 'AUTH_CONFIG_REQUIRED'
  | 'AUTH_EXPIRED'
  | 'AUTH_REQUIRED'
  | 'INSUFFICIENT_DATA'
  | 'INTERNAL_ERROR'
  | 'INVALID_INPUT'
  | 'OPTIONAL_PROVIDER_UNAVAILABLE'
  | 'PROPERTY_NOT_FOUND'
  | 'PROVIDER_UNAVAILABLE'
  | 'RATE_LIMITED'

const errorMetadata: Record<
  SeoErrorCode,
  { exitCode: number; retryable: boolean }
> = {
  ACCESS_DENIED: { exitCode: 4, retryable: false },
  AUTH_CONFIG_REQUIRED: { exitCode: 3, retryable: false },
  AUTH_EXPIRED: { exitCode: 3, retryable: false },
  AUTH_REQUIRED: { exitCode: 3, retryable: false },
  INSUFFICIENT_DATA: { exitCode: 6, retryable: false },
  INTERNAL_ERROR: { exitCode: 1, retryable: false },
  INVALID_INPUT: { exitCode: 2, retryable: false },
  OPTIONAL_PROVIDER_UNAVAILABLE: { exitCode: 7, retryable: true },
  PROPERTY_NOT_FOUND: { exitCode: 4, retryable: false },
  PROVIDER_UNAVAILABLE: { exitCode: 7, retryable: true },
  RATE_LIMITED: { exitCode: 5, retryable: true },
}

export class SeoError extends Error {
  readonly code: SeoErrorCode
  readonly exitCode: number
  readonly retryable: boolean

  constructor(code: SeoErrorCode, message: string) {
    super(message)
    this.name = 'SeoError'
    this.code = code
    this.exitCode = errorMetadata[code].exitCode
    this.retryable = errorMetadata[code].retryable
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function toSeoError(error: unknown): SeoError {
  if (error instanceof SeoError) {
    return error
  }

  const message = errorMessage(error)
  if (/not logged in/i.test(message)) {
    return new SeoError('AUTH_REQUIRED', message)
  }
  if (/oauth client config.*missing|shared seo google app/i.test(message)) {
    return new SeoError('AUTH_CONFIG_REQUIRED', message)
  }
  if (/invalid_grant|refresh token.*no longer valid/i.test(message)) {
    return new SeoError('AUTH_EXPIRED', message)
  }
  if (error instanceof Error && error.name === 'CLIError') {
    return new SeoError('INVALID_INPUT', message)
  }

  return new SeoError('INTERNAL_ERROR', message)
}

export function isSkippableReportError(error: unknown): boolean {
  if (!(error instanceof SeoError)) {
    return false
  }
  return (
    error.code === 'INSUFFICIENT_DATA' ||
    error.code === 'OPTIONAL_PROVIDER_UNAVAILABLE'
  )
}

export function seoErrorEnvelope(error: unknown) {
  const normalized = toSeoError(error)
  return {
    ok: false as const,
    error: {
      code: normalized.code,
      message: normalized.message,
      retryable: normalized.retryable,
    },
  }
}
