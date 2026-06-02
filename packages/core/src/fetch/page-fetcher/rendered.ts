import type { PageFetchResult } from '../../types.js'
import { BROWSER_USER_AGENT } from '../http-client.js'
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
    return {
      url,
      finalUrl: page.url(),
      status: response?.status() ?? 200,
      headers: {},
      html,
      usedJs: true,
      diagnostics: {
        source: 'rendered',
        cache: 'bypass',
        fetched: true,
        rendered: true,
        blocked: [401, 403, 429].includes(response?.status() ?? 200),
        durationMs: Date.now() - startedAt,
        retries: 0,
        rateLimit: {
          host: new URL(url).host,
          ...rate,
        },
      },
      warnings: [],
    }
  } finally {
    await browser.close()
  }
}
