export const TELEMETRY_ERROR_CATEGORIES = [
  'auth',
  'crawl_timeout',
  'network',
  'config',
  'data',
  'database',
  'filesystem',
  'internal',
  'unknown',
] as const

export const TELEMETRY_FAILURE_REASONS = [
  'access_denied',
  'auth_config_required',
  'auth_expired',
  'auth_required',
  'crawl_timeout',
  'database_constraint',
  'database_corrupt',
  'database_locked',
  'database_read_only',
  'database_unique_constraint',
  'filesystem_full',
  'filesystem_not_found',
  'filesystem_permission',
  'insufficient_data',
  'internal_error',
  'invalid_input',
  'network_connection',
  'network_dns',
  'network_timeout',
  'network_tls',
  'optional_provider_unavailable',
  'property_not_found',
  'provider_unavailable',
  'rate_limited',
  'unknown',
] as const

export const TELEMETRY_FAILURE_CONTEXTS = ['crawl_pages_run_id_url'] as const

export const TELEMETRY_OPERATIONS = [
  'analytics',
  'auth',
  'cache',
  'change-log',
  'client',
  'content',
  'content-groups',
  'crawl-reports',
  'diagnose',
  'export',
  'gsc-query',
  'indexnow',
  'init',
  'llms',
  'logs',
  'mcp',
  'monitoring',
  'okf',
  'perf',
  'privacy',
  'project',
  'projects',
  'providers',
  'pseo',
  'reports',
  'reset',
  'schedule',
  'server-logs',
  'setup',
  'skill',
  'sites',
  'start',
  'telemetry',
  'tests',
  'updates',
  'url-inspect',
] as const

export type TelemetryErrorCategory = (typeof TELEMETRY_ERROR_CATEGORIES)[number]
export type TelemetryFailureReason = (typeof TELEMETRY_FAILURE_REASONS)[number]
export type TelemetryFailureContext =
  (typeof TELEMETRY_FAILURE_CONTEXTS)[number]
export type TelemetryOperation = (typeof TELEMETRY_OPERATIONS)[number]

export type TelemetryFailureClassification = {
  errorCategory: TelemetryErrorCategory
  failureReason: TelemetryFailureReason
  failureContext?: TelemetryFailureContext
}

type ErrorSignal = {
  code?: string
  message?: string
  name?: string
}

const PRODUCT_FAILURES: Record<string, TelemetryFailureClassification> = {
  ACCESS_DENIED: { errorCategory: 'auth', failureReason: 'access_denied' },
  AUTH_CONFIG_REQUIRED: {
    errorCategory: 'auth',
    failureReason: 'auth_config_required',
  },
  AUTH_EXPIRED: { errorCategory: 'auth', failureReason: 'auth_expired' },
  AUTH_REQUIRED: { errorCategory: 'auth', failureReason: 'auth_required' },
  INSUFFICIENT_DATA: {
    errorCategory: 'data',
    failureReason: 'insufficient_data',
  },
  INTERNAL_ERROR: {
    errorCategory: 'internal',
    failureReason: 'internal_error',
  },
  INVALID_INPUT: { errorCategory: 'config', failureReason: 'invalid_input' },
  OPTIONAL_PROVIDER_UNAVAILABLE: {
    errorCategory: 'network',
    failureReason: 'optional_provider_unavailable',
  },
  PROPERTY_NOT_FOUND: {
    errorCategory: 'config',
    failureReason: 'property_not_found',
  },
  PROVIDER_UNAVAILABLE: {
    errorCategory: 'network',
    failureReason: 'provider_unavailable',
  },
  RATE_LIMITED: { errorCategory: 'network', failureReason: 'rate_limited' },
}

const DNS_CODES = new Set(['EAI_AGAIN', 'ENODATA', 'ENOTFOUND'])
const CONNECTION_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ECONNABORTED',
  'EPIPE',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT',
])
const TIMEOUT_CODES = new Set([
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
])

function safeProperty(value: object, key: string): unknown {
  try {
    return (value as Record<string, unknown>)[key]
  } catch {
    return undefined
  }
}

function boundedString(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const text = String(value)
  return text.length > 2_048 ? text.slice(0, 2_048) : text
}

function errorSignals(error: unknown): ErrorSignal[] {
  const queue: unknown[] = [error]
  const seen = new Set<object>()
  const signals: ErrorSignal[] = []

  while (queue.length > 0 && signals.length < 4) {
    const value = queue.shift()
    if (typeof value === 'string') {
      signals.push({ message: boundedString(value) })
      continue
    }
    if (!value || typeof value !== 'object' || seen.has(value)) continue
    seen.add(value)
    signals.push({
      code: boundedString(safeProperty(value, 'code')),
      message: boundedString(safeProperty(value, 'message')),
      name: boundedString(safeProperty(value, 'name')),
    })
    queue.push(safeProperty(value, 'cause'), safeProperty(value, 'error'))
  }

  return signals
}

function sqliteFailure(
  codes: Set<string>,
  message: string,
): TelemetryFailureClassification | undefined {
  const isUnique =
    codes.has('SQLITE_CONSTRAINT_PRIMARYKEY') ||
    codes.has('SQLITE_CONSTRAINT_UNIQUE') ||
    /unique constraint failed/i.test(message)
  if (isUnique) {
    const failureContext =
      /unique constraint failed:\s*crawl_pages\.run_id\s*,\s*crawl_pages\.url/i.test(
        message,
      )
        ? 'crawl_pages_run_id_url'
        : undefined
    return {
      errorCategory: 'database',
      failureReason: 'database_unique_constraint',
      ...(failureContext ? { failureContext } : {}),
    }
  }
  if (
    [...codes].some((code) => code.startsWith('SQLITE_CONSTRAINT')) ||
    /constraint failed/i.test(message)
  ) {
    return {
      errorCategory: 'database',
      failureReason: 'database_constraint',
    }
  }
  if (
    [...codes].some(
      (code) =>
        code.startsWith('SQLITE_BUSY') || code.startsWith('SQLITE_LOCKED'),
    ) ||
    /database is locked/i.test(message)
  ) {
    return { errorCategory: 'database', failureReason: 'database_locked' }
  }
  if (
    [...codes].some((code) => code.startsWith('SQLITE_CORRUPT')) ||
    codes.has('SQLITE_NOTADB') ||
    /database disk image is malformed|file is not a database/i.test(message)
  ) {
    return { errorCategory: 'database', failureReason: 'database_corrupt' }
  }
  if (
    [...codes].some((code) => code.startsWith('SQLITE_READONLY')) ||
    /attempt to write a readonly database/i.test(message)
  ) {
    return { errorCategory: 'database', failureReason: 'database_read_only' }
  }
  return undefined
}

function nativeFailure(
  codes: Set<string>,
): TelemetryFailureClassification | undefined {
  if (codes.has('EACCES') || codes.has('EPERM') || codes.has('EROFS')) {
    return {
      errorCategory: 'filesystem',
      failureReason: 'filesystem_permission',
    }
  }
  if (codes.has('ENOENT')) {
    return {
      errorCategory: 'filesystem',
      failureReason: 'filesystem_not_found',
    }
  }
  if (codes.has('ENOSPC') || codes.has('EDQUOT') || codes.has('SQLITE_FULL')) {
    return { errorCategory: 'filesystem', failureReason: 'filesystem_full' }
  }
  if ([...codes].some((code) => DNS_CODES.has(code))) {
    return { errorCategory: 'network', failureReason: 'network_dns' }
  }
  if ([...codes].some((code) => TIMEOUT_CODES.has(code))) {
    return { errorCategory: 'network', failureReason: 'network_timeout' }
  }
  if ([...codes].some((code) => CONNECTION_CODES.has(code))) {
    return { errorCategory: 'network', failureReason: 'network_connection' }
  }
  if (
    [...codes].some((code) =>
      /^(?:CERT_|DEPTH_ZERO_SELF_SIGNED_CERT$|ERR_SSL_|ERR_TLS_|SELF_SIGNED_CERT_IN_CHAIN$|UNABLE_TO_VERIFY_LEAF_SIGNATURE$)/.test(
        code,
      ),
    )
  ) {
    return { errorCategory: 'network', failureReason: 'network_tls' }
  }
  return undefined
}

function classify(error: unknown): TelemetryFailureClassification {
  const signals = errorSignals(error)
  const codes = new Set(
    signals
      .map((signal) => signal.code?.toUpperCase())
      .filter((code): code is string => Boolean(code)),
  )
  const message = signals
    .map((signal) => signal.message)
    .filter((value): value is string => Boolean(value))
    .join('\n')

  const database = sqliteFailure(codes, message)
  if (database) return database
  const native = nativeFailure(codes)
  if (native) return native
  if (
    signals.some(
      (signal) =>
        signal.name === 'AbortError' || signal.name === 'TimeoutError',
    )
  ) {
    return {
      errorCategory: 'crawl_timeout',
      failureReason: 'crawl_timeout',
    }
  }
  for (const code of codes) {
    const product = PRODUCT_FAILURES[code]
    if (product) return product
  }
  if (signals.some((signal) => signal.name === 'CLIError')) {
    return { errorCategory: 'config', failureReason: 'invalid_input' }
  }
  return { errorCategory: 'unknown', failureReason: 'unknown' }
}

export function classifyTelemetryFailure(
  error: unknown,
): TelemetryFailureClassification {
  try {
    return classify(error)
  } catch {
    return { errorCategory: 'unknown', failureReason: 'unknown' }
  }
}

export function isTelemetryOperation(
  value: unknown,
): value is TelemetryOperation {
  return (
    typeof value === 'string' &&
    TELEMETRY_OPERATIONS.includes(value as TelemetryOperation)
  )
}
