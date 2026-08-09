import { safePublicFetchMessage } from './public-fetch-errors.ts'
import { parseSitemapUrl, type SitemapFetcher } from './sitemap.ts'

export const SITEMAP_EXTRACTOR_LIMITS = Object.freeze({
  bodyBytes: 4_096,
  robotsBytes: 524_288,
  compressedSitemapBytes: 12_000_000,
  expandedSitemapBytes: 50_000_000,
  totalCompressedBytes: 30_000_000,
  totalExpandedBytes: 100_000_000,
  sitemaps: 50,
  subrequests: 64,
  urls: 50_000,
  urlCharacters: 12_000_000,
  hreflangValuesPerUrl: 20,
  redirects: 3,
  requestTimeoutMilliseconds: 8_000,
  totalTimeMilliseconds: 30_000,
  largeSitemapWarningUrls: 10_000,
})

export type CrawlBudget = {
  startedAt: number
  subrequests: number
  downloadedBytes: number
  expandedBytes: number
}

export class ExtractorFetchError extends Error {}
export class ExtractorLimitError extends Error {}

function checkTime(budget: CrawlBudget): void {
  if (
    Date.now() - budget.startedAt >=
    SITEMAP_EXTRACTOR_LIMITS.totalTimeMilliseconds
  ) {
    throw new ExtractorLimitError('The extraction time limit was reached.')
  }
}

export async function fetchPublicResponse(
  initialUrl: URL,
  fetcher: SitemapFetcher,
  budget: CrawlBudget,
  accept: string,
): Promise<{ response: Response; finalUrl: URL }> {
  let current = initialUrl
  for (
    let redirects = 0;
    redirects <= SITEMAP_EXTRACTOR_LIMITS.redirects;
    redirects += 1
  ) {
    checkTime(budget)
    if (budget.subrequests >= SITEMAP_EXTRACTOR_LIMITS.subrequests) {
      throw new ExtractorLimitError('The sitemap request limit was reached.')
    }
    budget.subrequests += 1

    const remainingTime = Math.max(
      1,
      SITEMAP_EXTRACTOR_LIMITS.totalTimeMilliseconds -
        (Date.now() - budget.startedAt),
    )
    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(),
      Math.min(
        SITEMAP_EXTRACTOR_LIMITS.requestTimeoutMilliseconds,
        remainingTime,
      ),
    )
    let response: Response
    try {
      response = await fetcher(current, {
        headers: {
          accept,
          'user-agent':
            'SEO-Sitemap-Extractor/1.0 (+https://seoskill.dev/tools/sitemap-extractor)',
        },
        redirect: 'manual',
        signal: controller.signal,
      })
    } catch (error) {
      if (controller.signal.aborted) {
        throw new ExtractorFetchError('The request timed out.')
      }
      throw new ExtractorFetchError(safePublicFetchMessage(error, 'sitemap'))
    } finally {
      clearTimeout(timeout)
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location) {
        throw new ExtractorFetchError('The redirect has no location.')
      }
      if (redirects === SITEMAP_EXTRACTOR_LIMITS.redirects) {
        throw new ExtractorLimitError('The URL redirected too many times.')
      }
      try {
        current = parseSitemapUrl(new URL(location, current).toString())
      } catch {
        throw new ExtractorFetchError(
          'The URL redirected to a location that cannot be fetched.',
        )
      }
      continue
    }

    if (!response.ok) {
      throw new ExtractorFetchError(
        `The server returned HTTP ${response.status}.`,
      )
    }
    return { response, finalUrl: current }
  }
  throw new ExtractorLimitError('The URL redirected too many times.')
}

function limitedByteStream(
  body: ReadableStream<Uint8Array>,
  budget: CrawlBudget,
): ReadableStream<Uint8Array> {
  const reader = body.getReader()
  let fileBytes = 0
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const chunk = await reader.read()
      if (chunk.done) {
        controller.close()
        reader.releaseLock()
        return
      }
      fileBytes += chunk.value.byteLength
      budget.downloadedBytes += chunk.value.byteLength
      if (
        fileBytes > SITEMAP_EXTRACTOR_LIMITS.compressedSitemapBytes ||
        budget.downloadedBytes > SITEMAP_EXTRACTOR_LIMITS.totalCompressedBytes
      ) {
        await reader.cancel()
        controller.error(
          new ExtractorLimitError('The sitemap download limit was reached.'),
        )
        return
      }
      controller.enqueue(chunk.value)
    },
    async cancel(reason) {
      await reader.cancel(reason)
    },
  })
}

async function sniffGzip(
  stream: ReadableStream<Uint8Array>,
): Promise<{ stream: ReadableStream<Uint8Array>; gzip: boolean }> {
  const reader = stream.getReader()
  const first = await reader.read()
  if (first.done) {
    reader.releaseLock()
    return {
      stream: new ReadableStream({ start: (controller) => controller.close() }),
      gzip: false,
    }
  }
  let firstPending = true
  const rebuilt = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (firstPending) {
        firstPending = false
        controller.enqueue(first.value)
        return
      }
      const chunk = await reader.read()
      if (chunk.done) {
        controller.close()
        reader.releaseLock()
      } else {
        controller.enqueue(chunk.value)
      }
    },
    async cancel(reason) {
      await reader.cancel(reason)
    },
  })
  return {
    stream: rebuilt,
    gzip: first.value[0] === 0x1f && first.value[1] === 0x8b,
  }
}

export async function* decodedChunks(
  body: ReadableStream<Uint8Array>,
  budget: CrawlBudget,
): AsyncGenerator<string> {
  const counted = limitedByteStream(body, budget)
  const sniffed = await sniffGzip(counted)
  const expanded = sniffed.gzip
    ? sniffed.stream.pipeThrough(new DecompressionStream('gzip'))
    : sniffed.stream
  const reader = expanded.getReader()
  const decoder = new TextDecoder()
  let fileBytes = 0
  try {
    while (true) {
      checkTime(budget)
      const chunk = await reader.read()
      if (chunk.done) break
      fileBytes += chunk.value.byteLength
      budget.expandedBytes += chunk.value.byteLength
      if (
        fileBytes > SITEMAP_EXTRACTOR_LIMITS.expandedSitemapBytes ||
        budget.expandedBytes > SITEMAP_EXTRACTOR_LIMITS.totalExpandedBytes
      ) {
        throw new ExtractorLimitError('The expanded sitemap limit was reached.')
      }
      const text = decoder.decode(chunk.value, { stream: true })
      if (text) yield text
    }
    const end = decoder.decode()
    if (end) yield end
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}
