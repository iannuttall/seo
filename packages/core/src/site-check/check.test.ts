import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkBuiltSite } from './check.js'

const ORIGIN = 'https://example.com'

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

function page(input: {
  path: string
  title: string
  h1: string
  body: string
  faq?: Array<[string, string]>
}): string {
  const url = `${ORIGIN}${input.path}`
  const slug = input.path === '/' ? 'index' : input.path.slice(1)
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebPage', '@id': url, url, name: input.title },
      ...(input.faq
        ? [
            {
              '@type': 'FAQPage',
              '@id': `${url}#faq`,
              mainEntity: input.faq.map(([name, text]) => ({
                '@type': 'Question',
                name,
                acceptedAnswer: { '@type': 'Answer', text },
              })),
            },
          ]
        : []),
    ],
  }
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${input.title}</title>
<meta name="description" content="Opening times, facilities and the car park for ${input.h1}, with the source and the date each fact was checked.">
<link rel="canonical" href="${url}">
<link rel="alternate" type="text/markdown" href="${ORIGIN}/${slug}.md">
<meta property="og:title" content="${input.title}"><meta property="og:description" content="Facts about ${input.h1}.">
<meta property="og:image" content="${ORIGIN}/og/${slug}.png"><meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify(graph)}</script>
</head><body><main><h1>${input.h1}</h1>${input.body}</main></body></html>`
}

const FACTS =
  '<section data-facts="Facts"><p>Size 12 hectares.</p><p>Source: <a data-source href="https://example.org/parks.csv">Parks register</a>, checked <time data-checked datetime="2026-10-01">1 October 2026</time>.</p></section>'

function goodSite(): Map<string, string | Uint8Array> {
  const files = new Map<string, string | Uint8Array>([
    [
      'index.html',
      page({
        path: '/',
        title: 'Parks in the example register',
        h1: 'Parks in the example register',
        body: '<p>Two parks are listed: <a href="/parks/alder">Alder Common</a> and <a href="/parks/beacon">Beacon Gardens</a>.</p>',
      }),
    ],
    [
      'parks/alder.html',
      page({
        path: '/parks/alder',
        title: 'Alder Common, Northvale',
        h1: 'Alder Common',
        body: `<p>Alder Common is the larger park. See <a href="/parks/beacon">Beacon Gardens</a>.</p>${FACTS}<h2>Visiting</h2><h3>Are dogs allowed?</h3><p>Yes, dogs are welcome.</p>`,
        faq: [['Are dogs allowed?', 'Yes, dogs are welcome.']],
      }),
    ],
    [
      'parks/beacon.html',
      page({
        path: '/parks/beacon',
        title: 'Beacon Gardens, Northvale',
        h1: 'Beacon Gardens',
        body: `<p>Beacon Gardens is the smaller park. See <a href="/parks/alder">Alder Common</a>.</p>${FACTS}`,
      }),
    ],
    [
      '404.html',
      '<!doctype html><html lang="en"><head><title>Page not found</title><meta name="robots" content="noindex"></head><body><main><h1>Page not found</h1><a href="/">Home</a></main></body></html>',
    ],
    [
      'robots.txt',
      `User-agent: *\nAllow: /\nContent-Signal: search=yes, ai-input=yes, ai-train=no\n\nSitemap: ${ORIGIN}/sitemap.xml\n`,
    ],
    [
      'sitemap.xml',
      `<?xml version="1.0"?><sitemapindex><sitemap><loc>${ORIGIN}/sitemap-pages-1.xml</loc></sitemap></sitemapindex>`,
    ],
    [
      'sitemap-pages-1.xml',
      `<?xml version="1.0"?><urlset>${['/', '/parks/alder', '/parks/beacon'].map((path) => `<url><loc>${ORIGIN}${path}</loc></url>`).join('')}</urlset>`,
    ],
    ['llms.txt', `# Parks\n\n- [Alder Common](${ORIGIN}/parks/alder.md)\n`],
    ['_astro/site.css', 'body{color:#111}h1{letter-spacing:-0.02em}'],
  ])
  for (const slug of ['index', 'parks/alder', 'parks/beacon']) {
    files.set(`${slug}.md`, '# Page')
    files.set(`og/${slug}.png`, png(1200, 630))
  }
  return files
}

// The site's source. A link to #cafe and a colour in a comment or in the
// theme file are not raw colours in a page.
function goodSources(): Map<string, string> {
  return new Map([
    [
      'src/pages/index.astro',
      '---\n// Text is #111 on #fafafa in globals.css.\n---\n<a class="bg-muted text-foreground hover:text-primary" href="#cafe">Cafe</a>',
    ],
    ['src/styles/globals.css', ':root { --background: oklch(98.5% 0 0); }'],
    ['src/lib/og/card.ts', "const surface = '#fafafa'"],
  ])
}

function check(
  files: Map<string, string | Uint8Array>,
  sources = goodSources(),
) {
  return checkBuiltSite({
    origin: ORIGIN,
    files: [...files.keys()],
    readText: async (path) => String(files.get(path) ?? ''),
    readBytes: async (path) => files.get(path) as Uint8Array,
    now: new Date('2026-11-03T00:00:00Z'),
    sources: {
      files: [...sources.keys()],
      readText: async (path) => sources.get(path) ?? '',
    },
  })
}

test('a complete static build passes the site check', async () => {
  const result = await check(goodSite())
  assert.deepEqual(
    result.issues.map((issue) => `${issue.rule} ${issue.file} ${issue.found}`),
    [],
  )
  assert.equal(result.status, 'passed')
  assert.equal(result.pagesChecked, 4)
})

test('a build with broken pages, copy, design and data fails on each rule', async () => {
  const files = goodSite()
  const beacon = String(files.get('parks/beacon.html'))
    .replace(
      'is the smaller park.',
      'is the smaller park \u2014 seamless; coming soon. See <a href="/parks/gone">Gone</a>.',
    )
    .replace('datetime="2026-10-01"', 'datetime="2027-01-01"')
    .replace(
      '</main>',
      '<div style="box-shadow:0 1px 2px #000;grid-template-columns:repeat(3,1fr)">x</div><img src="/x.png"></main>',
    )
  files.set('parks/beacon.html', beacon)
  const alder = String(files.get('parks/alder.html')).replace(
    '<p>Yes, dogs are welcome.</p>',
    '<p>Only on a lead.</p>',
  )
  files.set('parks/alder.html', alder)
  files.delete('og/index.png')
  files.delete('parks/beacon.md')
  files.set(
    'sitemap-pages-1.xml',
    `<urlset><url><loc>${ORIGIN}/</loc></url><url><loc>${ORIGIN}/parks/alder</loc></url><url><loc>${ORIGIN}/old</loc></url></urlset>`,
  )
  files.set('_astro/site.css', '.label{text-transform:uppercase}')
  const sources = goodSources()
  sources.set(
    'src/components/Badge.astro',
    '<span class="bg-[#fafafa] dark:text-blue-600">New</span>\n<style>span { color: rgb(0 0 0); }</style>',
  )

  const result = await check(files, sources)
  const found = result.issues.map((issue) => `${issue.rule} ${issue.file}`)
  assert.deepEqual(found.sort(), [
    'broken_link parks/beacon.html',
    'broken_link parks/beacon.html',
    'copy_coming_soon parks/beacon.html',
    'copy_dash parks/beacon.html',
    'copy_puffery parks/beacon.html',
    'copy_semicolon parks/beacon.html',
    'data_checked_invalid parks/beacon.html',
    'design_raw_colour src/components/Badge.astro',
    'design_shadow parks/beacon.html',
    'design_style_block src/components/Badge.astro',
    'design_uppercase _astro/site.css',
    'design_wide_grid parks/beacon.html',
    'faq_schema_mismatch parks/alder.html',
    'image_missing_alt parks/beacon.html',
    'markdown_copy_missing parks/beacon.html',
    'og_image_file_missing index.html',
    'sitemap_extra_url sitemap.xml',
    'sitemap_page_missing parks/beacon.html',
  ])
  assert.equal(result.status, 'failed')
  assert.equal(result.failures, found.length)
})
