import {
  type AuditCheckRow,
  type AuditChecks,
  CommandError,
  commandErrorFrom,
  dateWindow,
  earlierRange,
  indexStatusFrom,
  isLostPage,
  type SearchAnalyticsQuery,
  searchConsoleDay,
} from '@seo/core/commands'
import type { Meter } from './meter.ts'

// The site's one store of Google URL Inspection results (the weekly-audit
// beta), and the background checks that fill it.
//
// Every hosted call reads the store first and inspects only a URL whose
// result is due: never checked, past its due_at, or changed in a crawl since
// (status, redirect, canonical or noindex).
//
// The cycle is set by the quota. Each property spends its full 2,000 checks
// a day, spread evenly over what is left of the Search Console day (Pacific
// time), one wake an hour. Its top pages (lost clicks, then clicks, then
// impressions; up to TOP_PER_DAY) are due daily. The rest are due every
// cycle_days, the fewest days in which the checks left after the top pages
// can cover them. A wake takes due URLs first (a drop waiting for its
// confirming check, then pages that lost their clicks, by clicks, by
// impressions, sitemap URLs never checked, the oldest), then spends any
// quota left on the least recently checked URLs not checked in the last 20
// hours.
//
// A URL that was indexed (verdict PASS) and is not on a later check has
// dropped out of the index; the reverse is a return. A top page's drop is
// confirmed by a second check an hour later, so a one-off answer is not
// reported. The first check of a URL is its baseline.
//
// Each property has its own quota, so a URL-prefix property inside the site
// (such as https://example.com/blog/) checks the URLs under it. When the
// sitemap has more URLs than its properties can check in 7 days, the store
// names the folders that would add the most checks as their own properties.

export const PER_DAY = 2000
// Top pages a property checks daily: half its quota, so the rest always
// moves.
export const TOP_PER_DAY = 1000
const DAY_MS = 86_400_000
// Results from before due_at existed were fresh for 7 days.
const LEGACY_MS = 7 * DAY_MS
// A URL checked this recently is not checked again just to spend quota.
const RECHECK_MS = 20 * 3_600_000
// What a property can cover in 7 days, for the folder suggestions.
const PER_WEEK = PER_DAY * 7
// Sitemap and crawl URLs kept; Search Console pages come on top (at most
// 25,000 a window, the same cap as seo index).
export const MAX_KNOWN = 50_000
const MAX_SEARCH_ROWS = 25_000
const HOUR_MS = 3_600_000
// Due URLs read per wake while looking for ones whose property has budget.
const MAX_SCANNED = 5000
const CONCURRENCY = 4
// A wake stops starting checks after this long; the next starts a second
// later.
const WAKE_MS = 60_000
const MIN_FOLDER = 500
const MAX_SUGGESTIONS = 3
const MAX_RESULT_CHARS = 8000

// What the checks need from Google. LinkedAccounts is one.
export type Google = {
  properties(): Promise<string[]>
  inspect(property: string, url: string): Promise<unknown>
  searchAnalytics(): SearchAnalyticsQuery
}

type Site = { property: string; origin: string | null; scope: string }

type State = {
  day: string | null
  properties: string | null
  suggestions: string | null
  stopped: string | null
  next_at: number | null
  updated_at: number | null
}

// Due at the bound time: never checked, past due_at, or changed in a crawl
// since.
const DUE = `(checked_at IS NULL OR coalesce(due_at, checked_at + ${LEGACY_MS}) <= ?
  OR coalesce(live_changed_at > checked_at, 0))`
// The queue order. Lost-click pages by the clicks they had, the rest of
// Search Console's pages by clicks then impressions.
const RANK = `CASE WHEN lost = 1 THEN 0 WHEN clicks > 0 OR impressions > 0 THEN 1
  WHEN checked_at IS NULL AND in_sitemap = 1 THEN 2 ELSE 3 END`
const ORDER = `pending_drop_at IS NOT NULL DESC, ${RANK}, CASE WHEN lost = 1 THEN prev_clicks ELSE clicks END DESC,
  impressions DESC, coalesce(checked_at, 0), url`

export function state(meter: Meter): State | null {
  return meter.one<State>('SELECT * FROM check_state')
}

export function saveState(meter: Meter, fields: Partial<State>): void {
  const next = { ...state(meter), ...fields, updated_at: Date.now() }
  meter.run(
    `INSERT INTO check_state (id, day, properties, suggestions, stopped, next_at, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET day = excluded.day, properties = excluded.properties,
       suggestions = excluded.suggestions, stopped = excluded.stopped,
       next_at = excluded.next_at, updated_at = excluded.updated_at`,
    next.day ?? null,
    next.properties ?? null,
    next.suggestions ?? null,
    next.stopped ?? null,
    next.next_at ?? null,
    next.updated_at,
  )
}

// Adds URLs a crawl found, up to MAX_KNOWN, and marks the ones already known
// as seen in this run. One row written per new or changed URL.
export function addKnown(
  meter: Meter,
  urls: string[],
  runId: string,
  inSitemap: 0 | 1,
): void {
  if (urls.length === 0) return
  let room =
    MAX_KNOWN -
    (meter.one<{ n: number }>(
      'SELECT count(*) AS n FROM checks WHERE seen_run IS NOT NULL',
    )?.n ?? 0)
  for (let index = 0; index < urls.length; index += 1000) {
    const chunk = JSON.stringify(urls.slice(index, index + 1000))
    meter.run(
      `UPDATE checks SET seen_run = ?, in_sitemap = max(in_sitemap, ?)
       WHERE url IN (SELECT value FROM json_each(?))
         AND (seen_run IS NOT ? OR in_sitemap < ?)`,
      runId,
      inSitemap,
      chunk,
      runId,
      inSitemap,
    )
    if (room <= 0) continue
    room -= meter.all(
      `INSERT INTO checks (url, in_sitemap, seen_run)
       SELECT DISTINCT value, ?, ? FROM json_each(?)
       WHERE value NOT IN (SELECT url FROM checks) LIMIT ?
       ON CONFLICT (url) DO NOTHING RETURNING 1 AS n`,
      inSitemap,
      runId,
      chunk,
      room,
    ).length
  }
}

// After a crawl: add the pages it fetched as HTML with a 200, note each
// known URL's live facts and mark the ones that changed (which makes their
// result stale), and, after a complete crawl that read every sitemap, drop
// URLs it no longer found that Search Console has no clicks or impressions
// for.
export function syncKnown(
  meter: Meter,
  runId: string,
  complete: boolean,
  now: number,
) {
  const pages = meter
    .all<{ url: string }>(
      `SELECT url FROM pages WHERE state = 'fetched' AND status = 200
         AND content_type LIKE 'text/html%' ORDER BY url`,
    )
    .map((row) => row.url)
  addKnown(meter, pages, runId, 0)
  meter.run(
    `UPDATE checks SET live = p.live,
       live_changed_at = CASE WHEN checks.live IS NULL THEN checks.live_changed_at ELSE ? END
     FROM (SELECT url, status || '|' || coalesce(location, '') || '|' || coalesce(canonical, '')
             || '|' || (lower(coalesce(robots, '') || coalesce(x_robots, '')) LIKE '%noindex%') AS live
           FROM pages WHERE state = 'fetched') AS p
     WHERE checks.url = p.url AND checks.live IS NOT p.live`,
    now,
  )
  const unread = meter.one<{ n: number }>(
    "SELECT count(*) AS n FROM sitemaps WHERE state != 'fetched'",
  )?.n
  if (complete && !unread) {
    meter.run(
      `DELETE FROM checks WHERE seen_run IS NOT ?
         AND clicks = 0 AND impressions = 0 AND prev_clicks = 0`,
      runId,
    )
  }
}

// Which property a path goes to: the longest one that holds it.
function ownerOf(path: string, owned: Iterable<string>, root: string) {
  let best = root
  for (const prefix of owned) {
    if (path.startsWith(prefix) && prefix.length > best.length) best = prefix
  }
  return best
}

// The first- and second-level folders under the root that a path is in.
function foldersOf(path: string, root: string): string[] {
  const parts = path.slice(root.length).split('/')
  const out: string[] = []
  if (parts.length > 1 && parts[0]) out.push(`${root}${parts[0]}/`)
  if (parts.length > 2 && parts[0] && parts[1]) {
    out.push(`${root}${parts[0]}/${parts[1]}/`)
  }
  return out
}

// Up to MAX_SUGGESTIONS folders to add as properties, from the sitemap's
// paths. A folder qualifies with at least MIN_FOLDER sitemap URLs. Each pick
// adds the most URLs checked a week (a property checks at most PER_WEEK);
// ties go to the larger folder, then the name. Its URLs move to it before
// the next pick, so a folder and its parent are never both picked on stale
// counts. Paths are URL paths; root is the audited property's.
export function planProperties(
  paths: string[],
  owned: string[],
  root: string,
): { path: string; urls: number; gain: number }[] {
  const props = new Set([root, ...owned])
  const items = paths.map((path) => ({
    path,
    owner: ownerOf(path, props, root),
    folders: foldersOf(path, root),
  }))
  const size = new Map<string, number>()
  for (const item of items) {
    for (const folder of item.folders) {
      size.set(folder, (size.get(folder) ?? 0) + 1)
    }
  }
  const capped = (n: number) => Math.min(n, PER_WEEK)
  const suggestions: { path: string; urls: number; gain: number }[] = []
  for (let pick = 0; pick < MAX_SUGGESTIONS; pick += 1) {
    const own = new Map<string, number>()
    const moved = new Map<string, number>()
    for (const item of items) {
      own.set(item.owner, (own.get(item.owner) ?? 0) + 1)
      for (const folder of item.folders) {
        if (props.has(folder) || folder.length <= item.owner.length) continue
        moved.set(folder, (moved.get(folder) ?? 0) + 1)
      }
    }
    let best: { path: string; urls: number; gain: number } | null = null
    for (const [path, n] of moved) {
      const total = size.get(path) ?? 0
      if (total < MIN_FOLDER) continue
      const from = own.get(ownerOf(path, props, root)) ?? 0
      const gain = capped(n) + capped(from - n) - capped(from)
      if (gain <= 0) continue
      if (
        !best ||
        gain > best.gain ||
        (gain === best.gain &&
          (total > best.urls || (total === best.urls && path < best.path)))
      ) {
        best = { path, urls: total, gain }
      }
    }
    if (!best) break
    suggestions.push(best)
    props.add(best.path)
    for (const item of items) {
      if (
        item.path.startsWith(best.path) &&
        best.path.length > item.owner.length
      ) {
        item.owner = best.path
      }
    }
  }
  return suggestions
}

// When the next Search Console day starts.
function dayEnd(now: number): number {
  const today = searchConsoleDay(now)
  let at = now - (now % HOUR_MS) + HOUR_MS
  while (searchConsoleDay(at) === today) at += HOUR_MS
  return at
}

// The properties that check this site's URLs, as saved at the day's start.
type Owners = { property: string; path: string }[]

function owners(meter: Meter, site: Site): Owners {
  const saved = JSON.parse(state(meter)?.properties ?? 'null') as
    | (Owners[number] & { urls: number })[]
    | null
  return (
    saved?.map(({ property, path }) => ({ property, path })) ?? [
      { property: site.property, path: site.scope },
    ]
  )
}

// The property that checks a URL: the longest URL-prefix property inside the
// site that holds it, else the audited property.
function propertyFor(url: string, site: Site, list: Owners): string {
  if (!site.origin || !url.startsWith(site.origin)) return site.property
  const path = url.slice(site.origin.length)
  const owner = ownerOf(
    path,
    list.map((item) => item.path),
    site.scope,
  )
  return list.find((item) => item.path === owner)?.property ?? site.property
}

function usedToday(meter: Meter, today: string): Map<string, number> {
  return new Map(
    meter
      .all<{ property: string; used: number }>(
        'SELECT property, used FROM quota WHERE day = ?',
        today,
      )
      .map((row) => [row.property, row.used]),
  )
}

// Once a day: the properties, Search Console clicks and impressions per page
// (which also adds those pages), and the folders to suggest.
async function refreshDay(
  meter: Meter,
  site: Site,
  google: Google,
  today: string,
): Promise<{ stopped: string; retry: number } | null> {
  const origin = site.origin as string
  const readable = await google.properties()
  if (!readable.includes(site.property)) {
    return {
      stopped: `None of the linked Google accounts can read ${site.property} now.`,
      retry: dayEnd(Date.now()) + 10 * 60_000,
    }
  }
  const root = `${origin}${site.scope}`
  const inside = readable
    .filter((property) => property.startsWith(root) && property !== root)
    .map((property) => ({ property, path: new URL(property).pathname }))
  const list: Owners = [
    { property: site.property, path: site.scope },
    ...inside,
  ]

  // Search Console pages: the last 28 final days and the 28 before.
  const range = dateWindow({}, 28)
  const read = (window: typeof range) =>
    google.searchAnalytics()(site.property, {
      ...window,
      dimensions: ['page'],
      type: 'web',
      maxRows: MAX_SEARCH_ROWS,
    })
  const [now, then] = await Promise.all([
    read(range),
    read(earlierRange(range)),
  ])
  const pages = new Map<
    string,
    { clicks: number; impressions: number; prev: number }
  >()
  for (const row of now.rows) {
    const url = row.keys[0]
    if (!url || url.includes('#')) continue
    pages.set(url, {
      clicks: row.clicks,
      impressions: row.impressions,
      prev: 0,
    })
  }
  for (const row of then.rows) {
    const url = row.keys[0]
    if (!url || url.includes('#') || row.clicks === 0) continue
    const page = pages.get(url) ?? { clicks: 0, impressions: 0, prev: 0 }
    page.prev = row.clicks
    pages.set(url, page)
  }
  const rows = [...pages]
    .filter(([, page]) => page.clicks || page.impressions || page.prev)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([url, page]) => [
      url,
      page.clicks,
      page.impressions,
      page.prev,
      isLostPage(page.prev, page.clicks) ? 1 : 0,
    ])

  const sitemapPaths = meter
    .all<{ url: string }>(
      'SELECT url FROM checks WHERE in_sitemap = 1 ORDER BY url',
    )
    .filter((row) => row.url.startsWith(root))
    .map((row) => row.url.slice(origin.length))
  const suggestions = planProperties(
    sitemapPaths,
    inside.map((item) => item.path),
    site.scope,
  )
  meter.transaction(() => {
    meter.run(
      `UPDATE checks SET clicks = 0, impressions = 0, prev_clicks = 0, lost = 0
       WHERE (clicks > 0 OR impressions > 0 OR prev_clicks > 0)
         AND url NOT IN (SELECT j.value ->> 0 FROM json_each(?) j)`,
      JSON.stringify(rows),
    )
    for (let index = 0; index < rows.length; index += 1000) {
      meter.run(
        `INSERT INTO checks (url, clicks, impressions, prev_clicks, lost)
         SELECT j.value ->> 0, j.value ->> 1, j.value ->> 2, j.value ->> 3, j.value ->> 4
         FROM json_each(?) j WHERE true
         ON CONFLICT (url) DO UPDATE SET clicks = excluded.clicks,
           impressions = excluded.impressions, prev_clicks = excluded.prev_clicks,
           lost = excluded.lost
         WHERE clicks IS NOT excluded.clicks OR impressions IS NOT excluded.impressions
           OR prev_clicks IS NOT excluded.prev_clicks OR lost IS NOT excluded.lost`,
        JSON.stringify(rows.slice(index, index + 1000)),
      )
    }
    meter.run('DELETE FROM quota WHERE day != ?', today)
    // Each property's top pages, and the cycle its other URLs get.
    const all = meter.all<{
      url: string
      lost: number
      prev_clicks: number
      clicks: number
      impressions: number
    }>('SELECT url, lost, prev_clicks, clicks, impressions FROM checks')
    const byProperty = new Map<string, typeof all>()
    for (const row of all) {
      const property = propertyFor(row.url, site, list)
      byProperty.set(property, [...(byProperty.get(property) ?? []), row])
    }
    const top: string[] = []
    const plan = list.map((item) => {
      const rows = byProperty.get(item.property) ?? []
      const ranked = rows
        .filter((row) => row.lost || row.clicks || row.impressions)
        .sort(
          (a, b) =>
            b.lost - a.lost ||
            (b.lost ? b.prev_clicks - a.prev_clicks : 0) ||
            b.clicks - a.clicks ||
            b.impressions - a.impressions ||
            (a.url < b.url ? -1 : a.url > b.url ? 1 : 0),
        )
        .slice(0, TOP_PER_DAY)
      for (const row of ranked) top.push(row.url)
      const rest = rows.length - ranked.length
      return {
        ...item,
        urls: rows.length,
        top: ranked.length,
        cycle_days: Math.max(
          1,
          Math.ceil(rest / Math.max(1, PER_DAY - ranked.length)),
        ),
      }
    })
    const topJson = JSON.stringify(top)
    meter.run(
      'UPDATE checks SET top = 0 WHERE top = 1 AND url NOT IN (SELECT value FROM json_each(?))',
      topJson,
    )
    meter.run(
      'UPDATE checks SET top = 1 WHERE top = 0 AND url IN (SELECT value FROM json_each(?))',
      topJson,
    )
    saveState(meter, {
      day: today,
      properties: JSON.stringify(plan),
      suggestions: JSON.stringify(
        suggestions.map((item) => ({
          property: `${origin}${item.path}`,
          urls: item.urls,
          gain: item.gain,
        })),
      ),
      stopped: null,
    })
  })
  return null
}

// Checks a property may still make this wake: what is left today, spread
// evenly over the hours left in the day.
function wakeBudget(left: number, now: number): number {
  const hours = Math.max(1, Math.ceil((dayEnd(now) - now) / HOUR_MS))
  return Math.min(left, Math.ceil(left / hours))
}

// One wake of background checks. Returns when to wake next, or null when
// nothing is due until the next crawl.
export async function runChecks(
  meter: Meter,
  site: Site,
  google: Google,
  started: number,
): Promise<number | null> {
  // A domain property's host is known once the crawl has started.
  if (!site.origin) return started + 60_000
  const today = searchConsoleDay(started)
  if (state(meter)?.day !== today) {
    try {
      const stopped = await refreshDay(meter, site, google, today)
      if (stopped) {
        saveState(meter, { stopped: stopped.stopped })
        return stopped.retry
      }
    } catch (thrown) {
      const error = commandErrorFrom(thrown)
      saveState(meter, {
        stopped: `Search Console could not be read: ${error instanceof Error ? error.message : String(error)}`,
      })
      return started + HOUR_MS
    }
  }
  const list = owners(meter, site)
  const used = usedToday(meter, today)
  const budget = new Map(
    list.map((item) => [
      item.property,
      wakeBudget(
        Math.max(0, PER_DAY - (used.get(item.property) ?? 0)),
        started,
      ),
    ]),
  )
  const want = [...budget.values()].reduce((sum, n) => sum + n, 0)

  // Due URLs in queue order, then the least recently checked, whose
  // property has budget this wake.
  const due: { url: string; property: string }[] = []
  const taken = new Map<string, number>()
  for (
    let offset = 0;
    offset < MAX_SCANNED && due.length < want;
    offset += 500
  ) {
    const rows = meter.all<{ url: string }>(
      `SELECT url FROM checks WHERE ${DUE} OR checked_at <= ?
       ORDER BY ${DUE} DESC, ${ORDER} LIMIT 500 OFFSET ?`,
      started,
      started - RECHECK_MS,
      started,
      offset,
    )
    for (const row of rows) {
      const property = propertyFor(row.url, site, list)
      const n = taken.get(property) ?? 0
      if (n < (budget.get(property) ?? 0)) {
        taken.set(property, n + 1)
        due.push({ url: row.url, property })
      }
    }
    if (rows.length < 500) break
  }

  let stopped = null as { reason: string; retry: number } | null
  let timedOut = false
  const full = new Set<string>()
  const active = new Set<Promise<void>>()
  for (const item of due) {
    while (active.size >= CONCURRENCY) await Promise.race(active)
    if (stopped) break
    if (Date.now() - started >= WAKE_MS) {
      timedOut = true
      break
    }
    if (full.has(item.property)) continue
    const task = inspectOne(meter, google, item, today).then((outcome) => {
      if (outcome.kind === 'rate-limited') full.add(item.property)
      if (outcome.kind === 'stop') stopped ??= outcome
    })
    const tracked: Promise<void> = task.finally(() => active.delete(tracked))
    active.add(tracked)
  }
  await Promise.all(active)

  if (stopped) {
    saveState(meter, { stopped: stopped.reason })
    return stopped.retry
  }
  if (state(meter)?.stopped) saveState(meter, { stopped: null })
  if (timedOut) return Date.now() + 1000
  // Quota left today: the next hourly wake, or sooner for a confirming
  // check; none left: the next Search Console day.
  const left = usedToday(meter, today)
  const more = list.some(
    (item) =>
      !full.has(item.property) && (left.get(item.property) ?? 0) < PER_DAY,
  )
  if (!more) return dayEnd(started) + 10 * 60_000
  const next = meter.one<{ at: number | null }>(
    `SELECT min(coalesce(due_at, checked_at + ${LEGACY_MS}),
       checked_at + ${RECHECK_MS}) AS at FROM checks WHERE checked_at IS NOT NULL`,
  )?.at
  if (due.length === 0 && (next === null || next === undefined)) return null
  return Math.max(
    Date.now() + 1000,
    Math.min(started + HOUR_MS, next ?? started + HOUR_MS),
  )
}

// When a URL is due again after a check.
function dueAfter(
  now: number,
  input: { top: boolean; cycleDays: number; changed: boolean },
): number {
  // An hour early, so the hourly wake on that day takes it.
  if (input.top) return now + DAY_MS - HOUR_MS
  const days = input.changed ? Math.min(2, input.cycleDays) : input.cycleDays
  return now + days * DAY_MS - HOUR_MS
}

// The cycle a property's other URLs get, as worked out today.
function cycleOf(meter: Meter, property: string): number {
  const saved = JSON.parse(state(meter)?.properties ?? '[]') as {
    property: string
    cycle_days?: number
  }[]
  return saved.find((item) => item.property === property)?.cycle_days ?? 7
}

type Outcome =
  | { kind: 'ok'; raw: unknown }
  | { kind: 'answered' }
  | { kind: 'rate-limited' }
  | { kind: 'stop'; reason: string; retry: number; error: unknown }

// One URL Inspection call and its row, with the quota counted in the same
// transaction so a restart never checks past the day's limit. A URL that is
// not known yet (asked by seo page) is added.
export async function inspectOne(
  meter: Meter,
  google: Google,
  item: { url: string; property: string },
  today: string,
): Promise<Outcome> {
  const count = () =>
    meter.run(
      `INSERT INTO quota (property, day, used) VALUES (?, ?, 1)
       ON CONFLICT (property, day) DO UPDATE SET used = used + 1`,
      item.property,
      today,
    )
  let raw: unknown
  try {
    raw = await google.inspect(item.property, item.url)
  } catch (thrown) {
    const error = commandErrorFrom(thrown)
    const httpStatus = (thrown as { status?: unknown }).status
    if (error instanceof CommandError && error.code === 'RATE_LIMITED') {
      // Google's own count says the day is used up: stop this property.
      meter.run(
        `INSERT INTO quota (property, day, used) VALUES (?, ?, ?)
         ON CONFLICT (property, day) DO UPDATE SET used = max(used, excluded.used)`,
        item.property,
        today,
        PER_DAY,
      )
      return { kind: 'rate-limited' }
    }
    if (
      error instanceof CommandError &&
      (error.code === 'NOT_CONNECTED' || error.code === 'NO_ACCESS')
    ) {
      return {
        kind: 'stop',
        reason: error.message,
        retry: dayEnd(Date.now()) + 10 * 60_000,
        error,
      }
    }
    // Google or the network failing: try again in an hour.
    if (
      !(error instanceof CommandError) ||
      (typeof httpStatus === 'number' && httpStatus >= 500)
    ) {
      return {
        kind: 'stop',
        reason: `URL Inspection failed: ${error instanceof Error ? error.message : String(error)}`,
        retry: Date.now() + HOUR_MS,
        error,
      }
    }
    // An answer about this URL only, such as a URL Google will not inspect.
    meter.transaction(() => {
      meter.run(
        `INSERT INTO checks (url, checked_at, due_at, property, error) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (url) DO UPDATE SET checked_at = excluded.checked_at,
           due_at = excluded.due_at, property = excluded.property, error = excluded.error`,
        item.url,
        Date.now(),
        Date.now() + LEGACY_MS,
        item.property,
        error.message.slice(0, 300),
      )
      count()
    })
    return { kind: 'answered' }
  }
  const status = indexStatusFrom(raw)
  const result =
    (raw as { inspectionResult?: { indexStatusResult?: unknown } })
      ?.inspectionResult?.indexStatusResult ?? {}
  const now = Date.now()
  const cycleDays = cycleOf(meter, item.property)
  meter.transaction(() => {
    meter.run(
      'INSERT INTO checks (url) VALUES (?) ON CONFLICT (url) DO NOTHING',
      item.url,
    )
    const before = meter.one<{
      coverage: string | null
      top: number
      indexed: number | null
      pending_drop_at: number | null
    }>(
      'SELECT coverage, top, indexed, pending_drop_at FROM checks WHERE url = ?',
      item.url,
    )
    const indexed = status.verdict === 'PASS' ? 1 : 0
    const changed =
      before?.coverage != null && before.coverage !== status.coverage
    // Drops and returns. The first check is the baseline; a top page's drop
    // waits for one confirming check an hour later.
    let pending: number | null = null
    let transition: 'dropped' | 'returned' | null = null
    if (before?.pending_drop_at != null) {
      if (!indexed) transition = 'dropped'
    } else if (before?.indexed === 1 && !indexed) {
      if (before.top) pending = now
      else transition = 'dropped'
    } else if (before?.indexed === 0 && indexed) {
      transition = 'returned'
    }
    const dueAt =
      pending !== null
        ? now + HOUR_MS
        : dueAfter(now, {
            top: Boolean(before?.top),
            cycleDays,
            changed: changed || transition !== null,
          })
    // A change is a new reason after an earlier answer from Google.
    meter.run(
      `UPDATE checks SET
         prev_coverage = CASE WHEN coverage IS NOT NULL AND coverage IS NOT ? THEN coverage ELSE prev_coverage END,
         changed_at = CASE WHEN coverage IS NOT NULL AND coverage IS NOT ? THEN ? ELSE changed_at END,
         checked_at = ?, due_at = ?, property = ?, verdict = ?, coverage = ?, result = ?, error = NULL,
         indexed = ?, pending_drop_at = ?,
         transition = coalesce(?, transition), transition_at = CASE WHEN ? IS NULL THEN transition_at ELSE ? END
       WHERE url = ?`,
      status.coverage,
      status.coverage,
      now,
      now,
      dueAt,
      item.property,
      status.verdict,
      status.coverage,
      JSON.stringify(result).slice(0, MAX_RESULT_CHARS),
      indexed,
      pending,
      transition,
      transition,
      now,
      item.url,
    )
    count()
  })
  return { kind: 'ok', raw }
}

// One URL for seo page or seo index: the stored result when it is fresh,
// else a new inspection, written to the store. Null when the property has
// no checks left today.
export async function inspectThrough(
  meter: Meter,
  site: Site,
  google: Google,
  url: string,
): Promise<unknown | null> {
  const now = Date.now()
  const row = meter.one<{ result: string | null }>(
    `SELECT result FROM checks WHERE url = ? AND result IS NOT NULL AND NOT ${DUE}`,
    url,
    now,
  )
  if (row?.result) {
    return { inspectionResult: { indexStatusResult: JSON.parse(row.result) } }
  }
  const today = searchConsoleDay(now)
  const property = propertyFor(url, site, owners(meter, site))
  if ((usedToday(meter, today).get(property) ?? 0) >= PER_DAY) return null
  const outcome = await inspectOne(meter, google, { url, property }, today)
  if (outcome.kind === 'ok') return outcome.raw
  if (outcome.kind === 'stop') throw outcome.error
  return null
}

type CheckRow = {
  url: string
  in_sitemap: number
  clicks: number
  prev_clicks: number
  impressions: number
  lost: number
  checked_at: number | null
  property: string | null
  verdict: string | null
  coverage: string | null
  result: string | null
  prev_coverage: string | null
  changed_at: number | null
  error: string | null
  top: number
  transition: string | null
  transition_at: number | null
}

function rowOut(row: CheckRow): AuditCheckRow {
  const status = indexStatusFrom({
    indexStatusResult: row.result ? JSON.parse(row.result) : {},
  })
  return {
    url: row.url,
    in_sitemap: row.in_sitemap === 1,
    clicks: row.clicks,
    previous_clicks: row.prev_clicks,
    impressions: row.impressions,
    lost: row.lost === 1,
    checked_at: row.checked_at,
    property: row.property,
    verdict: row.verdict,
    coverage: row.coverage,
    indexing: status.indexing,
    last_crawl: status.last_crawl,
    google_canonical: status.google_canonical,
    user_canonical: status.user_canonical,
    prev_coverage: row.prev_coverage,
    changed_at: row.changed_at,
    error: row.error,
    top: row.top === 1,
    transition:
      row.transition === 'dropped' || row.transition === 'returned'
        ? row.transition
        : null,
    transition_at: row.transition_at,
  }
}

// Drops out of and returns to Google's index since a time, for the weekly
// report: counts and up to `limit` rows, drops first.
export function indexChanges(meter: Meter, since: number, limit: number) {
  const counts = meter.one<{ dropped: number; returned: number }>(
    `SELECT count(*) FILTER (WHERE transition = 'dropped') AS dropped,
       count(*) FILTER (WHERE transition = 'returned') AS returned
     FROM checks WHERE transition_at > ?`,
    since,
  )
  const rows = meter.all<{
    url: string
    transition: string
    transition_at: number
    coverage: string | null
    top: number
  }>(
    `SELECT url, transition, transition_at, coverage, top FROM checks
     WHERE transition_at > ?
     ORDER BY transition = 'dropped' DESC, top DESC, prev_clicks + clicks DESC, url
     LIMIT ?`,
    since,
    limit,
  )
  return {
    dropped: counts?.dropped ?? 0,
    returned: counts?.returned ?? 0,
    rows: rows.map((row) => ({
      url: row.url,
      change:
        row.transition === 'dropped'
          ? ('dropped' as const)
          : ('returned' as const),
      at: row.transition_at,
      coverage: row.coverage,
      top: row.top === 1,
    })),
  }
}

// Hours until every queued URL is checked at the current pace: each
// property spends what is left today over the rest of the day, then
// PER_DAY a day.
function etaHours(
  queued: Map<string, number>,
  used: Map<string, number>,
  now: number,
): number | null {
  if (queued.size === 0) return null
  const hoursLeft = (dayEnd(now) - now) / HOUR_MS
  let worst = 0
  for (const [property, n] of queued) {
    const left = Math.max(0, PER_DAY - (used.get(property) ?? 0))
    const hours =
      n <= left
        ? (n / Math.max(left, 1)) * hoursLeft
        : hoursLeft + ((n - left) / PER_DAY) * 24
    worst = Math.max(worst, hours)
  }
  return worst
}

// What seo_index shows: coverage, the queue and the time left, Google's
// reasons, and one page of rows.
export function checksView(
  meter: Meter,
  site: Site,
  offset: number,
  limit: number,
): AuditChecks {
  const now = Date.now()
  const week = now - 7 * 86_400_000
  const saved = state(meter)
  const counts = meter.one<{
    known: number
    covered: number
    lost: number
    search: number
    sitemap: number
    stale: number
    changed: number
    dropped: number
    returned: number
  }>(
    `SELECT count(*) AS known,
       count(*) FILTER (WHERE result IS NOT NULL AND NOT ${DUE}) AS covered,
       count(*) FILTER (WHERE ${DUE} AND ${RANK} = 0) AS lost,
       count(*) FILTER (WHERE ${DUE} AND ${RANK} = 1) AS search,
       count(*) FILTER (WHERE ${DUE} AND ${RANK} = 2) AS sitemap,
       count(*) FILTER (WHERE ${DUE} AND ${RANK} = 3) AS stale,
       count(*) FILTER (WHERE changed_at > ?) AS changed,
       count(*) FILTER (WHERE transition = 'dropped' AND transition_at > ?) AS dropped,
       count(*) FILTER (WHERE transition = 'returned' AND transition_at > ?) AS returned
     FROM checks`,
    now,
    now,
    now,
    now,
    now,
    week,
    week,
    week,
  )
  const list = owners(meter, site)
  const queued = new Map<string, number>()
  for (const row of meter.all<{ url: string }>(
    `SELECT url FROM checks WHERE ${DUE}`,
    now,
  )) {
    const property = propertyFor(row.url, site, list)
    queued.set(property, (queued.get(property) ?? 0) + 1)
  }
  const used = usedToday(meter, searchConsoleDay(now))
  const reasons = meter.all<{
    verdict: string | null
    coverage: string | null
    urls: number
    changed_this_week: number
  }>(
    `SELECT verdict, coverage, count(*) AS urls,
       count(*) FILTER (WHERE changed_at > ?) AS changed_this_week
     FROM checks WHERE coverage IS NOT NULL OR verdict IS NOT NULL
     GROUP BY verdict, coverage ORDER BY coverage, verdict`,
    week,
  )
  const listed = `transition_at > ? OR lost = 1 OR changed_at > ? OR (verdict IS NOT NULL AND verdict != 'PASS') OR error IS NOT NULL`
  const total =
    meter.one<{ n: number }>(
      `SELECT count(*) AS n FROM checks WHERE ${listed}`,
      week,
      week,
    )?.n ?? 0
  const rows = meter
    .all<CheckRow>(
      `SELECT url, in_sitemap, clicks, prev_clicks, impressions, lost, checked_at, property,
         verdict, coverage, result, prev_coverage, changed_at, error, top, transition, transition_at
       FROM checks WHERE ${listed}
       ORDER BY coalesce(transition = 'dropped' AND transition_at > ?, 0) DESC,
         coalesce(transition = 'returned' AND transition_at > ?, 0) DESC,
         lost DESC, prev_clicks DESC, coalesce(changed_at > ?, 0) DESC, coverage, url
       LIMIT ? OFFSET ?`,
      week,
      week,
      week,
      week,
      week,
      limit,
      offset,
    )
    .map(rowOut)
  const properties = (
    JSON.parse(saved?.properties ?? '[]') as {
      property: string
      urls: number
      top?: number
      cycle_days?: number
    }[]
  ).map((item) => ({
    property: item.property,
    urls: item.urls,
    top: item.top ?? 0,
    cycle_days: item.cycle_days ?? 7,
    used_today: used.get(item.property) ?? 0,
  }))
  const q = {
    lost: counts?.lost ?? 0,
    search: counts?.search ?? 0,
    sitemap: counts?.sitemap ?? 0,
    stale: counts?.stale ?? 0,
  }
  return {
    property: site.property,
    origin: site.origin,
    known: counts?.known ?? 0,
    covered: counts?.covered ?? 0,
    queued: { ...q, total: q.lost + q.search + q.sitemap + q.stale },
    eta_hours: etaHours(queued, used, now),
    per_day: PER_DAY,
    top_per_day: TOP_PER_DAY,
    properties,
    suggestions: JSON.parse(saved?.suggestions ?? '[]'),
    reasons,
    changed_this_week: counts?.changed ?? 0,
    dropped_this_week: counts?.dropped ?? 0,
    returned_this_week: counts?.returned ?? 0,
    rows,
    total_rows: total,
    offset,
    stopped: saved?.stopped ?? null,
    started: Boolean(saved?.day),
    as_of: now,
  }
}
