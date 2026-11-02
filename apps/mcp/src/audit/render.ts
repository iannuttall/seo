import { readJson } from '@seo/core/hosted'
import { addUnmetered } from '../usage.ts'
import { extractPage, type PageFacts } from './extract.ts'
import type { Meter } from './meter.ts'

// JavaScript rendering for the weekly audit, with Browser Run's content
// quick action: Cloudflare's browser loads the page, runs its scripts and
// returns the DOM as HTML. The audit fetches every page raw first; this
// renders the 200 HTML ones where the site needs it (see plan below).

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
// HTML pages of each section rendered both ways to find out whether the
// section needs JavaScript rendering, and how long that answer is kept.
const PROBE_PAGES = 2
const DECISION_MS = 28 * 86_400_000
const MAX_SECTIONS = 200

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

// The section a page belongs to: its first folder, such as /docs/, or /
// for the home page and pages at the top. Sections are decided apart, so a
// client-rendered /app/ does not make a server-rendered blog render.
export function sectionOf(url: string): string {
  const parts = (URL.parse(url)?.pathname ?? '/').split('/').filter(Boolean)
  return parts.length > 1 ? `/${parts[0]}/` : '/'
}

// Signs in the raw HTML that the page may be built with JavaScript
// (heuristic): no title, almost no text, no internal links, or a large
// page that is mostly script. A server-rendered page has none of them.
export function warningSigns(raw: PageFacts): boolean {
  return (
    !raw.title ||
    raw.words < 50 ||
    raw.internal.length === 0 ||
    (raw.bytes >= 100_000 && raw.words < 200)
  )
}

type Probe = { probes: number; errors: number; needs: number | null }

// Whether to render one raw 200 HTML page, and whether it is part of its
// section's check. A section with a result from the last 28 days, this
// crawl's or a stored one, renders every page when it needs rendering and
// only pages with warning signs when it does not. Otherwise its first
// PROBE_PAGES pages are rendered and compared; a section where every
// compared page failed to render reads raw.
function plan(
  meter: Meter,
  section: string,
  raw: PageFacts,
  now: number,
): { render: boolean; probe: boolean; needs: number | null } {
  const needs =
    meter.one<Probe>(
      'SELECT probes, errors, needs FROM render_probes WHERE section = ?',
      section,
    )?.needs ??
    meter.one<{ needs: number }>(
      'SELECT needs FROM render_sections WHERE section = ? AND decided_at > ?',
      section,
      now - DECISION_MS,
    )?.needs ??
    null
  if (needs === -1) return { render: false, probe: false, needs }
  if (needs === 1) return { render: true, probe: false, needs }
  if (needs === 0) return { render: warningSigns(raw), probe: false, needs }
  return { render: true, probe: true, needs }
}

// The run's mode from one section's answer: 'on' wins over 'off', and
// 'unavailable' only stands while nothing else is known. Whether it changed.
function setMode(run: RenderState, needs: number | null): boolean {
  const before = run.render
  if (needs === 1) run.render = 'on'
  else if (needs === 0 && run.render !== 'on') run.render = 'off'
  else if (needs === -1 && run.render === null) run.render = 'unavailable'
  return run.render !== before
}

// Records a rendered page's answer for its section. A new answer is one
// that changes what the section needs: the end of its check, or a page that
// reads differently rendered in a section that did not need rendering.
// Only those are written, so a section that needs rendering is checked
// again once its answer is 28 days old.
function record(
  meter: Meter,
  run: RenderState,
  section: string,
  planned: { probe: boolean; needs: number | null },
  result: { failed: boolean; changed: boolean },
  now: number,
): void {
  let row: Probe | null = null
  if (planned.probe) {
    run.render_probes += 1
    if (result.failed) run.render_errors += 1
    meter.run(
      `INSERT INTO render_probes (section, probes, errors) VALUES (?, 1, ?)
       ON CONFLICT (section) DO UPDATE SET probes = probes + 1, errors = errors + excluded.errors`,
      section,
      result.failed ? 1 : 0,
    )
    row = meter.one<Probe>(
      'SELECT probes, errors, needs FROM render_probes WHERE section = ?',
      section,
    )
  }
  let needs: number | null = null
  if (result.changed && planned.needs !== 1) needs = 1
  else if (row && row.needs === null && row.probes >= PROBE_PAGES) {
    needs = row.errors >= row.probes ? -1 : 0
  }
  if (needs === null) return
  meter.run(
    `INSERT INTO render_probes (section, needs) VALUES (?, ?)
     ON CONFLICT (section) DO UPDATE SET needs = excluded.needs`,
    section,
    needs,
  )
  // Failures are tried again next week, so only real answers are kept.
  if (needs !== -1) {
    meter.run(
      `INSERT INTO render_sections (section, needs, decided_at) VALUES (?, ?, ?)
       ON CONFLICT (section) DO UPDATE SET needs = excluded.needs, decided_at = excluded.decided_at`,
      section,
      needs,
      now,
    )
    meter.run(
      `DELETE FROM render_sections WHERE section NOT IN
         (SELECT section FROM render_sections ORDER BY decided_at DESC, section LIMIT ?)`,
      MAX_SECTIONS,
    )
  }
  setMode(run, needs)
}

// Renders one raw 200 HTML page when its section needs it (see plan).
// Updates the run's rendering state in memory; the caller saves it with
// the page, except when Browser Run is busy. Null when the page is not
// rendered.
export async function renderForRun(
  meter: Meter,
  browser: BrowserRun | undefined,
  run: RenderState,
  url: string,
  origin: string,
  rawFacts: PageFacts,
  userAgent: string,
  now = Date.now(),
): Promise<RunRender | null> {
  const section = sectionOf(url)
  const planned = plan(meter, section, rawFacts, now)
  // A stored answer sets the run's mode even when no page is rendered.
  const moved = setMode(run, planned.needs)
  if (!planned.render) {
    if (moved) saveRendering(meter, run)
    return null
  }
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
  record(
    meter,
    run,
    section,
    planned,
    { failed: result.render === 'failed', changed: Boolean(result.raw) },
    now,
  )
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
