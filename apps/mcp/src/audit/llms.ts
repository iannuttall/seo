import { type ConversionPath, conversionPaths } from '@seo/core/commands'
import type robotsParser from 'robots-parser'
import { siteContext } from '../context.ts'
import { resolveUrl } from './extract.ts'
import type { Meter } from './meter.ts'
import { PRODUCT_TOKEN } from './site-audit.ts'

// The weekly crawl's /llms.txt check: whether the file is there, its links
// on the site (which the crawl fetches, so rules.ts finds a broken one),
// and the business context's conversion pages it does not list.

const MAX_LLMS_CHARS = 500_000
const MAX_LLMS_LINKS = 500

// /llms.txt at the start of a run. links are its http(s) links, at most
// MAX_LLMS_LINKS, resolved and without fragments.
export type Llms = {
  url: string
  status: number
  html: boolean
  links: string[]
}

// The links in an llms.txt: Markdown links, then bare URLs.
export function llmsLinks(text: string, base: string): string[] {
  const hrefs = [
    ...[...text.matchAll(/\]\(\s*<?([^)\s>]+)>?[^)]*\)/g)].map(
      (match) => match[1] ?? '',
    ),
    ...(text.match(/https?:\/\/[^\s)<>\]"'`]+/g) ?? []).map((url) =>
      url.replace(/[.,;:!?*]+$/, ''),
    ),
  ]
  const links = new Set<string>()
  for (const href of hrefs) {
    if (links.size >= MAX_LLMS_LINKS) break
    const url = resolveUrl(href, base)
    if (url) links.add(url.href)
  }
  return [...links]
}

// /llms.txt as found, once a run, or null when the answer is not
// conclusive (robots blocks it, the fetch failed or the server erred), so
// it is never reported missing on a bad day. A 404 or 410, or an HTML page
// in its place, is missing. Kept in the run row for rules.ts; its links on
// the site join the crawl. The crawl waits its gap before the next fetch.
export async function fetchLlms(
  origin: string,
  robots: ReturnType<typeof robotsParser>,
  get: (url: string, redirect: 'follow') => Promise<Response>,
  wake: { requests: number },
  meter: Meter,
): Promise<Llms | null> {
  const llms = await readLlms(origin, robots, get, wake)
  meter.run('UPDATE run SET llms = ?', llms && JSON.stringify(llms))
  return llms
}

async function readLlms(
  origin: string,
  robots: ReturnType<typeof robotsParser>,
  get: (url: string, redirect: 'follow') => Promise<Response>,
  wake: { requests: number },
): Promise<Llms | null> {
  const url = `${origin}/llms.txt`
  if (robots.isAllowed(url, PRODUCT_TOKEN) === false) return null
  let response: Response
  try {
    wake.requests += 1
    response = await get(url, 'follow')
  } catch {
    return null
  }
  const html = /^\s*text\/html/i.test(
    response.headers.get('content-type') ?? '',
  )
  if (!response.ok || html) {
    await response.body?.cancel()
    return response.ok || response.status === 404 || response.status === 410
      ? { url, status: response.status, html, links: [] }
      : null
  }
  const text = (await response.text()).slice(0, MAX_LLMS_CHARS)
  return { url, status: response.status, html, links: llmsLinks(text, url) }
}

// The conversion pages in the site's business context, which llms.txt
// should list; none when it has no context or it cannot be read.
export async function conversionOf(
  env: Env,
  site: { user_id: string; property: string },
): Promise<ConversionPath[]> {
  const context = await siteContext(env, site.user_id)
    .read(site.property)
    .catch(() => null)
  return context ? conversionPaths(context.text) : []
}

// The conversion pages llms.txt does not list. A listed Markdown copy
// (/pricing.md or /pricing/index.md) counts as listing the page, and a
// section (a path ending in / or *) counts when llms.txt lists any page in
// it.
export function llmsMissing(
  llms: Llms,
  pages: ConversionPath[],
): { subject: string; details: string }[] {
  const origin = new URL(llms.url).origin
  const trim = (path: string) => path.replace(/\/+$/, '') || '/'
  const listed = [
    ...new Set(
      llms.links
        .map((link) => new URL(link))
        .filter((url) => url.origin === origin)
        .map((url) => trim(url.pathname.replace(/(\/index)?\.md$/, ''))),
    ),
  ]
  return pages
    .filter((page) =>
      page.prefix
        ? !listed.some((path) =>
            `${path}/`.startsWith(page.path.replace(/\*$/, '')),
          )
        : !listed.includes(trim(page.path)),
    )
    .map((page) => ({
      subject: page.path,
      details: JSON.stringify({ llms_txt: llms.url }),
    }))
    .sort((a, b) => a.subject.localeCompare(b.subject))
}
