import type { RuleId } from '../../rules.js'
import type { CrawlPageSnapshot } from '../monitoring/types.js'

type HreflangFinding = {
  ruleId: RuleId
  detail?: string
  evidence?: Record<string, unknown>
}

function hasRecognizableHreflangFormat(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return (
    normalized === 'x-default' ||
    /^[a-z]{2}(?:-[a-z]{4})?(?:-[a-z]{2})?$/.test(normalized)
  )
}

/**
 * The hreflang set of one audited page. `crawled` returns an alternate this
 * crawl fetched as auditable HTML; only those can say whether they link back,
 * so an alternate the crawl did not reach is not checked.
 */
export function hreflangFindings(
  page: CrawlPageSnapshot,
  isSelf: (href: string) => boolean,
  crawled: (href: string) => CrawlPageSnapshot | undefined,
): HreflangFinding[] {
  const hreflang = page.hreflang ?? []
  if (!hreflang.length) return []
  const findings: HreflangFinding[] = []
  const malformed = hreflang.filter(
    (item) => !hasRecognizableHreflangFormat(item.hreflang),
  )
  if (malformed.length) {
    findings.push({
      ruleId: 'hreflang_invalid',
      detail: `${malformed.length} malformed`,
      evidence: { malformed },
    })
  }
  const duplicateCodes = [
    ...new Set(
      hreflang
        .map((item) => item.hreflang.trim().toLowerCase())
        .filter((code, index, values) => values.indexOf(code) !== index),
    ),
  ]
  if (duplicateCodes.length) {
    findings.push({
      ruleId: 'hreflang_duplicate',
      detail: duplicateCodes.join(', '),
      evidence: { duplicateCodes },
    })
  }
  if (!hreflang.some((item) => isSelf(item.href))) {
    findings.push({
      ruleId: 'hreflang_incomplete',
      detail: page.lang,
      evidence: { lang: page.lang, finalUrl: page.finalUrl, hreflang },
    })
  }
  const missingReturnLinks = hreflang.flatMap((item) => {
    if (isSelf(item.href)) return []
    const alternate = crawled(item.href)
    if (!alternate || alternate === page) return []
    return (alternate.hreflang ?? []).some((back) => isSelf(back.href))
      ? []
      : [{ hreflang: item.hreflang, href: item.href }]
  })
  if (missingReturnLinks.length) {
    findings.push({
      ruleId: 'hreflang_no_return_link',
      detail: `${missingReturnLinks.length} alternate${missingReturnLinks.length === 1 ? '' : 's'} without a return link: ${missingReturnLinks
        .slice(0, 3)
        .map((item) => `${item.hreflang} ${item.href}`)
        .join(', ')}`,
      evidence: { missingReturnLinks: missingReturnLinks.slice(0, 10) },
    })
  }
  const hasDefault = hreflang.some(
    (item) => item.hreflang.trim().toLowerCase() === 'x-default',
  )
  if (!hasDefault && hreflang.length >= 2) {
    findings.push({ ruleId: 'hreflang_x_default_missing' })
  }
  return findings
}
