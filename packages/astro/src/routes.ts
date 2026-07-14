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

function normalizedPath(pathname: string): string {
  const segments = canonicalSegments(pathname)
  return segments.length > 0 ? `/${segments.join('/')}` : '/'
}

function normalizedBasePath(base: string): string {
  const basePath = normalizedBase(base)
  return basePath === '/' ? '/' : normalizedPath(basePath)
}

function assertPathInsideBase(pathname: string, basePath: string): void {
  if (
    basePath !== '/' &&
    pathname !== basePath &&
    !pathname.startsWith(`${basePath}/`)
  ) {
    throw new Error(`Route ${pathname} is outside base ${basePath}`)
  }
}

export function markdownRouteForPath(
  pathname: string,
  base = '/',
): MarkdownRoute {
  if (!pathname.startsWith('/')) throw new Error('Route path must start with /')
  validateRawPath(pathname)

  const canonicalPath = normalizedPath(pathname)
  const basePath = normalizedBasePath(base)
  assertPathInsideBase(canonicalPath, basePath)

  const relativePath =
    basePath === '/'
      ? canonicalPath.slice(1)
      : canonicalPath.slice(basePath.length).replace(/^\//u, '')
  const relativeSegments = relativePath ? relativePath.split('/') : []
  const markdownSegments =
    relativeSegments.length === 0
      ? ['index.md']
      : [
          ...relativeSegments.slice(0, -1),
          `${relativeSegments.at(-1) ?? ''}.md`,
        ]
  const publicPrefix = basePath === '/' ? '' : basePath
  const markdownPath = `${publicPrefix}/${markdownSegments.join('/')}`
  const filePath = markdownSegments
    .map((segment) => decodeURIComponent(segment))
    .join('/')

  return {
    htmlPath: canonicalPath,
    markdownPath,
    filePath,
  }
}

export function htmlPathForMarkdownPath(pathname: string, base = '/'): string {
  if (!pathname.startsWith('/')) throw new Error('Route path must start with /')
  validateRawPath(pathname)

  const canonicalPath = normalizedPath(pathname)
  const basePath = normalizedBasePath(base)
  assertPathInsideBase(canonicalPath, basePath)
  if (!canonicalPath.endsWith('.md')) {
    throw new Error(`Markdown route must end with .md: ${canonicalPath}`)
  }

  const relativePath =
    basePath === '/'
      ? canonicalPath.slice(1)
      : canonicalPath.slice(basePath.length).replace(/^\//u, '')
  if (relativePath === 'index.md') return basePath

  const htmlRelativePath = relativePath.slice(0, -'.md'.length)
  if (!htmlRelativePath) {
    throw new Error(`Markdown route has no HTML route: ${canonicalPath}`)
  }
  return basePath === '/'
    ? `/${htmlRelativePath}`
    : `${basePath}/${htmlRelativePath}`
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
