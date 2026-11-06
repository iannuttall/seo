// Reads a pasted or uploaded redirect map in the browser and checks its
// logic before anything is fetched: repeated old URLs, maps that point at
// another old URL (a chain or a loop), many old URLs sent to one page, and
// old URLs sent to the homepage.

export const REDIRECT_MAP_ROWS = 200

export type MapRow = { line: number; from: string; to: string | null }

export type MapIssue = {
  kind: 'duplicate' | 'chain' | 'loop' | 'many-to-one' | 'homepage' | 'http'
  lines: number[]
  message: string
}

const URLISH = /^(?:https?:\/\/|\/|[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[/?#]|$))/iu

function absolute(value: string, site: string): string {
  const trimmed = value.trim().replace(/^["']|["']$/gu, '')
  if (trimmed.startsWith('/') && site) {
    return `${site.replace(/\/+$/u, '')}${trimmed}`
  }
  if (/^https?:\/\//iu.test(trimmed) || trimmed.startsWith('/')) return trimmed
  return `https://${trimmed}`
}

// One row a line: old URL, then optional new URL, split by a comma, a tab
// or spaces. A first line that is not a URL is a header. Paths that start
// with a slash use the site address.
export function parseRedirectMap(
  text: string,
  site = '',
): {
  rows: MapRow[]
  skipped: number[]
} {
  const rows: MapRow[] = []
  const skipped: number[] = []
  const origin = site.trim()
    ? absolute(site.trim(), '').replace(/^(https?:\/\/[^/]+).*$/iu, '$1')
    : ''
  text.split(/\r?\n/u).forEach((raw, index) => {
    const line = raw.trim()
    if (!line || line.startsWith('#')) return
    const parts = line
      .split(/\s*[,\t;]\s*|\s+/u)
      .map((part) => part.trim().replace(/^["']|["']$/gu, ''))
      .filter(Boolean)
    const [from, to] = parts
    if (!from || !URLISH.test(from)) {
      if (rows.length > 0 || index > 0) skipped.push(index + 1)
      return
    }
    if (from.startsWith('/') && !origin) {
      skipped.push(index + 1)
      return
    }
    rows.push({
      line: index + 1,
      from: absolute(from, origin),
      to:
        to && URLISH.test(to) && !(to.startsWith('/') && !origin)
          ? absolute(to, origin)
          : null,
    })
  })
  return { rows, skipped }
}

function key(value: string): string {
  try {
    const url = new URL(value)
    const path =
      url.pathname.length > 1 ? url.pathname.replace(/\/+$/u, '') : '/'
    return `${url.host.toLowerCase()}${path}${url.search}`
  } catch {
    return value
  }
}

export function mapIssues(rows: MapRow[]): MapIssue[] {
  const issues: MapIssue[] = []
  const bySource = new Map<string, MapRow[]>()
  for (const row of rows) {
    const k = key(row.from)
    bySource.set(k, [...(bySource.get(k) ?? []), row])
  }
  for (const group of bySource.values()) {
    if (group.length < 2) continue
    issues.push({
      kind: 'duplicate',
      lines: group.map((row) => row.line),
      message: `${group[0]?.from} is listed ${group.length} times. A server uses one rule, so the others never run.`,
    })
  }

  for (const row of rows) {
    if (!row.to) continue
    const next = bySource.get(key(row.to))?.[0]
    if (!next) continue
    if (key(next.from) === key(row.from)) continue
    const seen = new Set([key(row.from)])
    let cursor: MapRow | undefined = next
    let loop = false
    while (cursor?.to) {
      if (seen.has(key(cursor.from))) {
        loop = true
        break
      }
      seen.add(key(cursor.from))
      cursor = bySource.get(key(cursor.to))?.[0]
    }
    issues.push(
      loop
        ? {
            kind: 'loop',
            lines: [row.line, next.line],
            message: `${row.from} points to ${row.to}, which leads back round to a URL already in the path. That is a loop, so no page loads.`,
          }
        : {
            kind: 'chain',
            lines: [row.line, next.line],
            message: `${row.from} points to ${row.to}, which is itself redirected on line ${next.line}. Point it straight at the final URL.`,
          },
    )
  }

  const byTarget = new Map<string, MapRow[]>()
  for (const row of rows) {
    if (!row.to) continue
    const k = key(row.to)
    byTarget.set(k, [...(byTarget.get(k) ?? []), row])
  }
  for (const group of byTarget.values()) {
    const target = group[0]?.to as string
    let path = ''
    try {
      path = new URL(target).pathname
    } catch {
      path = ''
    }
    if (path === '/') {
      const moved = group.filter((row) => {
        try {
          return new URL(row.from).pathname !== '/'
        } catch {
          return true
        }
      })
      if (moved.length) {
        issues.push({
          kind: 'homepage',
          lines: moved.map((row) => row.line),
          message: `${moved.length} old ${moved.length === 1 ? 'page goes' : 'pages go'} to the homepage. Google treats that as a soft 404 unless the homepage really replaces them.`,
        })
      }
      continue
    }
    if (group.length >= 3) {
      issues.push({
        kind: 'many-to-one',
        lines: group.map((row) => row.line),
        message: `${group.length} old URLs go to ${target}. Fine if that page merges their content. If not, Google may treat them as soft 404s.`,
      })
    }
  }

  const insecure = rows.filter((row) => row.to?.startsWith('http://'))
  if (insecure.length) {
    issues.push({
      kind: 'http',
      lines: insecure.map((row) => row.line),
      message: `${insecure.length} new ${insecure.length === 1 ? 'URL uses' : 'URLs use'} http. If the site redirects http to https, each one adds a hop.`,
    })
  }
  return issues.sort((a, b) => (a.lines[0] ?? 0) - (b.lines[0] ?? 0))
}
