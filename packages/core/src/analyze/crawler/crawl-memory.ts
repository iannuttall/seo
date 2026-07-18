const MEBIBYTE = 1024 * 1024
const MIN_CRAWL_MEMORY_LIMIT = 384 * MEBIBYTE
const MAX_CRAWL_MEMORY_LIMIT = 640 * MEBIBYTE
const SYSTEM_MEMORY_FRACTION = 0.1

export function crawlMemoryLimitBytes(totalMemoryBytes: number): number {
  if (!Number.isFinite(totalMemoryBytes) || totalMemoryBytes <= 0) {
    return MAX_CRAWL_MEMORY_LIMIT
  }
  return Math.min(
    MAX_CRAWL_MEMORY_LIMIT,
    Math.max(
      MIN_CRAWL_MEMORY_LIMIT,
      Math.floor(totalMemoryBytes * SYSTEM_MEMORY_FRACTION),
    ),
  )
}

export function crawlMemoryPressure(input: {
  rssBytes: number
  totalMemoryBytes: number
}): boolean {
  return input.rssBytes >= crawlMemoryLimitBytes(input.totalMemoryBytes)
}
