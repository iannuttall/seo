export function crawlCaveats(input: {
  cancelled: boolean
  pageLimitReached: boolean
  maxPages: number
  queueSafetySkippedUrls: number
}): string[] {
  const caveats = input.cancelled
    ? ['Crawl cancelled before all queued URLs finished.']
    : input.pageLimitReached
      ? [`Stopped after reaching maxPages (${input.maxPages}).`]
      : []
  if (input.queueSafetySkippedUrls > 0) {
    caveats.push(
      `Left ${input.queueSafetySkippedUrls} eligible same-origin URLs unqueued to keep this crawl bounded. Increase --max-pages to inspect more.`,
    )
  }
  return caveats
}
