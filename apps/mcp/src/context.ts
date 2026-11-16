import type { ContextStore, SiteContext } from '@seo/core/commands'

// The account's business context for each site, one row per property in D1
// (migrations/0019_site_context.sql). Unlike the issues list it is kept for
// every site, audited or not: the person's agent wrote it, and seo_next needs
// it to work on any site. Deleted with the account.
export function siteContext(env: Env, userId: string): ContextStore {
  return {
    read: async (property) =>
      (await env.DB.prepare(
        'SELECT text, updated_at FROM site_context WHERE user_id = ? AND property = ?',
      )
        .bind(userId, property)
        .first<SiteContext>()) ?? null,
    write: async (property, context) => {
      await env.DB.prepare(
        `INSERT INTO site_context (user_id, property, text, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id, property) DO UPDATE SET
           text = excluded.text, updated_at = excluded.updated_at`,
      )
        .bind(userId, property, context.text, context.updated_at)
        .run()
    },
  }
}
