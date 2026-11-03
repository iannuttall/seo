import type { Meter } from './audit/meter.ts'

// Metered use by account (migrations/0010_usage.sql). Each kind names its
// unit. Add a kind here, and to the migration's list, before recording it.
// The internal linking tool's kinds (src/internal-links) need no migration:
//   internal_links_free_runs    free runs started; read for the daily limit
//   internal_links_pages        pages its crawls fetched
//   included_typesafe_microusd  Jev spend on SEO Skill's own TypeSafe key

export type UsageKind =
  | 'browser_run_ms'
  | 'browser_run_pages'
  | 'url_inspections'
  | 'research_dataforseo_calls'
  | 'research_ahrefs_calls'
  | 'included_dataforseo_microusd'
  | 'internal_links_free_runs'
  | 'internal_links_pages'
  | 'included_typesafe_microusd'

// Adds amounts to the account's rows for today (UTC), all or none, in one
// D1 batch. Zero and negative amounts are skipped.
export async function addUsage(
  env: Env,
  userId: string,
  amounts: Partial<Record<UsageKind, number>>,
): Promise<void> {
  const day = new Date().toISOString().slice(0, 10)
  const statements = Object.entries(amounts)
    .filter(([, amount]) => (amount ?? 0) > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([kind, amount]) =>
      env.DB.prepare(
        `INSERT INTO usage (user_id, day, kind, amount) VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id, day, kind) DO UPDATE SET amount = amount + excluded.amount`,
      ).bind(userId, day, kind, Math.round(amount as number)),
    )
  if (statements.length) await env.DB.batch(statements)
}

// A site object's use waiting for D1 (the unmetered table, schema.ts). Call
// it in the transaction that does the work, so the two are kept together.
export function addUnmetered(
  meter: Meter,
  kind: UsageKind,
  amount: number,
): void {
  meter.run(
    `INSERT INTO unmetered (kind, amount) VALUES (?, ?)
     ON CONFLICT (kind) DO UPDATE SET amount = amount + excluded.amount`,
    kind,
    amount,
  )
}

// Sends a site object's waiting use to the account's usage in D1, then
// lowers it by what was sent, so use added meanwhile waits for the next
// flush. A D1 failure keeps it waiting and never stops the caller.
export async function flushUnmetered(
  env: Env,
  meter: Meter,
  userId: string,
): Promise<void> {
  const pending = meter.all<{ kind: UsageKind; amount: number }>(
    'SELECT kind, amount FROM unmetered WHERE amount > 0 ORDER BY kind',
  )
  if (pending.length === 0) return
  try {
    await addUsage(
      env,
      userId,
      Object.fromEntries(pending.map((row) => [row.kind, row.amount])),
    )
  } catch {
    return
  }
  meter.transaction(() => {
    for (const row of pending) {
      meter.run(
        'UPDATE unmetered SET amount = amount - ? WHERE kind = ?',
        row.amount,
        row.kind,
      )
    }
  })
}
