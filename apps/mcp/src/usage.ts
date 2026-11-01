// Metered use by account (migrations/0010_usage.sql). Each kind names its
// unit. Add a kind here, and to the migration's list, before recording it.

export type UsageKind = 'browser_run_ms' | 'browser_run_pages'

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
