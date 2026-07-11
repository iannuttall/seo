import PQueue from 'p-queue'
import { type Browser, chromium, type Page } from 'playwright-core'
import type { PageFetchDiagnostics, PageFetchResult } from '../../types.js'
import { BROWSER_USER_AGENT } from '../http-client.js'
import {
  type BrowserExecutable,
  browserUnavailableMessage,
  resolveBrowserExecutable,
} from './browser-path.js'
import {
  rateLimitDiagnostics,
  recordHostFetch,
  retryAfterMs,
  waitForHostBackpressure,
} from './rate-controls.js'
import type { NormalizedFetchRateControls, PageRenderer } from './types.js'

const DEFAULT_RENDER_TIMEOUT_MS = 20_000
const NETWORK_IDLE_TIMEOUT_MS = 3_000
const MAX_RENDER_CONTEXTS = 4
const MAX_RENDER_DIAGNOSTICS = 20

type RenderingDiagnostics = NonNullable<PageFetchDiagnostics['rendering']>

type LaunchedBrowser = {
  browser: Browser
  executable: BrowserExecutable
}

export class JavaScriptRenderingError extends Error {
  constructor(
    message: string,
    readonly kind: 'browser-unavailable' | 'navigation-failed',
  ) {
    super(message)
    this.name = 'JavaScriptRenderingError'
  }
}

function safeDiagnosticUrl(value: string): string {
  try {
    const url = new URL(value)
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return value.slice(0, 300)
  }
}

function safeDiagnosticText(value: string): string {
  return value
    .replace(/https?:\/\/[^\s"')]+/gi, (url) => safeDiagnosticUrl(url))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500)
}

function pushDiagnostic(values: string[], value: string): void {
  if (values.length >= MAX_RENDER_DIAGNOSTICS) return
  const safeValue = safeDiagnosticText(value)
  if (safeValue && !values.includes(safeValue)) values.push(safeValue)
}

function securityObservation(
  message: string,
):
  | NonNullable<RenderingDiagnostics['securityObservations']>[number]
  | undefined {
  const safeMessage = safeDiagnosticText(message)
  if (/content security policy|\bcsp\b/i.test(safeMessage)) {
    return { kind: 'content-security-policy', message: safeMessage }
  }
  if (/\bcors\b|cross-origin/i.test(safeMessage)) {
    return { kind: 'cors', message: safeMessage }
  }
  if (/mixed content/i.test(safeMessage)) {
    return { kind: 'mixed-content', message: safeMessage }
  }
  return undefined
}

function createPageDiagnostics(
  page: Page,
): Pick<
  RenderingDiagnostics,
  'consoleErrors' | 'pageErrors' | 'failedRequests' | 'securityObservations'
> {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  const failedRequests: NonNullable<RenderingDiagnostics['failedRequests']> = []
  const securityObservations: NonNullable<
    RenderingDiagnostics['securityObservations']
  > = []

  const addSecurityObservation = (message: string): void => {
    if (securityObservations.length >= MAX_RENDER_DIAGNOSTICS) return
    const observation = securityObservation(message)
    if (
      observation &&
      !securityObservations.some(
        (existing) =>
          existing.kind === observation.kind &&
          existing.message === observation.message,
      )
    ) {
      securityObservations.push(observation)
    }
  }

  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    pushDiagnostic(consoleErrors, text)
    addSecurityObservation(text)
  })
  page.on('pageerror', (error) => {
    pushDiagnostic(pageErrors, error.message)
    addSecurityObservation(error.message)
  })
  page.on('requestfailed', (request) => {
    if (failedRequests.length >= MAX_RENDER_DIAGNOSTICS) return
    const failure = request.failure()?.errorText ?? 'Request failed.'
    const item = {
      url: safeDiagnosticUrl(request.url()),
      resourceType: request.resourceType(),
      error: safeDiagnosticText(failure),
    }
    if (
      !failedRequests.some(
        (existing) =>
          existing.url === item.url &&
          existing.resourceType === item.resourceType &&
          existing.error === item.error,
      )
    ) {
      failedRequests.push(item)
    }
    addSecurityObservation(failure)
  })

  return {
    consoleErrors,
    pageErrors,
    failedRequests,
    securityObservations,
  }
}

function launchFailureMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error)
  if (/executable doesn't exist|browser.*not found/i.test(detail)) {
    return [
      'JavaScript rendering could not start the selected local browser.',
      'Check SEO_BROWSER_EXECUTABLE_PATH or install Chromium with the command in `seo` output.',
    ].join(' ')
  }
  return 'JavaScript rendering could not start the selected local browser.'
}

async function launchBrowser(): Promise<LaunchedBrowser> {
  const resolution = resolveBrowserExecutable(chromium.executablePath())
  if (resolution.status !== 'available') {
    throw new JavaScriptRenderingError(
      browserUnavailableMessage(resolution),
      'browser-unavailable',
    )
  }
  try {
    const browser = await chromium.launch({
      headless: true,
      executablePath: resolution.browser.path,
    })
    return { browser, executable: resolution.browser }
  } catch (error) {
    throw new JavaScriptRenderingError(
      launchFailureMessage(error),
      'browser-unavailable',
    )
  }
}

async function renderPage(input: {
  browser: LaunchedBrowser
  url: string
  rate: NormalizedFetchRateControls
  timeoutMs?: number
  signal?: AbortSignal
}): Promise<PageFetchResult> {
  const startedAt = Date.now()
  const host = new URL(input.url).host
  const beforeFetch = await waitForHostBackpressure(host, input.rate)
  const timeoutMs = input.timeoutMs ?? DEFAULT_RENDER_TIMEOUT_MS
  const context = await input.browser.browser.newContext({
    userAgent: BROWSER_USER_AGENT,
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
  })
  let page: Page | undefined
  let aborted = Boolean(input.signal?.aborted)
  const abort = (): void => {
    aborted = true
    void page?.close().catch(() => undefined)
  }

  if (input.signal?.aborted) abort()
  else input.signal?.addEventListener('abort', abort, { once: true })

  try {
    page = await context.newPage()
    const renderDiagnostics = createPageDiagnostics(page)
    const response = await page.goto(input.url, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    })
    if (aborted) {
      throw new JavaScriptRenderingError(
        'JavaScript rendering was aborted.',
        'navigation-failed',
      )
    }

    let networkIdleReached = true
    await page
      .waitForLoadState('networkidle', {
        timeout: Math.min(NETWORK_IDLE_TIMEOUT_MS, timeoutMs),
      })
      .catch(() => {
        networkIdleReached = false
      })
    const html = await page.content()
    const status = response?.status() ?? 200
    const durationMs = Date.now() - startedAt
    const backpressure = recordHostFetch({
      host,
      status,
      durationMs,
      retryAfterMs: retryAfterMs(response?.headers()['retry-after']),
      rate: input.rate,
    })
    return {
      url: input.url,
      finalUrl: page.url(),
      status,
      headers: response?.headers() ?? {},
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
        rateLimit: rateLimitDiagnostics(host, input.rate),
        backpressure:
          backpressure.status === 'ok' && beforeFetch.status !== 'ok'
            ? beforeFetch
            : backpressure,
        rendering: {
          mode: 'on',
          status: 'rendered',
          browser: {
            source: input.browser.executable.source,
            product: input.browser.executable.product,
            version: input.browser.browser.version(),
          },
          navigation: {
            waitUntil: 'domcontentloaded',
            networkIdleTimeoutMs: Math.min(NETWORK_IDLE_TIMEOUT_MS, timeoutMs),
            networkIdleReached,
          },
          ...renderDiagnostics,
        },
      },
      warnings: networkIdleReached
        ? []
        : [
            `Rendered page did not reach network idle within ${Math.min(NETWORK_IDLE_TIMEOUT_MS, timeoutMs)}ms; captured DOM after DOMContentLoaded.`,
          ],
    }
  } catch (error) {
    if (error instanceof JavaScriptRenderingError) throw error
    if (aborted) {
      throw new JavaScriptRenderingError(
        'JavaScript rendering was aborted.',
        'navigation-failed',
      )
    }
    throw new JavaScriptRenderingError(
      'JavaScript rendering could not load this page.',
      'navigation-failed',
    )
  } finally {
    input.signal?.removeEventListener('abort', abort)
    await context.close().catch(() => undefined)
  }
}

/**
 * One renderer owns one browser process and a bounded number of isolated
 * contexts. Create it once for a crawl, then close it after the crawl exits.
 */
export function createPageRenderer(
  input: { concurrency?: number } = {},
): PageRenderer {
  const queue = new PQueue({
    concurrency: Math.max(
      1,
      Math.min(input.concurrency ?? MAX_RENDER_CONTEXTS, MAX_RENDER_CONTEXTS),
    ),
  })
  let launched: Promise<LaunchedBrowser> | undefined

  const browser = (): Promise<LaunchedBrowser> => {
    launched ??= launchBrowser()
    return launched
  }

  return {
    render: (url, rate, options) =>
      queue.add(async () =>
        renderPage({
          browser: await browser(),
          url,
          rate,
          timeoutMs: options.timeoutMs,
          signal: options.signal,
        }),
      ) as Promise<PageFetchResult>,
    close: async () => {
      await queue.onIdle()
      const current = await launched?.catch(() => undefined)
      await current?.browser.close().catch(() => undefined)
    },
  }
}

export function looksLikeSpa(html: string): boolean {
  const lower = html.toLowerCase()
  return (
    /<div[^>]+id="root"[^>]*>\s*<\/div>/.test(lower) ||
    /<div[^>]+id="__next"[^>]*>\s*<\/div>/.test(lower) ||
    /<app-root[^>]*>\s*<\/app-root>/.test(lower) ||
    /enable javascript/i.test(lower)
  )
}

/** @deprecated Prefer a shared renderer created with createPageRenderer. */
export async function fetchWithPlaywright(
  url: string,
  rate: NormalizedFetchRateControls,
): Promise<PageFetchResult> {
  const renderer = createPageRenderer()
  try {
    return await renderer.render(url, rate, {})
  } finally {
    await renderer.close()
  }
}
