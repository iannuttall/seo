import type { publicHttpFetch } from '../../fetch/http-client.js'
import { abortController } from './crawl-control.js'
import type { CrawlReport } from './report.js'

type ExternalLinkCheck = {
  url: string
  status?: number
  error?: string
}

async function checkExternalLink(
  url: string,
  timeoutMs: number,
  fetch: typeof publicHttpFetch,
  signal?: AbortSignal,
): Promise<ExternalLinkCheck> {
  const controller = abortController({ timeoutMs, signal })

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
    })
    await response.body?.cancel().catch(() => undefined)
    return { url, status: response.status }
  } catch (error) {
    return {
      url,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    controller.cleanup()
  }
}

export async function verifyExternalLinks(input: {
  pages: CrawlReport['pages']
  timeoutMs: number
  fetch: typeof publicHttpFetch
  signal?: AbortSignal
}): Promise<void> {
  if (input.signal?.aborted) return
  const urls = [
    ...new Set(
      input.pages
        .flatMap((page) => page.sampleExternalLinks ?? [])
        .slice(0, 200),
    ),
  ]
  if (!urls.length) return

  const checks = new Map<string, ExternalLinkCheck>()
  for (let index = 0; index < urls.length; index += 8) {
    if (input.signal?.aborted) break
    const batch = urls.slice(index, index + 8)
    const results = await Promise.all(
      batch.map((url) =>
        checkExternalLink(url, input.timeoutMs, input.fetch, input.signal),
      ),
    )
    for (const result of results) checks.set(result.url, result)
  }

  for (const page of input.pages) {
    const pageChecks = (page.sampleExternalLinks ?? [])
      .map((url) => checks.get(url))
      .filter((value): value is ExternalLinkCheck => Boolean(value))
    if (pageChecks.length) page.externalLinkChecks = pageChecks
  }
}
