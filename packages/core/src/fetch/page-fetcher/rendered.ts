import type { PageFetchResult } from '../../types.js'
import { BROWSER_USER_AGENT } from '../http-client.js'
import {
  rateLimitDiagnostics,
  recordHostFetch,
  retryAfterMs,
  waitForHostBackpressure,
} from './rate-controls.js'
import type { NormalizedFetchRateControls } from './types.js'

export function looksLikeSpa(html: string): boolean {
  const lower = html.toLowerCase()
  return (
    /<div[^>]+id="root"[^>]*>\s*<\/div>/.test(lower) ||
    /<div[^>]+id="__next"[^>]*>\s*<\/div>/.test(lower) ||
    /<app-root[^>]*>\s*<\/app-root>/.test(lower) ||
    /enable javascript/i.test(lower)
  )
}

export async function fetchWithPlaywright(
  url: string,
  rate: NormalizedFetchRateControls,
): Promise<PageFetchResult> {
  const startedAt = Date.now()
  const host = new URL(url).host
  const beforeFetch = await waitForHostBackpressure(host, rate)
  const playwright = await import('playwright').catch(() => undefined)
  if (!playwright?.chromium) {
    throw new Error(
      'Playwright is not installed. Run `pnpm add -w playwright` and `npx playwright install chromium`.',
    )
  }

  const browser = await playwright.chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ userAgent: BROWSER_USER_AGENT })
    const response = await page.goto(url, { waitUntil: 'networkidle' })
    const html = await page.content()
    const status = response?.status() ?? 200
    const durationMs = Date.now() - startedAt
    const backpressure = recordHostFetch({
      host,
      status,
      durationMs,
      retryAfterMs: retryAfterMs(response?.headers()['retry-after']),
      rate,
    })
    return {
      url,
      finalUrl: page.url(),
      status,
      headers: {},
      html,
      usedJs: true,
      diagnostics: {
        source: 'rendered',
        cache: 'bypass',
        fetched: true,
        rendered: true,
        blocked: [401, 403, 429].includes(status),
        durationMs,
        retries: 0,
        rateLimit: {
          ...rateLimitDiagnostics(host, rate),
        },
        backpressure:
          backpressure.status === 'ok' && beforeFetch.status !== 'ok'
            ? beforeFetch
            : backpressure,
      },
      warnings: [],
    }
  } finally {
    await browser.close()
  }
}
