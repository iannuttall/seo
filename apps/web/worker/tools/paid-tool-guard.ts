import {
  decidePaidToolQuota,
  decideToolIdentityQuota,
  isPaidToolId,
  isPaidToolIdentityHash,
  isPublicWorkerToolId,
  MAX_PROVIDER_DAILY_LIMIT,
  PAID_TOOL_DAILY_LIMIT,
  PAID_TOOL_PROVIDERS,
  type PaidToolId,
  type PaidToolProvider,
  type PaidToolQuotaDecision,
  type PublicWorkerToolId,
  paidToolQuotaCleanupAt,
  validateProviderDailyLimit,
} from './paid-tool-guard-core.ts'

export type PaidToolReservationInput = {
  day: string
  identityHash: string
  tool: PaidToolId
  providerDailyLimit: number
}

export type PaidToolReservation = PaidToolQuotaDecision & {
  day: string
  provider: PaidToolProvider
  resetAt: number
}

export type ToolIdentityReservationInput = {
  kind: 'identity'
  day: string
  identityHash: string
  tool: PublicWorkerToolId
}

export type ToolIdentityReservation = ReturnType<
  typeof decideToolIdentityQuota
> & {
  day: string
  tool: PublicWorkerToolId
  resetAt: number
}

type IdentityUsageRow = {
  calls: number
}

type ProviderUsageRow = {
  calls: number
  dailyLimit: number
}

type StoredDayRow = {
  value: string
}

export const PAID_TOOL_GUARD_MAX_SQL_STATEMENTS_PER_RESERVATION = 7
export const PUBLIC_TOOL_GUARD_MAX_SQL_STATEMENTS_PER_RESERVATION = 4

function integer(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : 0
}

function reservationInput(value: unknown): {
  day: string
  identityHash: string
  tool: PaidToolId
  provider: PaidToolProvider
  providerDailyLimit: number
} {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid quota reservation.')
  }
  const input = value as Record<string, unknown>
  if (!isPaidToolIdentityHash(input.identityHash)) {
    throw new Error('Invalid quota identity.')
  }
  if (!isPaidToolId(input.tool)) throw new Error('Invalid paid tool.')
  if (typeof input.day !== 'string') throw new Error('Invalid UTC day.')
  if (typeof input.providerDailyLimit !== 'number') {
    throw new Error('Invalid provider daily limit.')
  }

  const cleanupAt = paidToolQuotaCleanupAt(input.day)
  if (!Number.isSafeInteger(cleanupAt)) throw new Error('Invalid UTC day.')

  return {
    day: input.day,
    identityHash: input.identityHash,
    tool: input.tool,
    provider: PAID_TOOL_PROVIDERS[input.tool],
    providerDailyLimit: validateProviderDailyLimit(input.providerDailyLimit),
  }
}

function identityReservationInput(
  value: unknown,
): ToolIdentityReservationInput {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid quota reservation.')
  }
  const input = value as Record<string, unknown>
  if (input.kind !== 'identity') throw new Error('Invalid reservation kind.')
  if (!isPaidToolIdentityHash(input.identityHash)) {
    throw new Error('Invalid quota identity.')
  }
  if (!isPublicWorkerToolId(input.tool)) {
    throw new Error('Invalid public tool.')
  }
  if (typeof input.day !== 'string') throw new Error('Invalid UTC day.')
  const cleanupAt = paidToolQuotaCleanupAt(input.day)
  if (!Number.isSafeInteger(cleanupAt)) throw new Error('Invalid UTC day.')
  return {
    kind: 'identity',
    day: input.day,
    identityHash: input.identityHash,
    tool: input.tool,
  }
}

async function readBoundedRequestText(request: Request): Promise<string> {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > 1_024) {
    throw new Error('Invalid reservation.')
  }
  if (!request.body) throw new Error('Invalid reservation.')
  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ''
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > 1_024) {
        await reader.cancel()
        throw new Error('Invalid reservation.')
      }
      text += decoder.decode(chunk.value, { stream: true })
    }
  } finally {
    reader.releaseLock()
  }
  return text + decoder.decode()
}

export class PaidToolGuard {
  private readonly ctx: DurableObjectState

  constructor(ctx: DurableObjectState, _env: Cloudflare.Env) {
    this.ctx = ctx
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS _sql_schema_migrations (
          id INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS guard_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        ) WITHOUT ROWID;

        CREATE TABLE IF NOT EXISTS identity_tool_usage (
          identity_hash TEXT NOT NULL CHECK (length(identity_hash) = 64),
          tool TEXT NOT NULL CHECK (
            tool IN (
              'spam-score',
              'domain-rating',
              'website-traffic',
              'llms-txt',
              'sitemap',
              'sitemap-extractor',
              'sitemap-validator',
              'robots-txt',
              'favicon-checker'
            )
          ),
          calls INTEGER NOT NULL CHECK (
            calls >= 0 AND calls <= ${PAID_TOOL_DAILY_LIMIT}
          ),
          PRIMARY KEY (identity_hash, tool)
        ) WITHOUT ROWID;

        CREATE TABLE IF NOT EXISTS provider_usage (
          provider TEXT PRIMARY KEY CHECK (
            provider IN ('ahrefs', 'dataforseo-spam', 'dataforseo-traffic')
          ),
          calls INTEGER NOT NULL CHECK (
            calls >= 0 AND calls <= ${MAX_PROVIDER_DAILY_LIMIT}
          ),
          daily_limit INTEGER NOT NULL CHECK (
            daily_limit >= 1 AND daily_limit <= ${MAX_PROVIDER_DAILY_LIMIT}
          )
        ) WITHOUT ROWID;

        INSERT OR IGNORE INTO _sql_schema_migrations (id) VALUES (1);
      `)
    })
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 })
    }

    try {
      const body = JSON.parse(await readBoundedRequestText(request)) as unknown
      const reservation =
        body &&
        typeof body === 'object' &&
        (body as Record<string, unknown>).kind === 'identity'
          ? await this.reserveIdentity(body)
          : await this.reserve(body)
      return Response.json(reservation, {
        headers: { 'cache-control': 'no-store' },
      })
    } catch {
      return Response.json(
        { error: 'Reservation failed' },
        { status: 400, headers: { 'cache-control': 'no-store' } },
      )
    }
  }

  private async reserveIdentity(
    input: unknown,
  ): Promise<ToolIdentityReservation> {
    const parsed = identityReservationInput(input)
    const cleanupAt = paidToolQuotaCleanupAt(parsed.day)
    const resetAt = cleanupAt - 86_400_000
    const alarm = await this.ctx.storage.getAlarm()
    if (alarm === null || alarm > cleanupAt) {
      await this.ctx.storage.setAlarm(cleanupAt)
    }

    const decision = this.ctx.storage.transactionSync(() => {
      let sqlStatements = 0
      const execute = <T extends Record<string, SqlStorageValue>>(
        query: string,
        ...bindings: SqlStorageValue[]
      ) => {
        sqlStatements += 1
        if (
          sqlStatements > PUBLIC_TOOL_GUARD_MAX_SQL_STATEMENTS_PER_RESERVATION
        ) {
          throw new Error('Public tool guard SQL operation limit exceeded.')
        }
        return this.ctx.storage.sql.exec<T>(query, ...bindings)
      }

      const storedDay = execute<StoredDayRow>(
        "SELECT value FROM guard_meta WHERE key = 'quota_day' LIMIT 1",
      ).toArray()[0]?.value
      if (storedDay && storedDay !== parsed.day) {
        throw new Error('Quota object day mismatch.')
      }
      if (!storedDay) {
        execute(
          "INSERT INTO guard_meta (key, value) VALUES ('quota_day', ?)",
          parsed.day,
        )
      }

      const identityUsed = integer(
        execute<IdentityUsageRow>(
          `SELECT calls
             FROM identity_tool_usage
             WHERE identity_hash = ? AND tool = ?
             LIMIT 1`,
          parsed.identityHash,
          parsed.tool,
        ).toArray()[0]?.calls,
      )
      const result = decideToolIdentityQuota(identityUsed)
      if (!result.allowed) return result

      execute(
        `INSERT INTO identity_tool_usage (identity_hash, tool, calls)
         VALUES (?, ?, 1)
         ON CONFLICT (identity_hash, tool)
         DO UPDATE SET calls = calls + 1`,
        parsed.identityHash,
        parsed.tool,
      )
      return result
    })

    return {
      ...decision,
      day: parsed.day,
      tool: parsed.tool,
      resetAt,
    }
  }

  private async reserve(input: unknown): Promise<PaidToolReservation> {
    const parsed = reservationInput(input)
    const cleanupAt = paidToolQuotaCleanupAt(parsed.day)
    const resetAt = cleanupAt - 86_400_000
    const alarm = await this.ctx.storage.getAlarm()
    if (alarm === null || alarm > cleanupAt) {
      await this.ctx.storage.setAlarm(cleanupAt)
    }

    const decision = this.ctx.storage.transactionSync(() => {
      let sqlStatements = 0
      const execute = <T extends Record<string, SqlStorageValue>>(
        query: string,
        ...bindings: SqlStorageValue[]
      ) => {
        sqlStatements += 1
        if (
          sqlStatements > PAID_TOOL_GUARD_MAX_SQL_STATEMENTS_PER_RESERVATION
        ) {
          throw new Error('Paid tool guard SQL operation limit exceeded.')
        }
        return this.ctx.storage.sql.exec<T>(query, ...bindings)
      }

      const storedDay = execute<StoredDayRow>(
        "SELECT value FROM guard_meta WHERE key = 'quota_day' LIMIT 1",
      ).toArray()[0]?.value
      if (storedDay && storedDay !== parsed.day) {
        throw new Error('Quota object day mismatch.')
      }
      if (!storedDay) {
        execute(
          "INSERT INTO guard_meta (key, value) VALUES ('quota_day', ?)",
          parsed.day,
        )
      }

      const identityUsed = integer(
        execute<IdentityUsageRow>(
          `SELECT calls
           FROM identity_tool_usage
           WHERE identity_hash = ? AND tool = ?
           LIMIT 1`,
          parsed.identityHash,
          parsed.tool,
        ).toArray()[0]?.calls,
      )
      const providerRow = execute<ProviderUsageRow>(
        `SELECT calls, daily_limit AS dailyLimit
         FROM provider_usage
         WHERE provider = ?
         LIMIT 1`,
        parsed.provider,
      ).toArray()[0]
      const providerUsed = integer(providerRow?.calls)
      const providerDailyLimit = Math.min(
        providerRow?.dailyLimit ?? parsed.providerDailyLimit,
        parsed.providerDailyLimit,
      )

      if (
        providerRow &&
        providerDailyLimit !== integer(providerRow.dailyLimit)
      ) {
        execute(
          `UPDATE provider_usage
           SET daily_limit = ?
           WHERE provider = ?`,
          providerDailyLimit,
          parsed.provider,
        )
      }

      const result = decidePaidToolQuota({
        identityUsed,
        providerUsed,
        providerDailyLimit,
      })
      if (!result.allowed) return result

      execute(
        `INSERT INTO identity_tool_usage (identity_hash, tool, calls)
         VALUES (?, ?, 1)
         ON CONFLICT (identity_hash, tool)
         DO UPDATE SET calls = calls + 1`,
        parsed.identityHash,
        parsed.tool,
      )
      execute(
        `INSERT INTO provider_usage (provider, calls, daily_limit)
         VALUES (?, 1, ?)
         ON CONFLICT (provider)
         DO UPDATE SET
           calls = calls + 1,
           daily_limit = min(daily_limit, excluded.daily_limit)`,
        parsed.provider,
        providerDailyLimit,
      )
      return result
    })

    return {
      ...decision,
      day: parsed.day,
      provider: parsed.provider,
      resetAt,
    }
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll()
  }
}
