export function crawlCaveats(input: {
  cancelled: boolean
  pageLimitReached: boolean
  maxPages: number
  queueSafetySkippedUrls: number
  queueSafetyInventoryCapped?: boolean
  originBackpressureSkippedUrls: number
  memoryPressureSkippedUrls: number
}): string[] {
  const caveats = input.cancelled
    ? ['Crawl cancelled before all queued URLs finished.']
    : input.pageLimitReached
      ? [`Stopped after reaching maxPages (${input.maxPages}).`]
      : []
  if (input.queueSafetySkippedUrls > 0) {
    caveats.push(
      input.queueSafetyInventoryCapped
        ? `Left at least ${input.queueSafetySkippedUrls} unique eligible same-origin URLs unqueued to keep this crawl bounded. The excluded-URL inventory reached its reporting cap. Increase --max-pages to inspect more.`
        : `Left ${input.queueSafetySkippedUrls} unique eligible same-origin URLs unqueued to keep this crawl bounded. Increase --max-pages to inspect more.`,
    )
  }
  if (input.originBackpressureSkippedUrls > 0) {
    caveats.push(
      `Stopped ${input.originBackpressureSkippedUrls} queued URL${input.originBackpressureSkippedUrls === 1 ? '' : 's'} because the origin stayed slow. This is incomplete crawl evidence, not a failed URL check.`,
    )
  }
  if (input.memoryPressureSkippedUrls > 0) {
    caveats.push(
      `Left ${input.memoryPressureSkippedUrls} eligible URL${input.memoryPressureSkippedUrls === 1 ? '' : 's'} unchecked after the local memory safety limit was reached. Start with --health or lower --max-pages.`,
    )
  }
  return caveats
}
