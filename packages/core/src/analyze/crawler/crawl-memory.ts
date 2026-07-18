const MEBIBYTE = 1024 * 1024
const MIN_CRAWL_MEMORY_LIMIT = 384 * MEBIBYTE
const MAX_CRAWL_MEMORY_LIMIT = 640 * MEBIBYTE
const MIN_CRAWL_RSS_LIMIT = 512 * MEBIBYTE
const MAX_CRAWL_RSS_LIMIT = 896 * MEBIBYTE
const SYSTEM_MEMORY_FRACTION = 0.1
const SYSTEM_RSS_FRACTION = 0.2

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

export function crawlRssLimitBytes(totalMemoryBytes: number): number {
  if (!Number.isFinite(totalMemoryBytes) || totalMemoryBytes <= 0) {
    return MAX_CRAWL_RSS_LIMIT
  }
  return Math.min(
    MAX_CRAWL_RSS_LIMIT,
    Math.max(
      MIN_CRAWL_RSS_LIMIT,
      Math.floor(totalMemoryBytes * SYSTEM_RSS_FRACTION),
    ),
  )
}

export function crawlMemoryPressure(input: {
  memoryUsage: Pick<NodeJS.MemoryUsage, 'rss' | 'heapUsed' | 'external'>
  totalMemoryBytes: number
}): boolean {
  const liveBytes = input.memoryUsage.heapUsed + input.memoryUsage.external
  return (
    liveBytes >= crawlMemoryLimitBytes(input.totalMemoryBytes) ||
    input.memoryUsage.rss >= crawlRssLimitBytes(input.totalMemoryBytes)
  )
}
