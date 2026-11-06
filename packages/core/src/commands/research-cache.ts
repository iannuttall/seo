// Research results saved for a day, so reading the next page of rows, or the
// same rows in full, does not pay the provider again. The key covers the
// provider, a hash of the key used, and everything that changes the answer;
// the offset and detail do not. The hosted server keeps them in the Workers
// cache; the CLI and the local MCP pass a store on this machine.

import type { ResearchRows } from './research-providers.js'

export type ResearchStore = {
  get(key: string): Promise<string | null>
  put(key: string, value: string, ttlSeconds: number): Promise<void>
}

export const RESEARCH_TTL_SECONDS = 24 * 60 * 60

export type SavedResearch = {
  // The row limit asked of the provider.
  limit: number
  savedAt: string
  result: ResearchRows
}

type SharedCache = {
  match(request: Request): Promise<Response | undefined>
  put(request: Request, response: Response): Promise<void>
}

// The Workers cache, where there is one.
export function workersResearchStore(): ResearchStore | null {
  const cache = (globalThis as { caches?: { default?: SharedCache } }).caches
    ?.default
  if (!cache) return null
  const request = (key: string) =>
    new Request(`https://research-cache.invalid/${key}`)
  return {
    get: async (key) => (await cache.match(request(key)))?.text() ?? null,
    put: (key, value, ttl) =>
      cache.put(
        request(key),
        new Response(value, {
          headers: { 'cache-control': `max-age=${ttl}` },
        }),
      ),
  }
}

export async function researchKey(parts: unknown[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(parts))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

// A saved result that has at least the rows asked for: as many as the
// limit, or every row the provider had.
export async function readResearch(
  store: ResearchStore | null,
  key: string,
  limit: number,
): Promise<SavedResearch | null> {
  if (!store) return null
  try {
    const text = await store.get(key)
    if (!text) return null
    const saved = JSON.parse(text) as SavedResearch
    const complete = saved.result.rows.length < saved.limit
    return saved.limit >= limit || complete ? saved : null
  } catch {
    return null
  }
}

export async function saveResearch(
  store: ResearchStore | null,
  key: string,
  saved: SavedResearch,
): Promise<void> {
  if (!store) return
  await store
    .put(key, JSON.stringify(saved), RESEARCH_TTL_SECONDS)
    .catch(() => undefined)
}
