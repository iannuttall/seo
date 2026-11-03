import { type CheerioAPI, load } from 'cheerio'
import { auditCrawlPages } from '../analyze/crawler/audit.js'
import { snapshotFetchedPage } from '../analyze/monitoring/crawl-page.js'
import type { CrawlPageSnapshot } from '../analyze/monitoring/types.js'
import type { PageFetchResult } from '../types.js'
import {
  CRAWLER_RULES,
  copyViolations,
  designViolations,
  metadataText,
  ruleFor,
  type SiteCheckGroup,
  type SiteCheckLevel,
  themeViolations,
  visibleTextBlocks,
} from './rules.js'

export const SITE_CHECK_MAX_PAGES = 10_000
export const SITE_CHECK_MAX_ISSUES = 1_000
export const SITEMAP_FILE_URL_LIMIT = 5_000

export type BuiltSite = {
  // The production origin, such as https://example.com.
  origin: string
  // Every file in the build folder, as paths relative to it with `/`.
  files: readonly string[]
  readText: (path: string) => Promise<string>
  readBytes: (path: string) => Promise<Uint8Array>
  // Words the copy rules allow on this site, such as a brand name.
  allowWords?: readonly string[]
  // The site's source pages, components and layouts, for the theme rules.
  // Paths are relative to the site folder, such as src/pages/index.astro.
  sources?: {
    files: readonly string[]
    readText: (path: string) => Promise<string>
  }
  now?: Date
}

export type SiteCheckIssue = {
  rule: string
  group: SiteCheckGroup
  level: SiteCheckLevel
  file: string
  found: string
  fix: string
}

export type SiteCheckResult = {
  status: 'passed' | 'failed' | 'partial'
  origin: string
  pagesFound: number
  pagesChecked: number
  failures: number
  warnings: number
  rules: Array<{
    rule: string
    group: SiteCheckGroup
    level: SiteCheckLevel
    count: number
    fix: string
  }>
  issues: SiteCheckIssue[]
  issuesOmitted: number
}

// The source files that must take every colour and style from the theme.
const THEME_SOURCE =
  /^src\/(?:pages|components|layouts)\/.+\.(?:astro|tsx?|jsx?|mdx?|html)$/

type PageFacts = {
  file: string
  path: string
  snapshot: CrawlPageSnapshot
  links: string[]
}

const FETCH_DIAGNOSTICS: PageFetchResult['diagnostics'] = {
  source: 'network',
  cache: 'bypass',
  fetched: true,
  rendered: false,
  blocked: false,
  durationMs: 0,
  retries: 0,
  rateLimit: { host: 'build', concurrency: 1, intervalCap: 1, intervalMs: 0 },
}

// The URL path a built file serves on Workers static assets with
// html_handling drop-trailing-slash: `index.html` is `/`, `a/b.html` and
// `a/b/index.html` are `/a/b`.
export function builtPagePath(file: string): string {
  const path = `/${file}`.replace(/(?:\/index)?\.html$/, '')
  return path || '/'
}

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const squash = (text: string) => text.replace(/\s+/g, ' ').trim()

export async function checkBuiltSite(
  site: BuiltSite,
): Promise<SiteCheckResult> {
  const origin = new URL(site.origin).origin
  const files = [...site.files].sort(byText)
  const fileSet = new Set(files)
  const allowWords = site.allowWords ?? []
  const now = site.now ?? new Date()
  const issues: SiteCheckIssue[] = []
  const add = (rule: string, file: string, found: string) => {
    const { group, level, fix } = ruleFor(rule)
    issues.push({ rule, group, level, file, found, fix })
  }

  const htmlFiles = files.filter((file) => file.endsWith('.html'))
  const checkedFiles = htmlFiles.slice(0, SITE_CHECK_MAX_PAGES)
  const pagePaths = new Set(checkedFiles.map(builtPagePath))
  const pages: PageFacts[] = []
  const seenCss = new Set<string>()
  const checkCss = (css: string, file: string) => {
    if (!css.trim() || seenCss.has(css)) return
    seenCss.add(css)
    for (const { rule, found } of designViolations(css)) {
      add(rule, file, found.join(', '))
    }
  }

  if (!fileSet.has('404.html')) add('not_found_page_missing', '404.html', '')

  for (const file of checkedFiles) {
    const html = await site.readText(file)
    const path = builtPagePath(file)
    const url = new URL(path, origin).toString()
    const notFound = file === '404.html'
    const fetched: PageFetchResult = {
      url,
      finalUrl: url,
      status: notFound ? 404 : 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      html,
      usedJs: false,
      diagnostics: FETCH_DIAGNOSTICS,
      warnings: [],
    }
    const snapshot = (await snapshotFetchedPage(url, fetched)).page
    if (!snapshot) continue
    const $ = load(html)
    const links = internalLinks($, url, origin)
    pages.push({ file, path, snapshot, links })

    $('style').each((_i, element) => checkCss($(element).text(), file))
    const inline = $('[style]')
      .map((_i, element) => $(element).attr('style'))
      .get()
      .join(';')
    checkCss(inline, file)

    for (const href of links) {
      if (!resolvesInBuild(href, pagePaths, fileSet)) {
        add('broken_link', file, href)
      }
    }
    if (notFound) continue

    checkPageBasics($, file, add)
    checkCopy($, file, allowWords, add)
    checkFacts($, file, now, add)
    await checkPageFiles($, snapshot, file, origin, site, fileSet, add)
  }

  for (const file of files.filter((name) => name.endsWith('.css'))) {
    checkCss(await site.readText(file), file)
  }

  if (site.sources) {
    const sourceFiles = site.sources.files
      .filter((file) => THEME_SOURCE.test(file))
      .sort(byText)
      .slice(0, SITE_CHECK_MAX_PAGES)
    for (const file of sourceFiles) {
      const source = await site.sources.readText(file)
      for (const { rule, found } of themeViolations(source)) {
        add(rule, file, found.join(', '))
      }
    }
  }

  linkGraph(pages)
  const fileByUrl = new Map(pages.map((page) => [page.snapshot.url, page.file]))
  for (const issue of auditCrawlPages(
    pages.map((page) => page.snapshot),
    { startUrl: `${origin}/` },
  )) {
    if (!(issue.ruleId in CRAWLER_RULES)) continue
    add(issue.ruleId, fileByUrl.get(issue.url) ?? issue.url, issue.detail ?? '')
  }

  const indexable = pages.filter(
    (page) => page.snapshot.status === 200 && page.snapshot.indexable,
  )
  await checkRobotsAndSitemaps(site, fileSet, origin, indexable, add)
  await checkLlmsTxt(site, fileSet, origin, pagePaths, add)

  return summarize({
    origin,
    issues,
    pagesFound: htmlFiles.length,
    pagesChecked: checkedFiles.length,
  })
}

function internalLinks($: CheerioAPI, url: string, origin: string): string[] {
  const links = new Set<string>()
  $('a[href], link[rel="alternate"][href]').each((_i, element) => {
    const href = $(element).attr('href') ?? ''
    try {
      const target = new URL(href, url)
      if (target.origin !== origin) return
      links.add(decodeURI(target.pathname))
    } catch {
      links.add(href)
    }
  })
  return [...links].sort(byText)
}

function resolvesInBuild(
  path: string,
  pagePaths: Set<string>,
  files: Set<string>,
): boolean {
  if (pagePaths.has(path)) return true
  return files.has(path.replace(/^\//, ''))
}

type Add = (rule: string, file: string, found: string) => void

function checkPageBasics($: CheerioAPI, file: string, add: Add): void {
  const h1Count = $('h1').length
  if (h1Count !== 1) add('one_h1', file, `${h1Count} H1 elements`)
  const title = squash($('title').first().text())
  if (title && (title.length < 10 || title.length > 65)) {
    add('title_length', file, `${title.length} characters: ${title}`)
  }
  const description = squash(
    $('meta[name="description"]').first().attr('content') ?? '',
  )
  if (description && (description.length < 50 || description.length > 170)) {
    add('description_length', file, `${description.length} characters`)
  }
  let previous = 0
  for (const element of $(
    'main h1, main h2, main h3, main h4, main h5, main h6',
  ).toArray()) {
    const level = Number(element.tagName.slice(1))
    if (previous && level > previous + 1) {
      add('heading_order', file, `H${previous} to H${level}`)
      break
    }
    previous = level
  }
  $('h1, h2, h3, h4, h5, h6, nav a, button, label, th').each((_i, element) => {
    const text = squash($(element).text())
    const letters = text.replace(/[^a-z]/gi, '')
    if (letters.length >= 8 && letters === letters.toUpperCase()) {
      add('design_uppercase', file, text.slice(0, 80))
    }
  })
}

function checkCopy(
  $: CheerioAPI,
  file: string,
  allowWords: readonly string[],
  add: Add,
): void {
  const found = new Map<string, Set<string>>()
  for (const text of [...metadataText($), ...visibleTextBlocks($)]) {
    for (const violation of copyViolations(text, allowWords)) {
      const seen = found.get(violation.rule) ?? new Set<string>()
      for (const word of violation.found) seen.add(word)
      found.set(violation.rule, seen)
    }
  }
  for (const [rule, words] of found) {
    add(rule, file, [...words].slice(0, 5).join(', '))
  }
}

// A fact block is any element with data-facts. It names its source with a
// link marked data-source and the date it was checked with
// <time data-checked datetime="YYYY-MM-DD">.
function checkFacts($: CheerioAPI, file: string, now: Date, add: Add): void {
  $('[data-facts]').each((index, element) => {
    const block = $(element)
    const label = block.attr('data-facts') || `fact block ${index + 1}`
    const source = block.find('a[data-source][href]').first().attr('href')
    if (!source) add('data_source_missing', file, label)
    const checked = block.find('time[data-checked]').first()
    if (!checked.length) {
      add('data_checked_missing', file, label)
      return
    }
    const datetime = checked.attr('datetime') ?? ''
    const date = new Date(datetime)
    if (
      !/^\d{4}-\d{2}-\d{2}/.test(datetime) ||
      Number.isNaN(date.getTime()) ||
      date.getTime() > now.getTime()
    ) {
      add('data_checked_invalid', file, `${label}: ${datetime || 'no date'}`)
    }
  })
}

async function checkPageFiles(
  $: CheerioAPI,
  snapshot: CrawlPageSnapshot,
  file: string,
  origin: string,
  site: BuiltSite,
  files: Set<string>,
  add: Add,
): Promise<void> {
  const image = snapshot.openGraphImage
  if (image) {
    const target = sameOriginFile(image, origin)
    if (target !== undefined && !files.has(target)) {
      add('og_image_file_missing', file, image)
    } else if (target?.endsWith('.png')) {
      const size = pngSize(await site.readBytes(target))
      if (size && (size.width !== 1200 || size.height !== 630)) {
        add('og_image_size', file, `${size.width} by ${size.height}`)
      }
    }
  }
  if (!snapshot.indexable) return
  const markdown = $('link[rel~="alternate"][type="text/markdown"]')
    .first()
    .attr('href')
  const markdownFile = markdown ? sameOriginFile(markdown, origin, file) : ''
  if (!markdownFile || !files.has(markdownFile)) {
    add('markdown_copy_missing', file, markdown ?? 'no alternate link')
  }
  checkFaqSchema($, file, add)
}

function sameOriginFile(
  href: string,
  origin: string,
  from = '',
): string | undefined {
  try {
    const url = new URL(href, new URL(`/${from}`, origin))
    if (url.origin !== origin) return undefined
    return decodeURI(url.pathname).replace(/^\//, '')
  } catch {
    return ''
  }
}

function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

// FAQ markup must repeat the questions and answers the page shows.
function checkFaqSchema($: CheerioAPI, file: string, add: Add): void {
  const visible = squash(visibleTextBlocks($).join(' '))
  const faqs: Array<{ name?: unknown; acceptedAnswer?: { text?: unknown } }> =
    []
  $('script[type="application/ld+json"]').each((_i, element) => {
    try {
      const data = JSON.parse($(element).text()) as Record<string, unknown>
      const graph = Array.isArray(data['@graph']) ? data['@graph'] : [data]
      for (const entity of graph as Array<Record<string, unknown>>) {
        const type = entity['@type']
        const types = Array.isArray(type) ? type : [type]
        if (!types.includes('FAQPage')) continue
        const questions = entity.mainEntity
        if (Array.isArray(questions)) faqs.push(...questions)
      }
    } catch {
      // The crawler rule reports JSON-LD that does not parse.
    }
  })
  for (const faq of faqs) {
    const question = squash(String(faq.name ?? ''))
    const answer = squash(
      load(`<p>${String(faq.acceptedAnswer?.text ?? '')}</p>`)('p').text(),
    )
    if (!question || !visible.includes(question)) {
      add('faq_schema_mismatch', file, `Question not on the page: ${question}`)
    } else if (!answer || !visible.includes(answer)) {
      add('faq_schema_mismatch', file, `Answer not on the page: ${question}`)
    }
  }
}

// Inlinks and click depth from the home page, as the crawler counts them.
function linkGraph(pages: PageFacts[]): void {
  const byPath = new Map(pages.map((page) => [page.path, page]))
  const inlinks = new Map<string, number>()
  for (const page of pages) {
    if (page.snapshot.status !== 200) continue
    for (const link of page.links) {
      if (link !== page.path && byPath.has(link)) {
        inlinks.set(link, (inlinks.get(link) ?? 0) + 1)
      }
    }
  }
  const depth = new Map<string, number>([['/', 0]])
  const queue = ['/']
  for (let at = 0; at < queue.length; at += 1) {
    const path = queue[at] as string
    for (const link of byPath.get(path)?.links ?? []) {
      if (depth.has(link) || !byPath.has(link)) continue
      depth.set(link, (depth.get(path) ?? 0) + 1)
      queue.push(link)
    }
  }
  for (const page of pages) {
    page.snapshot.internalInlinkCount = inlinks.get(page.path) ?? 0
    page.snapshot.crawlDepth = depth.get(page.path)
  }
}

async function checkRobotsAndSitemaps(
  site: BuiltSite,
  files: Set<string>,
  origin: string,
  indexable: PageFacts[],
  add: Add,
): Promise<void> {
  let sitemapRoots = ['sitemap.xml']
  if (!files.has('robots.txt')) {
    add('robots_missing', 'robots.txt', '')
  } else {
    const robots = await site.readText('robots.txt')
    if (robotsBlocksSite(robots)) add('robots_blocks_site', 'robots.txt', '')
    if (!/^content-signal\s*:/im.test(robots)) {
      add('robots_content_signal_missing', 'robots.txt', '')
    }
    const listed = [...robots.matchAll(/^sitemap\s*:\s*(\S+)/gim)].map(
      (match) => match[1] as string,
    )
    if (!listed.length) add('robots_sitemap_missing', 'robots.txt', '')
    const local = listed
      .map((href) => sameOriginFile(href, origin))
      .filter((path): path is string => Boolean(path))
    if (local.length) sitemapRoots = local
  }

  const listedUrls = new Set<string>()
  const queue = sitemapRoots.filter((root) => {
    if (files.has(root)) return true
    add('sitemap_missing', root, '')
    return false
  })
  const read = new Set<string>()
  for (let at = 0; at < queue.length && at < 1_000; at += 1) {
    const file = queue[at] as string
    if (read.has(file)) continue
    read.add(file)
    const xml = await site.readText(file)
    const locs = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((match) =>
      (match[1] as string).replace(/&amp;/g, '&'),
    )
    if (/<sitemapindex\b/.test(xml)) {
      for (const loc of locs) {
        const child = sameOriginFile(loc, origin)
        if (child && files.has(child)) queue.push(child)
        else add('sitemap_missing', file, loc)
      }
      continue
    }
    if (locs.length > SITEMAP_FILE_URL_LIMIT) {
      add('sitemap_file_too_large', file, `${locs.length} URLs`)
    }
    for (const loc of locs) listedUrls.add(loc)
  }

  const indexableUrls = new Set(indexable.map((page) => page.snapshot.url))
  for (const page of indexable) {
    if (!listedUrls.has(page.snapshot.url)) {
      add('sitemap_page_missing', page.file, page.snapshot.url)
    }
  }
  for (const url of [...listedUrls].sort(byText)) {
    if (!indexableUrls.has(url)) add('sitemap_extra_url', 'sitemap.xml', url)
  }
}

function robotsBlocksSite(robots: string): boolean {
  let everyone = false
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim()
    const agent = /^user-agent\s*:\s*(.+)$/i.exec(line)
    if (agent) everyone = agent[1]?.trim() === '*'
    else if (everyone && /^disallow\s*:\s*\/\s*$/i.test(line)) return true
  }
  return false
}

async function checkLlmsTxt(
  site: BuiltSite,
  files: Set<string>,
  origin: string,
  pagePaths: Set<string>,
  add: Add,
): Promise<void> {
  if (!files.has('llms.txt')) {
    add('llms_txt_missing', 'llms.txt', '')
    return
  }
  const text = await site.readText('llms.txt')
  for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const path = sameOriginFile(match[1] as string, origin)
    if (path === undefined) continue
    if (!resolvesInBuild(`/${path}`, pagePaths, files)) {
      add('llms_txt_broken_link', 'llms.txt', match[1] as string)
    }
  }
}

function summarize(input: {
  origin: string
  issues: SiteCheckIssue[]
  pagesFound: number
  pagesChecked: number
}): SiteCheckResult {
  const issues = [...input.issues].sort(
    (a, b) =>
      (a.level === b.level ? 0 : a.level === 'fail' ? -1 : 1) ||
      byText(a.group, b.group) ||
      byText(a.rule, b.rule) ||
      byText(a.file, b.file) ||
      byText(a.found, b.found),
  )
  const counts = new Map<string, number>()
  for (const issue of issues) {
    counts.set(issue.rule, (counts.get(issue.rule) ?? 0) + 1)
  }
  const rules = [...counts]
    .map(([rule, count]) => ({ rule, count, ...ruleFor(rule) }))
    .sort(
      (a, b) =>
        (a.level === b.level ? 0 : a.level === 'fail' ? -1 : 1) ||
        b.count - a.count ||
        byText(a.rule, b.rule),
    )
  const failures = issues.filter((issue) => issue.level === 'fail').length
  const capped = input.pagesChecked < input.pagesFound
  return {
    status: failures ? 'failed' : capped ? 'partial' : 'passed',
    origin: input.origin,
    pagesFound: input.pagesFound,
    pagesChecked: input.pagesChecked,
    failures,
    warnings: issues.length - failures,
    rules,
    issues: issues.slice(0, SITE_CHECK_MAX_ISSUES),
    issuesOmitted: Math.max(0, issues.length - SITE_CHECK_MAX_ISSUES),
  }
}
