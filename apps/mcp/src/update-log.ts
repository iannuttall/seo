import type { UpdateImpact, UpdateLogStore } from '@seo/core/commands'

// The account's kept results for past Google updates, one row per site and
// update (migrations/0023_update_results.sql). Deleted with the account.

// Most results read back for one site.
const READ_LIMIT = 50

export function updateLog(env: Env, userId: string): UpdateLogStore {
  return {
    read: async (property) =>
      (
        await env.DB.prepare(
          `SELECT result FROM update_results WHERE user_id = ? AND property = ?
           ORDER BY update_start DESC, update_id LIMIT ?`,
        )
          .bind(userId, property, READ_LIMIT)
          .all<{ result: string }>()
      ).results.map((row) => JSON.parse(row.result) as UpdateImpact),
    write: async (impact) => {
      await env.DB.prepare(
        `INSERT INTO update_results (user_id, property, update_id, update_start, result, saved_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id, property, update_id) DO UPDATE SET
           result = excluded.result, saved_at = excluded.saved_at`,
      )
        .bind(
          userId,
          impact.site,
          impact.update.id,
          impact.update.start,
          JSON.stringify(impact),
          Date.now(),
        )
        .run()
    },
  }
}
