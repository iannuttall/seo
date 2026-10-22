import type { Meter } from './meter.ts'
import type { Run } from './site-audit.ts'

// Turns a finished crawl into findings and a one-row summary. All grouping
// is done in SQL over the pages table, so memory holds findings, not pages.
//
// A finding's id is a hash of its rule and subject, so the same problem
// keeps its id each week. An open finding is one the latest run saw. Rows are
// written only when a finding is new, comes back, changes or is resolved, so
// a quiet week costs almost no writes.

const MAX_PER_RULE = 1000
const MAX_EXAMPLES = 5
const MAX_CHANGES = 200

export type RunSummary = {
  status: 'done' | 'failed'
  complete: boolean
  pages: {
    known: number
    fetched: number
    failed: number
    blocked: number
    queued: number
    links_past_cap: number
  }
  findings: {
    open: number
    new: number
    reopened: number
    resolved: number
    by_rule: Record<string, number>
    capped_rules: string[]
    resolution: 'all' | 'crawled-pages-only'
  }
  changes: {
    compared: boolean
    new_urls: number
    gone_urls: number
    status_changed: number
    title_changed: number
    examples: {
      url: string
      change: string
      before: string | null
      after: string | null
    }[]
  }
  usage: {
    wakes: number
    requests: number
    throttled: number
    alarms: number
    rows_written: number
    rows_read: number
    wall_ms: number
  }
}

type Detected = { rule: string; subject: string; details: string }

async function findingId(rule: string, subject: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${rule}\n${subject}`),
  )
  return [...new Uint8Array(digest).slice(0, 16)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

const HTML_OK =
  "state = 'fetched' AND status = 200 AND content_type LIKE 'text/html%'"

// Every rule, as SQL that returns rule, subject and a JSON details string,
// ordered by subject so the cap keeps the same rows each week.
function rules(): { rule: string; sql: string }[] {
  const linkTargets = (where: string) => `
    SELECT t.url AS subject, json_object('status', t.status, 'location', t.location,
      'linking_pages', count(DISTINCT p.url),
      'examples', json_group_array(DISTINCT p.url)) AS details
    FROM pages p, json_each(p.links) j
    JOIN pages t ON t.url = j.value ->> 'u'
    WHERE p.state = 'fetched' AND ${where}
    GROUP BY t.url ORDER BY t.url`
  return [
    { rule: 'link_to_error', sql: linkTargets('t.status >= 400') },
    {
      rule: 'link_to_redirect',
      sql: linkTargets('t.status BETWEEN 300 AND 399'),
    },
    {
      rule: 'link_failed',
      sql: linkTargets("t.state = 'failed'"),
    },
    {
      rule: 'title_missing',
      sql: `SELECT url AS subject, '{}' AS details FROM pages
        WHERE ${HTML_OK} AND coalesce(title, '') = '' ORDER BY url`,
    },
    {
      rule: 'title_duplicate',
      sql: `SELECT title AS subject, json_object('pages', count(*),
          'examples', json_group_array(url)) AS details
        FROM pages WHERE ${HTML_OK} AND coalesce(title, '') != ''
          AND coalesce(robots, '') NOT LIKE '%noindex%'
        GROUP BY title HAVING count(*) > 1 ORDER BY title`,
    },
    {
      rule: 'description_missing',
      sql: `SELECT url AS subject, '{}' AS details FROM pages
        WHERE ${HTML_OK} AND coalesce(description, '') = '' ORDER BY url`,
    },
    {
      rule: 'h1_missing',
      sql: `SELECT url AS subject, '{}' AS details FROM pages
        WHERE ${HTML_OK} AND coalesce(h1, '') = '' ORDER BY url`,
    },
    {
      rule: 'noindex',
      sql: `SELECT url AS subject, json_object('meta', robots, 'header', x_robots,
          'in_sitemap', in_sitemap) AS details FROM pages
        WHERE ${HTML_OK} AND (coalesce(robots, '') LIKE '%noindex%'
          OR coalesce(x_robots, '') LIKE '%noindex%') ORDER BY url`,
    },
    {
      rule: 'canonical_elsewhere',
      sql: `SELECT url AS subject, json_object('canonical', canonical) AS details FROM pages
        WHERE ${HTML_OK} AND canonical IS NOT NULL AND canonical != url ORDER BY url`,
    },
    {
      rule: 'sitemap_url_not_ok',
      sql: `SELECT url AS subject, json_object('status', status, 'state', state,
          'location', location) AS details FROM pages
        WHERE in_sitemap = 1 AND (state IN ('failed', 'blocked')
          OR (state = 'fetched' AND status != 200)) ORDER BY url`,
    },
    {
      // Heuristic: in a sitemap, but no crawled page links to it.
      rule: 'sitemap_page_unlinked',
      sql: `WITH inbound AS (
          SELECT DISTINCT j.value ->> 'u' AS url FROM pages p, json_each(p.links) j
          WHERE p.state = 'fetched' AND j.value ->> 'u' != p.url)
        SELECT p.url AS subject, '{}' AS details FROM pages p
        LEFT JOIN inbound i ON i.url = p.url
        WHERE p.in_sitemap = 1 AND p.state = 'fetched' AND p.status = 200
          AND p.content_type LIKE 'text/html%' AND i.url IS NULL ORDER BY p.url`,
    },
    {
      rule: 'thin_page',
      sql: `SELECT url AS subject, json_object('words', words) AS details FROM pages
        WHERE ${HTML_OK} AND words < 100 AND coalesce(robots, '') NOT LIKE '%noindex%'
        ORDER BY url`,
    },
  ]
}

export async function analyse(
  meter: Meter,
  run: Run,
  status: 'done' | 'failed',
  now: number,
): Promise<RunSummary> {
  const counts = { queued: 0, fetched: 0, failed: 0, blocked: 0 }
  for (const row of meter.all<{ state: keyof typeof counts; n: number }>(
    'SELECT state, count(*) AS n FROM pages GROUP BY state',
  )) {
    counts[row.state] = row.n
  }
  // Complete: the crawl ended on its own, with nothing left queued and no
  // links past the URL cap. Only then can a missing finding mean fixed.
  const complete =
    status === 'done' && counts.queued === 0 && run.dropped_urls === 0

  const detected: Detected[] = []
  const byRule: Record<string, number> = {}
  const cappedRules: string[] = []
  for (const { rule, sql } of rules()) {
    const rows = meter.all<{ subject: string; details: string }>(
      `${sql} LIMIT ${MAX_PER_RULE + 1}`,
    )
    if (rows.length > MAX_PER_RULE) {
      cappedRules.push(rule)
      rows.length = MAX_PER_RULE
    }
    byRule[rule] = rows.length
    for (const row of rows) {
      detected.push({ rule, subject: row.subject, details: trim(row.details) })
    }
  }

  const ids = await Promise.all(
    detected.map((finding) => findingId(finding.rule, finding.subject)),
  )
  const stored = new Map(
    meter
      .all<{
        id: string
        rule: string
        subject: string
        state: string
        details: string
      }>('SELECT id, rule, subject, state, details FROM findings')
      .map((row) => [row.id, row]),
  )
  const seen = new Set<string>()
  let added = 0
  let reopened = 0
  let resolved = 0

  meter.transaction(() => {
    detected.forEach((finding, index) => {
      const id = ids[index] as string
      seen.add(id)
      const before = stored.get(id)
      if (!before) {
        added += 1
        meter.run(
          `INSERT INTO findings (id, rule, subject, details, state, first_seen_run, first_seen_at)
           VALUES (?, ?, ?, ?, 'open', ?, ?)`,
          id,
          finding.rule,
          finding.subject,
          finding.details,
          run.id,
          now,
        )
      } else if (before.state === 'resolved') {
        reopened += 1
        meter.run(
          `UPDATE findings SET state = 'open', details = ?, reopened_at = ?, resolved_at = NULL
           WHERE id = ?`,
          finding.details,
          now,
          id,
        )
      } else if (before.details !== finding.details) {
        meter.run(
          'UPDATE findings SET details = ? WHERE id = ?',
          finding.details,
          id,
        )
      }
    })

    // A capped or failed crawl cannot show that a problem is gone, except
    // for findings about a page this run fetched again.
    const fetchedNow = complete
      ? null
      : new Set(
          meter
            .all<{ url: string }>(
              "SELECT url FROM pages WHERE state = 'fetched'",
            )
            .map((row) => row.url),
        )
    for (const [id, before] of stored) {
      if (before.state !== 'open' || seen.has(id)) continue
      // A finding resolves only after a complete crawl, or when this run
      // fetched its page again.
      if (
        fetchedNow &&
        (before.rule === 'title_duplicate' ||
          cappedRules.includes(before.rule) ||
          !fetchedNow.has(before.subject))
      ) {
        continue
      }
      resolved += 1
      meter.run(
        "UPDATE findings SET state = 'resolved', resolved_at = ? WHERE id = ?",
        now,
        id,
      )
    }
  })

  const open =
    meter.one<{ n: number }>(
      "SELECT count(*) AS n FROM findings WHERE state = 'open'",
    )?.n ?? 0

  return {
    status,
    complete,
    pages: {
      known: counts.queued + counts.fetched + counts.failed + counts.blocked,
      ...counts,
      links_past_cap: run.dropped_urls,
    },
    findings: {
      open,
      new: added,
      reopened,
      resolved,
      by_rule: byRule,
      capped_rules: cappedRules,
      resolution: complete ? 'all' : 'crawled-pages-only',
    },
    changes: compare(meter),
    usage: {
      wakes: run.wakes,
      requests: run.requests,
      throttled: run.throttled,
      alarms: run.alarms,
      rows_written: run.rows_written,
      rows_read: run.rows_read,
      wall_ms: now - run.started_at,
    },
  }
}

// Caps the example lists inside a finding's details.
function trim(details: string): string {
  const value = JSON.parse(details) as Record<string, unknown>
  for (const key of ['examples']) {
    const list = value[key]
    if (Array.isArray(list) && list.length > MAX_EXAMPLES) {
      value[key] = [...list].sort().slice(0, MAX_EXAMPLES)
      value[`${key}_total`] = list.length
    } else if (Array.isArray(list)) {
      value[key] = [...list].sort()
    }
  }
  return JSON.stringify(value)
}

// What changed since the previous run, from last week's pages table.
function compare(meter: Meter): RunSummary['changes'] {
  const previous = meter.one<{ n: number }>(
    "SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'pages_prev'",
  )?.n
  const empty = {
    compared: false,
    new_urls: 0,
    gone_urls: 0,
    status_changed: 0,
    title_changed: 0,
    examples: [],
  }
  if (!previous) return empty
  const totals = meter.one<{
    new_urls: number
    gone_urls: number
    status_changed: number
    title_changed: number
  }>(`SELECT
      (SELECT count(*) FROM pages p WHERE p.state = 'fetched'
        AND NOT EXISTS (SELECT 1 FROM pages_prev o WHERE o.url = p.url AND o.state = 'fetched')) AS new_urls,
      (SELECT count(*) FROM pages_prev o WHERE o.state = 'fetched'
        AND NOT EXISTS (SELECT 1 FROM pages p WHERE p.url = o.url AND p.state = 'fetched')) AS gone_urls,
      (SELECT count(*) FROM pages p JOIN pages_prev o ON o.url = p.url
        WHERE p.state = 'fetched' AND o.state = 'fetched' AND p.status != o.status) AS status_changed,
      (SELECT count(*) FROM pages p JOIN pages_prev o ON o.url = p.url
        WHERE p.status = 200 AND o.status = 200
          AND coalesce(p.title, '') != coalesce(o.title, '')) AS title_changed`)
  const examples = meter.all<{
    url: string
    change: string
    before: string | null
    after: string | null
  }>(
    `SELECT p.url, 'status' AS change, CAST(o.status AS TEXT) AS before,
       CAST(p.status AS TEXT) AS after
     FROM pages p JOIN pages_prev o ON o.url = p.url
     WHERE p.state = 'fetched' AND o.state = 'fetched' AND p.status != o.status
     UNION ALL
     SELECT p.url, 'title', o.title, p.title FROM pages p JOIN pages_prev o ON o.url = p.url
     WHERE p.status = 200 AND o.status = 200 AND coalesce(p.title, '') != coalesce(o.title, '')
     ORDER BY 1, 2 LIMIT ${MAX_CHANGES}`,
  )
  return { compared: true, ...(totals ?? empty), examples }
}
