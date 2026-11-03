// Where a page's sharing image lives: `/` is `/og/index.png` and
// `/parks/alder-common` is `/og/parks/alder-common.png`.
export function ogImagePath(pathname: string): string {
  const slug = pathname.replace(/^\/+|\/+$/g, '').replace(/\.html$/, '')
  return `/og/${slug || 'index'}.png`
}

// The URL path a built file serves: `index.html` is `/`, `parks/a.html` is
// `/parks/a`.
export function pagePathname(htmlFile: string): string {
  const file = htmlFile.replace(/\\/g, '/')
  const path = `/${file}`.replace(/(?:\/index)?\.html$/, '')
  return path || '/'
}
