import { readJson } from '@seo/core/hosted'
import { addUnmetered } from '../usage.ts'
import { extractPage, type PageFacts } from './extract.ts'
import type { Meter } from './meter.ts'

// JavaScript rendering for the weekly audit, with Browser Run's content
// quick action: Cloudflare's browser loads the page, runs its scripts and
// returns the DOM as HTML. The audit fetches every page raw first; this
// renders the 200 HTML ones when the site needs it (see site-audit.ts).

const RENDER_TIMEOUT_MS = 15_000
// The rendered HTML comes back as a JSON string, so allow for escaping on
// top of the 2 MB the extractor reads.
const MAX_RESPONSE_BYTES = 6_000_000
const BUSY_RETRY_MS = 30_000
const MAX_BUSY_RETRY_MS = 120_000
// A change in word count under both of these is noise, such as a cookie
// banner, not content that needs JavaScript.
const MIN_WORD_CHANGE = 50
const MIN_WORD_RATIO = 0.2
// HTML pages rendered both ways at the start of each run, to find out
// whether the site needs JavaScript rendering.
const PROBE_PAGES = 5

// A run's JavaScript rendering columns (schema.ts).
export type RenderState = {
  render: 'on' | 'off' | 'unavailable' | null
  render_probes: number
  render_errors: number
  browser_ms: number
}

export type Rendered =
  | { kind: 'rendered'; facts: PageFacts; browserMs: number }
  // Browser Run is rate-limiting this account: try the page again later.
  | { kind: 'busy'; retryAfterMs: number; browserMs: number }
  | { kind: 'failed'; error: string; browserMs: number }

const sameUrl = (a: string, b: string) => {
  const left = URL.parse(a)
  const right = URL.parse(b)
  if (!left || !right) return a === b
  left.hash = ''
  right.hash = ''
  return left.href === right.href
}

export async function renderPage(
  browser: BrowserRun | undefined,
  url: string,
  origin: string,
  userAgent: string,
): Promise<Rendered> {
  if (!browser) {
    return { kind: 'failed', error: 'Browser Run is not set up', browserMs: 0 }
  }
  let response: Response
  try {
    response = await browser.quickAction('content', {
      url,
      userAgent,
      gotoOptions: { waitUntil: 'networkidle2', timeout: RENDER_TIMEOUT_MS },
      // Keep what the browser has after the timeout instead of failing.
      bestAttempt: true,
      // Pictures, video and fonts never change the DOM's tags or links.
      rejectResourceTypes: ['image', 'media', 'font'],
      cacheTTL: 0,
    })
  } catch (caught) {
    return {
      kind: 'failed',
      error: `Browser Run failed: ${caught instanceof Error ? caught.message : String(caught)}`,
      browserMs: 0,
    }
  }
  const browserMs = Math.round(
    Number(response.headers.get('x-browser-ms-used')) || 0,
  )
  if (response.status === 429 || response.status === 503) {
    await response.body?.cancel()
    const header = Number(response.headers.get('retry-after'))
    return {
      kind: 'busy',
      retryAfterMs:
        Number.isFinite(header) && header > 0
          ? Math.min(header * 1000, MAX_BUSY_RETRY_MS)
          : BUSY_RETRY_MS,
      browserMs,
    }
  }
  let body: BrowserRunContentSuccessResponse | BrowserRunErrorResponse
  try {
    body = await readJson(response, 'Browser Run', {
      maxBytes: MAX_RESPONSE_BYTES,
    })
  } catch (caught) {
    return {
      kind: 'failed',
      error: caught instanceof Error ? caught.message : String(caught),
      browserMs,
    }
  }
  if (!body.success) {
    const detail = body.errors?.[0]?.message ?? `HTTP ${response.status}`
    return {
      kind: 'failed',
      error: `Browser Run failed: ${detail}`.slice(0, 300),
      browserMs,
    }
  }
  // The raw fetch saw a 200. A different answer to the browser is usually
  // bot protection, whose page says nothing about the real one.
  if (body.meta.status !== 200) {
    return {
      kind: 'failed',
      error: `The rendered page returned ${body.meta.status}`,
      browserMs,
    }
  }
  if (body.meta.finalUrl && !sameUrl(body.meta.finalUrl, url)) {
    return {
      kind: 'failed',
      error: `The rendered page moved to ${body.meta.finalUrl}`.slice(0, 300),
      browserMs,
    }
  }
  const facts = await extractPage(new Response(body.result), url, origin)
  return { kind: 'rendered', facts, browserMs }
}

// What the raw HTML said where rendering changed it: the raw value of each
// tag that differs, the raw link count when rendering found other internal
// links, and the raw word count when the text changed by a real amount.
// Null when rendering changed nothing the audit reads.
export type RawDifference = Partial<
  Pick<PageFacts, 'title' | 'description' | 'h1' | 'canonical' | 'robots'>
> & { links?: number; words?: number }

export function rawDifference(
  raw: PageFacts,
  rendered: PageFacts,
): RawDifference | null {
  const difference: RawDifference = {}
  for (const key of [
    'title',
    'description',
    'h1',
    'canonical',
    'robots',
  ] as const) {
    if (raw[key] !== rendered[key]) difference[key] = raw[key]
  }
  const rawLinks = new Set(raw.internal.map((link) => link.u))
  if (
    rawLinks.size !== rendered.internal.length ||
    rendered.internal.some((link) => !rawLinks.has(link.u))
  ) {
    difference.links = raw.internal.length
  }
  const change = Math.abs(rendered.words - raw.words)
  if (
    change >= MIN_WORD_CHANGE &&
    change >= MIN_WORD_RATIO * Math.max(raw.words, rendered.words)
  ) {
    difference.words = raw.words
  }
  return Object.keys(difference).length ? difference : null
}

export type RunRender =
  | {
      kind: 'page'
      render: 'rendered' | 'failed'
      // The facts to keep: the rendered page's, or null to keep the raw ones.
      facts: PageFacts | null
      raw: RawDifference | null
      error: string | null
    }
  | { kind: 'busy'; retryAfterMs: number }

// Renders one raw 200 HTML page when the run needs it: every page while
// the first PROBE_PAGES decide whether the site needs JavaScript, then
// every page if it does. Updates the run's rendering state in memory; the
// caller saves it with the page, except when Browser Run is busy. Null
// when the page is not rendered.
export async function renderForRun(
  meter: Meter,
  browser: BrowserRun | undefined,
  run: RenderState,
  url: string,
  origin: string,
  rawFacts: PageFacts,
  userAgent: string,
): Promise<RunRender | null> {
  if (run.render !== null && run.render !== 'on') return null
  const rendered = await renderPage(browser, url, origin, userAgent)
  run.browser_ms += rendered.browserMs
  // Counted at once, before the page is written: a page rendered again
  // after an eviction used the browser twice.
  if (rendered.browserMs > 0) {
    addUnmetered(meter, 'browser_run_ms', rendered.browserMs)
  }
  if (browser) addUnmetered(meter, 'browser_run_pages', 1)
  if (rendered.kind === 'busy') {
    // No page is written, so save the browser time here.
    saveRendering(meter, run)
    return { kind: 'busy', retryAfterMs: rendered.retryAfterMs }
  }
  const result: RunRender =
    rendered.kind === 'rendered'
      ? {
          kind: 'page',
          render: 'rendered',
          facts: rendered.facts,
          raw: rawDifference(rawFacts, rendered.facts),
          error: null,
        }
      : {
          kind: 'page',
          render: 'failed',
          facts: null,
          raw: null,
          error: rendered.error,
        }
  if (result.render === 'failed') run.render_errors += 1
  if (run.render === null) {
    run.render_probes += 1
    if (result.raw) run.render = 'on'
    else if (run.render_probes >= PROBE_PAGES) {
      run.render =
        run.render_errors >= run.render_probes ? 'unavailable' : 'off'
    }
  }
  return result
}

// Saves the run's rendering state that renderForRun changed in memory.
export function saveRendering(meter: Meter, run: RenderState): void {
  meter.run(
    'UPDATE run SET render = ?, render_probes = ?, render_errors = ?, browser_ms = ?',
    run.render,
    run.render_probes,
    run.render_errors,
    run.browser_ms,
  )
}
