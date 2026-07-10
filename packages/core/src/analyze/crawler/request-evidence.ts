import type {
  CrawlPageSnapshot,
  CrawlRequestObservation,
} from '../monitoring/types.js'

export function observationFromPage(
  requestedUrl: string,
  page: CrawlPageSnapshot,
): CrawlRequestObservation {
  const observation = {
    requestedUrl,
    outcome: 'response' as const,
    finalUrl: page.finalUrl,
    status: page.status,
    contentType: page.contentType,
    durationMs: page.responseTimeMs,
    redirectChain: page.fetchDiagnostics?.redirectChain,
  }
  if (page.extractionStatus === 'failed') {
    return {
      ...observation,
      extraction: 'failed',
      extractionError:
        page.extractionError ??
        'Content extraction failed without a recorded error.',
    }
  }
  return {
    ...observation,
    extraction: page.extractionStatus ?? 'complete',
  }
}
