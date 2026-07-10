export type RobotsDirective = 'noindex' | 'nofollow' | 'nosnippet'

export type SnippetControlEvidence = {
  source: 'meta-robots' | 'x-robots-tag'
  directive: 'nosnippet' | 'max-snippet'
  raw: string
  value?: number
}

export type EffectiveSnippetControl = {
  status: 'not-restricted' | 'limited' | 'blocked'
  reason:
    | 'no-restrictive-directive'
    | 'max-snippet-limit'
    | 'max-snippet-zero'
    | 'nosnippet'
  maxCharacters?: number
  evidence: SnippetControlEvidence[]
}

function normalizedDirective(value: string): RobotsDirective[] {
  const directive = value.trim().toLowerCase().split(/\s+/)[0]
  if (directive === 'none') return ['noindex', 'nofollow']
  if (
    directive === 'noindex' ||
    directive === 'nofollow' ||
    directive === 'nosnippet'
  ) {
    return [directive]
  }
  return []
}

function values(value?: string | string[]): string[] {
  if (Array.isArray(value)) return value
  return value ? [value] : []
}

function metaDirectiveTokens(value?: string | string[]): string[] {
  return values(value).flatMap((item) =>
    item
      .split(',')
      .map((token) => token.trim())
      .filter(Boolean),
  )
}

function xDirectiveTokens(
  value?: string | string[],
  userAgent = 'googlebot',
): string[] {
  const requestedAgent = userAgent.toLowerCase()
  const tokens: string[] = []

  for (const item of values(value)) {
    let scopedAgent: string | undefined
    for (const rawToken of item.split(',')) {
      const token = rawToken.trim()
      if (!token) continue
      const scoped = token.match(/^([a-z][a-z0-9_-]*):\s*(.*)$/i)
      const prefix = scoped?.[1]?.toLowerCase()
      const parameterizedDirective =
        prefix === 'unavailable_after' || prefix?.startsWith('max-')
      if (scoped && !parameterizedDirective) {
        scopedAgent = prefix
        const directiveValue = scoped[2]?.trim()
        if (scopedAgent === requestedAgent && directiveValue) {
          tokens.push(directiveValue)
        }
        continue
      }
      if (scopedAgent && scopedAgent !== requestedAgent) continue
      tokens.push(token)
    }
  }

  return tokens
}

export function combineRobotsValues(
  value: Array<string | undefined>,
): string | undefined {
  const combined = value
    .map((item) => item?.trim())
    .filter((item): item is string => Boolean(item))
    .join(', ')
  return combined || undefined
}

export function metaRobotsDirectives(
  value?: string | string[],
): Set<RobotsDirective> {
  const directives = new Set<RobotsDirective>()
  for (const token of metaDirectiveTokens(value)) {
    for (const directive of normalizedDirective(token)) {
      directives.add(directive)
    }
  }
  return directives
}

export function xRobotsDirectives(
  value?: string | string[],
  userAgent = 'googlebot',
): Set<RobotsDirective> {
  const directives = new Set<RobotsDirective>()
  for (const token of xDirectiveTokens(value, userAgent)) {
    for (const directive of normalizedDirective(token)) {
      directives.add(directive)
    }
  }
  return directives
}

export function hasMetaRobotsDirective(
  value: string | string[] | undefined,
  directive: RobotsDirective,
): boolean {
  return metaRobotsDirectives(value).has(directive)
}

export function hasXRobotsDirective(
  value: string | string[] | undefined,
  directive: RobotsDirective,
): boolean {
  return xRobotsDirectives(value).has(directive)
}

export function effectiveRobotsDirectives(input: {
  metaRobots?: string | string[]
  xRobotsTag?: string | string[]
}): Set<RobotsDirective> {
  return new Set([
    ...metaRobotsDirectives(input.metaRobots),
    ...xRobotsDirectives(input.xRobotsTag),
  ])
}

function snippetEvidence(
  source: SnippetControlEvidence['source'],
  tokens: string[],
): SnippetControlEvidence[] {
  const evidence: SnippetControlEvidence[] = []
  for (const raw of tokens) {
    const normalized = raw.trim().toLowerCase()
    if (normalized === 'nosnippet') {
      evidence.push({ source, directive: 'nosnippet', raw })
      continue
    }
    const match = normalized.match(/^max-snippet\s*:\s*(-?\d+)$/)
    if (!match) continue
    const value = Number(match[1])
    if (!Number.isSafeInteger(value) || value < -1) continue
    evidence.push({ source, directive: 'max-snippet', raw, value })
  }
  return evidence
}

export function effectiveSnippetControl(input: {
  metaRobots?: string | string[]
  xRobotsTag?: string | string[]
}): EffectiveSnippetControl {
  const evidence = [
    ...snippetEvidence('meta-robots', metaDirectiveTokens(input.metaRobots)),
    ...snippetEvidence('x-robots-tag', xDirectiveTokens(input.xRobotsTag)),
  ]
  const hasNoSnippet = evidence.some((item) => item.directive === 'nosnippet')
  const limits = evidence
    .filter(
      (item): item is SnippetControlEvidence & { value: number } =>
        item.directive === 'max-snippet' && item.value !== undefined,
    )
    .map((item) => item.value)

  if (hasNoSnippet) {
    return {
      status: 'blocked',
      reason: 'nosnippet',
      maxCharacters: 0,
      evidence,
    }
  }
  if (limits.includes(0)) {
    return {
      status: 'blocked',
      reason: 'max-snippet-zero',
      maxCharacters: 0,
      evidence,
    }
  }
  const positiveLimits = limits.filter((value) => value > 0)
  if (positiveLimits.length) {
    return {
      status: 'limited',
      reason: 'max-snippet-limit',
      maxCharacters: Math.min(...positiveLimits),
      evidence,
    }
  }
  return {
    status: 'not-restricted',
    reason: 'no-restrictive-directive',
    evidence,
  }
}
