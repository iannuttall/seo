import { CommandError } from './types.js'

type Row = Record<string, string | number | boolean | null>

// At most this many live provider requests at once in one call. A
// Cloudflare Worker keeps six connections open, and one more is left for
// anything else the call reads. One at a time, five live searches outlast
// an MCP client's wait.
export const LIVE_PARALLEL = 5

// fn for each item, at most limit at once, with the results in item order.
export async function inParallel<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index] as T)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  )
  return results
}

// Each keyword's rows in order. A keyword that fails is listed in missed
// and the others still count; it throws only when every keyword failed, or
// at once when the key is missing or rejected.
export async function eachKeyword(
  keywords: string[],
  missed: string[],
  rowsFor: (keyword: string) => Promise<Row[]>,
  // How many keywords are asked at once. Default one at a time.
  limit = 1,
): Promise<Row[]> {
  const found = await inParallel(keywords, limit, async (keyword) => {
    try {
      return { ok: true as const, rows: await rowsFor(keyword) }
    } catch (error) {
      if (error instanceof CommandError && error.code === 'NO_KEY') throw error
      return { ok: false as const, error }
    }
  })
  const failed = keywords.filter((_, index) => !found[index]?.ok)
  missed.push(...failed)
  if (missed.length === keywords.length) {
    throw found.find((item) => !item.ok)?.error
  }
  return found.flatMap((item) => (item.ok ? item.rows : []))
}
