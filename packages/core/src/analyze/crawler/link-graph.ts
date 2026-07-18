export function resolveFetchedAlias(
  url: string,
  aliases: ReadonlyMap<string, string>,
): string {
  const visited = new Set<string>()
  let current = url
  while (!visited.has(current)) {
    visited.add(current)
    const next = aliases.get(current)
    if (!next) return current
    current = next
  }
  return current
}

export function resolveLinkCountAliases(
  counts: ReadonlyMap<string, number>,
  aliases: ReadonlyMap<string, string>,
): Map<string, number> {
  const resolved = new Map<string, number>()
  for (const [url, count] of counts) {
    const target = resolveFetchedAlias(url, aliases)
    resolved.set(target, (resolved.get(target) ?? 0) + count)
  }
  return resolved
}

export function resolveLinkGraphAliases(
  linkGraph: Record<string, string[]>,
  aliases: ReadonlyMap<string, string>,
): Record<string, string[]> {
  const resolved: Record<string, Set<string>> = {}
  for (const [source, targets] of Object.entries(linkGraph)) {
    const resolvedSource = resolveFetchedAlias(source, aliases)
    let resolvedTargets = resolved[resolvedSource]
    if (!resolvedTargets) {
      resolvedTargets = new Set<string>()
      resolved[resolvedSource] = resolvedTargets
    }
    for (const target of targets) {
      resolvedTargets.add(resolveFetchedAlias(target, aliases))
    }
  }
  return Object.fromEntries(
    Object.entries(resolved).map(([source, targets]) => [
      source,
      [...targets].sort((left, right) =>
        left < right ? -1 : left > right ? 1 : 0,
      ),
    ]),
  )
}
