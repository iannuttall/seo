import type { ResearchStore } from '@seo/core/commands'

// Where seo_research keeps results for a day on the hosted server: D1
// (migrations/0024), which every data centre reads, so a read-back costs
// nothing wherever the call lands. The key is already a hash of the
// provider key and the request.
export function researchStore(env: Pick<Env, 'DB'>): ResearchStore {
  return {
    get: async (key) => {
      const row = await env.DB.prepare(
        'SELECT value FROM research_cache WHERE key = ?1 AND expires_at > ?2',
      )
        .bind(key, Date.now())
        .first<{ value: string }>()
      return row?.value ?? null
    },
    put: async (key, value, ttlSeconds) => {
      await env.DB.prepare(
        `INSERT INTO research_cache (key, value, expires_at) VALUES (?1, ?2, ?3)
         ON CONFLICT (key) DO UPDATE SET value = ?2, expires_at = ?3`,
      )
        .bind(key, value, Date.now() + ttlSeconds * 1000)
        .run()
    },
  }
}

// The hourly cleanup.
export async function deleteExpiredResearch(env: Env, now: number) {
  await env.DB.prepare('DELETE FROM research_cache WHERE expires_at <= ?1')
    .bind(now)
    .run()
}
