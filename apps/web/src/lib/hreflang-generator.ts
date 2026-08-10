export const HREFLANG_LIMITS = {
  entries: 50,
  urlCharacters: 2_048,
  outputBytes: 250_000,
} as const

export const HREFLANG_OUTPUT_FORMATS = [
  { value: 'html', label: 'HTML link tags' },
  { value: 'header', label: 'HTTP Link header' },
  { value: 'sitemap', label: 'XML sitemap entries' },
] as const

export type HreflangOutputFormat =
  (typeof HREFLANG_OUTPUT_FORMATS)[number]['value']

export type HreflangEntry = { code: string; url: string }

export type HreflangIssue = {
  level: 'error' | 'warning'
  code: string
  message: string
  row?: number
}

export type HreflangResult = {
  output: string
  filename: string
  entries: HreflangEntry[]
  issues: HreflangIssue[]
  capped: boolean
}

function xml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function canonicalCode(raw: string): string | undefined {
  const value = raw.trim()
  if (value.toLocaleLowerCase() === 'x-default') return 'x-default'
  if (!/^[A-Za-z]{2}(?:-[A-Za-z]{4})?(?:-[A-Za-z]{2})?$/u.test(value)) {
    return undefined
  }
  try {
    const locale = new Intl.Locale(value)
    if (locale.language.length !== 2) return undefined
    const languageName = new Intl.DisplayNames(['en'], { type: 'language' }).of(
      locale.language,
    )
    if (!languageName || languageName.toLocaleLowerCase() === locale.language) {
      return undefined
    }
    if (locale.region) {
      const regionName = new Intl.DisplayNames(['en'], { type: 'region' }).of(
        locale.region,
      )
      if (!regionName || regionName === locale.region) return undefined
    }
    const parts = [locale.language.toLocaleLowerCase()]
    if (locale.script) {
      parts.push(
        `${locale.script[0]?.toLocaleUpperCase()}${locale.script.slice(1).toLocaleLowerCase()}`,
      )
    }
    if (locale.region) parts.push(locale.region.toLocaleUpperCase())
    return parts.join('-')
  } catch {
    return undefined
  }
}

function publicUrl(raw: string): string | undefined {
  const bounded = raw.trim().slice(0, HREFLANG_LIMITS.urlCharacters)
  try {
    const url = new URL(bounded)
    if (!['http:', 'https:'].includes(url.protocol)) return undefined
    url.hash = ''
    return url.toString()
  } catch {
    return undefined
  }
}

function htmlOutput(entries: HreflangEntry[]): string {
  return `${entries
    .map(
      (entry) =>
        `<link rel="alternate" hreflang="${xml(entry.code)}" href="${xml(entry.url)}">`,
    )
    .join('\n')}\n`
}

function headerOutput(entries: HreflangEntry[]): string {
  return `Link: ${entries
    .map((entry) => `<${entry.url}>; rel="alternate"; hreflang="${entry.code}"`)
    .join(',\n      ')}\n`
}

function sitemapOutput(entries: HreflangEntry[]): string {
  const alternates = entries
    .map(
      (entry) =>
        `    <xhtml:link rel="alternate" hreflang="${xml(entry.code)}" href="${xml(entry.url)}" />`,
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries
  .map(
    (entry) => `  <url>
    <loc>${xml(entry.url)}</loc>
${alternates}
  </url>`,
  )
  .join('\n')}
</urlset>
`
}

export function generateHreflang(
  rawEntries: HreflangEntry[],
  format: HreflangOutputFormat,
): HreflangResult {
  const issues: HreflangIssue[] = []
  const entries: HreflangEntry[] = []
  const codes = new Set<string>()
  const urls = new Map<string, string[]>()
  const boundedRows = rawEntries.slice(0, HREFLANG_LIMITS.entries)

  if (rawEntries.length > HREFLANG_LIMITS.entries) {
    issues.push({
      level: 'warning',
      code: 'entry_cap',
      message: `Only the first ${HREFLANG_LIMITS.entries} rows were checked.`,
    })
  }

  for (const [index, raw] of boundedRows.entries()) {
    if (!raw.code.trim() && !raw.url.trim()) continue
    const row = index + 1
    const code = canonicalCode(raw.code)
    const url = publicUrl(raw.url)
    if (!code) {
      issues.push({
        level: 'error',
        code: 'invalid_code',
        message:
          'Use a two-letter language code, an optional script or region, or x-default.',
        row,
      })
    } else if (codes.has(code.toLocaleLowerCase())) {
      issues.push({
        level: 'error',
        code: 'duplicate_code',
        message: `${code} appears more than once.`,
        row,
      })
    }
    if (!url) {
      issues.push({
        level: 'error',
        code: 'invalid_url',
        message: 'Use a complete HTTP or HTTPS URL.',
        row,
      })
    }
    if (!code || !url) continue
    codes.add(code.toLocaleLowerCase())
    const urlCodes = urls.get(url) ?? []
    urlCodes.push(code)
    urls.set(url, urlCodes)
    entries.push({ code, url })
  }

  if (entries.length < 2) {
    issues.push({
      level: 'error',
      code: 'too_few_entries',
      message: 'Add at least two localized page URLs.',
    })
  }
  for (const [url, urlCodes] of urls) {
    if (urlCodes.length > 1) {
      issues.push({
        level: 'warning',
        code: 'shared_url',
        message: `${urlCodes.join(', ')} point to the same URL (${url}). Check that this is intentional.`,
      })
    }
  }
  if (!entries.some((entry) => entry.code === 'x-default')) {
    issues.push({
      level: 'warning',
      code: 'missing_default',
      message: 'Consider an x-default fallback for unmatched languages.',
    })
  }

  const hasErrors = issues.some((issue) => issue.level === 'error')
  const rawOutput = hasErrors
    ? ''
    : format === 'header'
      ? headerOutput(entries)
      : format === 'sitemap'
        ? sitemapOutput(entries)
        : htmlOutput(entries)
  const output = rawOutput.slice(0, HREFLANG_LIMITS.outputBytes)
  return {
    output,
    filename:
      format === 'sitemap'
        ? 'hreflang-sitemap.xml'
        : format === 'header'
          ? 'hreflang-link-header.txt'
          : 'hreflang-tags.html',
    entries,
    issues,
    capped: output.length < rawOutput.length,
  }
}
