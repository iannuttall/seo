// A generated test site for measuring the crawler, with known problems at
// known rates. Run: node scripts/fixture.mjs [port]. Pages are /p/0 to
// /p/(PAGES-1); PAGES and LATENCY_MS come from the environment.
//
// POST /__week/2 switches to "next week": some broken links are fixed and
// new ones appear. GET /__stats reports requests and the most requests seen
// in flight at once and in any one second. POST /__inspect stands in for
// Google's URL Inspection API.

import { createServer } from 'node:http'

const port = Number(process.argv[2] ?? 8788)
let pages = Number(process.env.PAGES ?? 500)
const latency = Number(process.env.LATENCY_MS ?? 80)
// Every THROTTLE_EVERY-th page request gets a 429 once. 0 turns it off.
let throttleEvery = Number(process.env.THROTTLE_EVERY ?? 0)
let crawlDelay = 0
let week = 1
let stats = fresh()

function fresh() {
  return {
    requests: 0,
    pages: 0,
    inspections: 0,
    inFlight: 0,
    maxInFlight: 0,
    perSecond: new Map(),
    throttled: 0,
    userAgents: new Set(),
  }
}

const every = (i, n) => i > 0 && i % n === 0
const filler = (i, words) =>
  Array.from(
    { length: words },
    (_, k) =>
      [
        'audit',
        'search',
        'page',
        'crawl',
        'index',
        'link',
        'title',
        'site',
        'content',
        'guide',
      ][(i * 7 + k * 3) % 10],
  ).join(' ')

function page(i) {
  const thin = every(i, 41)
  const title = every(i, 97)
    ? 'Duplicate title'
    : week === 2 && every(i, 101)
      ? `Page ${i} (updated)`
      : `Page ${i}`
  const head = [
    `<title>${every(i, 113) ? '' : title}</title>`,
    every(i, 53) ? '' : `<meta name="description" content="About page ${i}.">`,
    every(i, 89) ? '<meta name="robots" content="noindex">' : '',
    every(i, 71)
      ? `<link rel="canonical" href="/p/${i - 1}">`
      : `<link rel="canonical" href="/p/${i}">`,
  ].join('')
  // A nav of 40 links, like a real site's header and footer.
  const nav = Array.from(
    { length: 40 },
    (_, k) => `<a href="/p/${(k * 37) % pages}">Section ${k}</a>`,
  ).join(' ')
  const body = []
  for (let k = 1; k <= 20; k += 1) {
    const to = (i * 31 + k * 17) % pages
    body.push(
      `<p>${filler(i + k, thin ? 2 : 40)} <a href="/p/${to}">read page ${to}</a></p>`,
    )
  }
  if (every(i, 67)) body.push(`<p><a href="/old/${i}">an old link</a></p>`)
  if (every(i, 79) && !(week === 2 && every(i, 158)))
    body.push(`<p><a href="/missing/${i}">a broken link</a></p>`)
  if (week === 2 && every(i, 83))
    body.push(`<p><a href="/gone/${i}">a new broken link</a></p>`)
  if (every(i, 59)) body.push('<p><a href="/private/area">members</a></p>')
  if (every(i, 43))
    body.push('<p><a href="https://www.example.org/">elsewhere</a></p>')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">${head}<style>${'.x{color:red}'.repeat(400)}</style></head><body><nav>${nav}</nav>${every(i, 61) ? '' : `<h1>${title}</h1>`}<main>${body.join('\n')}</main><script>${'var a=1;'.repeat(800)}</script></body></html>`
}

function sitemap(part) {
  const from = part * 1000
  const to = Math.min(from + 1000, pages + 5)
  const urls = []
  // Five sitemap URLs past the end of the site: they 404.
  for (let i = from; i < to; i += 1)
    if (!every(i, 151))
      urls.push(`<url><loc>http://127.0.0.1:${port}/p/${i}</loc></url>`)
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`
}

function inspection(url) {
  const i = Number(new URL(url).pathname.split('/').pop())
  const result = every(i, 89)
    ? {
        verdict: 'NEUTRAL',
        coverageState: "Excluded by 'noindex' tag",
        indexingState: 'BLOCKED_BY_META_TAG',
      }
    : every(i, 71)
      ? {
          verdict: 'NEUTRAL',
          coverageState:
            'Duplicate, Google chose different canonical than user',
          googleCanonical: url.replace(/\d+$/, String(i - 1)),
        }
      : every(i, 13) || (week === 2 && every(i, 29))
        ? {
            verdict: 'NEUTRAL',
            coverageState: 'Crawled - currently not indexed',
          }
        : {
            verdict: 'PASS',
            coverageState: 'Submitted and indexed',
            indexingState: 'INDEXING_ALLOWED',
          }
  return {
    inspectionResult: {
      inspectionResultLink: 'https://search.google.com/',
      indexStatusResult: {
        robotsTxtState: 'ALLOWED',
        lastCrawlTime: '2026-10-01T00:00:00Z',
        ...result,
      },
    },
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`)
  const send = (status, type, body, headers = {}) => {
    res.writeHead(status, { 'content-type': type, ...headers })
    res.end(body)
  }
  if (url.pathname === '/__stats') {
    const { perSecond, userAgents, ...rest } = stats
    return send(
      200,
      'application/json',
      JSON.stringify({
        ...rest,
        maxPerSecond: Math.max(0, ...perSecond.values()),
        userAgents: [...userAgents],
      }),
    )
  }
  if (url.pathname === '/__reset') {
    stats = fresh()
    if (url.searchParams.get('pages'))
      pages = Number(url.searchParams.get('pages'))
    week = Number(url.searchParams.get('week') ?? 1)
    throttleEvery = Number(url.searchParams.get('throttle') ?? 0)
    crawlDelay = Number(url.searchParams.get('delay') ?? 0)
    return send(200, 'text/plain', 'ok')
  }
  if (url.pathname.startsWith('/__week/')) {
    week = Number(url.pathname.split('/').pop())
    return send(200, 'text/plain', 'ok')
  }
  if (url.pathname === '/__inspect') {
    let body = ''
    for await (const chunk of req) body += chunk
    stats.inspections += 1
    await new Promise((r) => setTimeout(r, 150))
    return send(
      200,
      'application/json',
      JSON.stringify(inspection(JSON.parse(body).inspectionUrl)),
    )
  }

  stats.requests += 1
  stats.userAgents.add(req.headers['user-agent'])
  const second = Math.floor(Date.now() / 1000)
  stats.perSecond.set(second, (stats.perSecond.get(second) ?? 0) + 1)
  stats.inFlight += 1
  stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight)
  try {
    const i = Number(url.pathname.split('/').pop())
    await new Promise((r) => setTimeout(r, latency + ((i * 13) % latency || 0)))
    if (url.pathname === '/robots.txt')
      return send(
        200,
        'text/plain',
        `User-agent: *\nDisallow: /private/\n${crawlDelay ? `Crawl-delay: ${crawlDelay}\n` : ''}\nSitemap: http://127.0.0.1:${port}/sitemap.xml\n`,
      )
    if (url.pathname === '/sitemap.xml') {
      const parts = Math.ceil((pages + 5) / 1000)
      const list = Array.from(
        { length: parts },
        (_, k) =>
          `<sitemap><loc>http://127.0.0.1:${port}/sitemap-${k}.xml</loc></sitemap>`,
      ).join('')
      return send(
        200,
        'application/xml',
        `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${list}</sitemapindex>`,
      )
    }
    if (url.pathname.startsWith('/sitemap-'))
      return send(
        200,
        'application/xml',
        sitemap(Number(url.pathname.match(/\d+/)[0])),
      )
    if (url.pathname === '/')
      return send(301, 'text/plain', '', { location: '/p/0' })
    if (url.pathname.startsWith('/old/'))
      return send(301, 'text/plain', '', { location: `/p/${i}` })
    if (url.pathname.startsWith('/p/') && i >= 0 && i < pages) {
      stats.pages += 1
      if (throttleEvery && stats.pages % throttleEvery === 0) {
        stats.throttled += 1
        return send(429, 'text/plain', 'slow down', { 'retry-after': '2' })
      }
      return send(200, 'text/html; charset=utf-8', page(i))
    }
    return send(404, 'text/html', '<title>Not found</title>')
  } finally {
    stats.inFlight -= 1
  }
})
server.listen(port, '127.0.0.1', () =>
  console.log(`fixture on ${port}, ${pages} pages`),
)
