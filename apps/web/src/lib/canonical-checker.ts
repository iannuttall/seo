export const CANONICAL_CHECKER_LIMITS = {
  htmlCharacters: 250_000,
  candidates: 20,
  urlCharacters: 2_048,
  issues: 50,
} as const

export type CanonicalCandidate = {
  href: string
  inHead: boolean
}

export type CanonicalIssue = {
  level: 'error' | 'warning' | 'note'
  code: string
  message: string
}

export type CanonicalResolvedCandidate = CanonicalCandidate & {
  resolved?: string
  relation?: 'self' | 'same-site' | 'cross-site'
}

export type CanonicalResult = {
  status: 'missing' | 'valid' | 'multiple' | 'invalid'
  pageUrl?: string
  candidates: CanonicalResolvedCandidate[]
  issues: CanonicalIssue[]
  suggestedTag?: string
  capped: boolean
}

function normalizedUrl(raw: string, base?: string): string | undefined {
  try {
    const value = raw.trim().slice(0, CANONICAL_CHECKER_LIMITS.urlCharacters)
    const url = base ? new URL(value, base) : new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return undefined
    url.hash = ''
    return url.toString()
  } catch {
    return undefined
  }
}

function tag(url: string): string {
  return `<link rel="canonical" href="${url
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')}">`
}

export function analyzeCanonical(input: {
  pageUrl: string
  baseHref?: string
  candidates: CanonicalCandidate[]
  inputCapped?: boolean
}): CanonicalResult {
  const issues: CanonicalIssue[] = []
  const pageUrl = normalizedUrl(input.pageUrl)
  if (!pageUrl) {
    issues.push({
      level: 'error',
      code: 'invalid_page_url',
      message: 'Add the complete HTTP or HTTPS URL for the page being checked.',
    })
  }
  const resolvedBase = input.baseHref
    ? normalizedUrl(input.baseHref, pageUrl)
    : undefined
  const baseUrl = resolvedBase ?? pageUrl
  if (input.baseHref && !resolvedBase) {
    issues.push({
      level: 'warning',
      code: 'invalid_base',
      message: 'The first base URL in the HTML is invalid and was ignored.',
    })
  }

  const bounded = input.candidates.slice(0, CANONICAL_CHECKER_LIMITS.candidates)
  if (input.candidates.length > CANONICAL_CHECKER_LIMITS.candidates) {
    issues.push({
      level: 'warning',
      code: 'candidate_cap',
      message: `Only the first ${CANONICAL_CHECKER_LIMITS.candidates} canonical tags were checked.`,
    })
  }
  const candidates = bounded.map<CanonicalResolvedCandidate>((candidate) => {
    const resolved = normalizedUrl(candidate.href, baseUrl)
    let relation: CanonicalResolvedCandidate['relation']
    if (resolved && pageUrl) {
      if (resolved === pageUrl) relation = 'self'
      else if (new URL(resolved).origin === new URL(pageUrl).origin) {
        relation = 'same-site'
      } else relation = 'cross-site'
    }
    if (!candidate.inHead) {
      issues.push({
        level: 'error',
        code: 'outside_head',
        message: 'A canonical link appears outside the document head.',
      })
    }
    if (!resolved) {
      issues.push({
        level: 'error',
        code: 'invalid_canonical',
        message: `The canonical value "${candidate.href || '(empty)'}" is not a valid HTTP or HTTPS URL.`,
      })
    } else if (!/^https?:\/\//iu.test(candidate.href.trim())) {
      issues.push({
        level: 'warning',
        code: 'relative_canonical',
        message: `The relative canonical resolves to ${resolved}. A complete URL is easier to verify.`,
      })
    }
    if (relation === 'same-site') {
      issues.push({
        level: 'note',
        code: 'points_elsewhere',
        message: `The canonical points to another URL on this site: ${resolved}. Confirm that the pages are duplicate or very similar.`,
      })
    } else if (relation === 'cross-site') {
      issues.push({
        level: 'warning',
        code: 'cross_site',
        message: `The canonical points to another site: ${resolved}. Check that this is intentional.`,
      })
    }
    return { ...candidate, resolved, relation }
  })

  if (candidates.length === 0) {
    issues.push({
      level: 'note',
      code: 'missing',
      message:
        'No canonical link was found. A canonical is optional when the page has no duplicate versions.',
    })
  } else if (candidates.length > 1) {
    issues.push({
      level: 'error',
      code: 'multiple',
      message: `${candidates.length} canonical links were found. Conflicting canonical signals can be ignored.`,
    })
  }

  const valid = candidates.filter(
    (candidate) => candidate.resolved && candidate.inHead,
  )
  const status =
    candidates.length === 0
      ? 'missing'
      : candidates.length > 1
        ? 'multiple'
        : valid.length === 1
          ? 'valid'
          : 'invalid'
  const suggestedTag =
    valid.length === 1 && valid[0]?.resolved
      ? tag(valid[0].resolved)
      : undefined
  return {
    status,
    pageUrl,
    candidates,
    issues: issues.slice(0, CANONICAL_CHECKER_LIMITS.issues),
    suggestedTag,
    capped:
      Boolean(input.inputCapped) ||
      input.candidates.length > CANONICAL_CHECKER_LIMITS.candidates ||
      issues.length > CANONICAL_CHECKER_LIMITS.issues,
  }
}
