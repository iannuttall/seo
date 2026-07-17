export function shortestCrawlDepths(
  pages: Array<{ url: string; crawlDepth?: number }>,
  linkGraph: Record<string, string[]>,
): number[] {
  const pageIndexes = new Map(
    pages.map((page, index) => [page.url, index] as const),
  )
  const depths = pages.map((page) =>
    Number.isInteger(page.crawlDepth) && (page.crawlDepth ?? -1) >= 0
      ? (page.crawlDepth as number)
      : 0,
  )
  const buckets: string[][] = []

  for (const [index, page] of pages.entries()) {
    const depth = depths[index] ?? 0
    const bucket = buckets[depth] ?? []
    bucket.push(page.url)
    buckets[depth] = bucket
  }

  for (let depth = 0; depth < buckets.length; depth += 1) {
    for (const sourceUrl of buckets[depth] ?? []) {
      const sourceIndex = pageIndexes.get(sourceUrl)
      if (sourceIndex === undefined || depths[sourceIndex] !== depth) continue
      for (const targetUrl of linkGraph[sourceUrl] ?? []) {
        const targetIndex = pageIndexes.get(targetUrl)
        if (targetIndex === undefined) continue
        const nextDepth = depth + 1
        if (nextDepth >= (depths[targetIndex] ?? Number.POSITIVE_INFINITY)) {
          continue
        }
        depths[targetIndex] = nextDepth
        const bucket = buckets[nextDepth] ?? []
        bucket.push(targetUrl)
        buckets[nextDepth] = bucket
      }
    }
  }

  return depths
}
