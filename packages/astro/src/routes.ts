import { posix } from 'node:path'

export interface MarkdownRoute {
  filePath: string
  htmlPath: string
  markdownPath: string
}

function normalizedBase(base: string): string {
  if (!base.startsWith('/')) throw new Error('Base path must start with /')
  const value = base.replace(/\/+$/u, '') || '/'
  return value === '/' ? value : `${value}`
}

function validateRawPath(pathname: string): void {
  if (pathname.includes('?') || pathname.includes('#')) {
    throw new Error('Route path must not contain a query or fragment')
  }
  if (pathname.includes('\\') || /%(?:2f|5c)/iu.test(pathname)) {
    throw new Error('Route path contains an encoded or literal separator')
  }

  for (const segment of pathname.split('/')) {
    let decoded: string
    try {
      decoded = decodeURIComponent(segment)
    } catch {
      throw new Error(`Route path contains invalid encoding: ${segment}`)
    }
    if (decoded === '.' || decoded === '..') {
      throw new Error('Route path contains traversal')
    }
    if (decoded.includes('/') || decoded.includes('\\')) {
      throw new Error('Route path contains an encoded or literal separator')
    }
  }
}

function canonicalSegments(pathname: string): string[] {
  return pathname
    .split('/')
    .filter(Boolean)
    .map((segment) =>
      encodeURIComponent(decodeURIComponent(segment).normalize('NFC')),
    )
}

export function markdownRouteForPath(
  pathname: string,
  base = '/',
): MarkdownRoute {
  if (!pathname.startsWith('/')) throw new Error('Route path must start with /')
  validateRawPath(pathname)

  const basePath = normalizedBase(base)
  const segments = canonicalSegments(pathname)
  const normalizedPath = segments.length > 0 ? `/${segments.join('/')}` : '/'
  const normalizedBasePath =
    basePath === '/' ? '/' : `/${canonicalSegments(basePath).join('/')}`

  if (
    normalizedBasePath !== '/' &&
    normalizedPath !== normalizedBasePath &&
    !normalizedPath.startsWith(`${normalizedBasePath}/`)
  ) {
    throw new Error(
      `Route ${normalizedPath} is outside base ${normalizedBasePath}`,
    )
  }

  const relativePath =
    normalizedBasePath === '/'
      ? normalizedPath.slice(1)
      : normalizedPath.slice(normalizedBasePath.length).replace(/^\//u, '')
  const relativeSegments = relativePath ? relativePath.split('/') : []
  const markdownSegments =
    relativeSegments.length === 0
      ? ['index.md']
      : [
          ...relativeSegments.slice(0, -1),
          `${relativeSegments.at(-1) ?? ''}.md`,
        ]
  const publicPrefix = normalizedBasePath === '/' ? '' : normalizedBasePath
  const markdownPath = `${publicPrefix}/${markdownSegments.join('/')}`
  const filePath = posix.join(
    ...markdownSegments.map((segment) => decodeURIComponent(segment)),
  )

  if (filePath.startsWith('../') || posix.isAbsolute(filePath)) {
    throw new Error('Markdown target escapes the output directory')
  }

  return {
    htmlPath: normalizedPath,
    markdownPath,
    filePath,
  }
}

export function assertNoRouteCollisions(
  routes: readonly MarkdownRoute[],
): void {
  const exact = new Set<string>()
  const insensitive = new Map<string, string>()

  for (const route of routes) {
    if (exact.has(route.filePath)) {
      throw new Error(`Duplicate Markdown target: ${route.filePath}`)
    }
    exact.add(route.filePath)

    const folded = route.filePath.toLocaleLowerCase('en-US')
    const existing = insensitive.get(folded)
    if (existing && existing !== route.filePath) {
      throw new Error(
        `Case-insensitive Markdown collision: ${existing} and ${route.filePath}`,
      )
    }
    insensitive.set(folded, route.filePath)
  }
}
