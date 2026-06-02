import type { PageFetchResult } from '../types.js'
import { fetchPlain } from './page-fetcher/plain.js'
import {
  normalizeRateControls,
  queueForHost,
} from './page-fetcher/rate-controls.js'
import { fetchWithPlaywright, looksLikeSpa } from './page-fetcher/rendered.js'
import type { FetchPageOptions } from './page-fetcher/types.js'

export type {
  FetchPageOptions,
  FetchRateControls,
} from './page-fetcher/types.js'

export async function fetchPage(
  url: string,
  opts: FetchPageOptions = {},
): Promise<PageFetchResult> {
  const rate = normalizeRateControls(opts.rate)
  const queue = queueForHost(new URL(url).host, rate)
  return (await queue.add<PageFetchResult>(async () => {
    const first = await fetchPlain(url, opts.refresh, opts.timeoutMs, rate)
    const warnings = [...first.warnings]
    const lowWordCount = first.html.split(/\s+/).length < 150
    const shouldRetryJs =
      opts.js === true ||
      (opts.js === 'auto' && (lowWordCount || looksLikeSpa(first.html)))

    if (!shouldRetryJs) {
      if (opts.js === 'auto' && (lowWordCount || looksLikeSpa(first.html))) {
        warnings.push('Page looks like SPA - re-run with --js to render.')
      }
      return { ...first, warnings }
    }

    try {
      const rendered = await fetchWithPlaywright(url, rate)
      return {
        ...rendered,
        diagnostics: {
          ...rendered.diagnostics,
          robotsTxt: first.diagnostics.robotsTxt,
        },
        warnings,
      }
    } catch (error) {
      warnings.push(
        error instanceof Error ? error.message : 'JS rendering failed.',
      )
      return { ...first, warnings }
    }
  })) as PageFetchResult
}
