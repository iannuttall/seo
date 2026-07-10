import { site } from './site'

export function canonicalUrl(pathname: string): string {
  if (pathname === '/') return site.url

  const path = `/${pathname}`.replace(/\/{2,}/g, '/').replace(/\/$/, '')
  return `${site.url}${path}`
}
