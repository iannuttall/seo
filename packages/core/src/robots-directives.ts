export type RobotsDirective = 'noindex' | 'nofollow'

function normalizedDirective(value: string): RobotsDirective[] {
  const directive = value.trim().toLowerCase().split(/\s+/)[0]
  if (directive === 'none') return ['noindex', 'nofollow']
  if (directive === 'noindex' || directive === 'nofollow') return [directive]
  return []
}

function values(value?: string | string[]): string[] {
  if (Array.isArray(value)) return value
  return value ? [value] : []
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
  for (const item of values(value)) {
    for (const token of item.split(',')) {
      for (const directive of normalizedDirective(token)) {
        directives.add(directive)
      }
    }
  }
  return directives
}

export function xRobotsDirectives(
  value?: string | string[],
  userAgent = 'googlebot',
): Set<RobotsDirective> {
  const directives = new Set<RobotsDirective>()
  const requestedAgent = userAgent.toLowerCase()

  for (const item of values(value)) {
    let scopedAgent: string | undefined
    for (const rawToken of item.split(',')) {
      const token = rawToken.trim()
      const scoped = token.match(/^([a-z][a-z0-9_-]*):\s*(.*)$/i)
      const prefix = scoped?.[1]?.toLowerCase()
      const directivePrefix =
        prefix === 'unavailable_after' || prefix?.startsWith('max-')
      const directiveValue =
        scoped && !directivePrefix ? (scoped[2] ?? '') : token
      if (scoped && !directivePrefix) scopedAgent = prefix
      if (scopedAgent && scopedAgent !== requestedAgent) continue
      for (const directive of normalizedDirective(directiveValue)) {
        directives.add(directive)
      }
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
