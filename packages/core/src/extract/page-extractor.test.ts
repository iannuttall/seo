import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PageFetchResult } from '../types.js'
import { extractMainContent } from './main-content.js'
import { extractPage } from './page-extractor.js'

function fetchResult(html: string): PageFetchResult {
  return {
    url: 'https://example.com/articles/widget-guide',
    finalUrl: 'https://example.com/articles/widget-guide',
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'x-robots-tag': 'index, follow',
    },
    html,
    usedJs: false,
    diagnostics: {
      source: 'network',
      cache: 'miss',
      fetched: true,
      rendered: false,
      blocked: false,
      durationMs: 12,
      retries: 0,
      rateLimit: {
        host: 'example.com',
        concurrency: 8,
        intervalCap: 30,
        intervalMs: 1000,
      },
    },
    warnings: ['fixture warning'],
  }
}

test('extractPage parses SEO, link, media, schema, and GEO signals from HTML', async () => {
  const page = await extractPage(
    fetchResult(`<!doctype html>
      <html lang="en">
        <head>
          <title>Widget Guide</title>
          <meta name="description" content="A practical guide to choosing widgets.">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <meta name="author" content="Jane Editor">
          <meta property="og:title" content="Widget Guide OG">
          <meta property="og:description" content="Widget Guide OG description">
          <meta property="og:image" content="https://example.com/share.jpg">
          <meta property="article:published_time" content="2026-06-18T12:00:00Z">
          <meta name="twitter:card" content="summary_large_image">
          <link rel="canonical" href="/articles/widget-guide">
          <link rel="alternate" hreflang="en-gb" href="/gb/widget-guide">
          <script src="http://cdn.example/insecure.js"></script>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Article",
              "author": { "@type": "Person", "name": "Jane Editor" },
              "datePublished": "2026-06-18",
              "mainEntity": {
                "@type": "FAQPage",
                "mainEntity": []
              }
            }
          </script>
          <script type="application/ld+json">{ "@context": "https://schema.org"</script>
        </head>
        <body>
          <main>
            <article>
              <h1>How do you choose the right widget?</h1>
              <p>Choose the right widget by matching the job, budget, expected lifespan, maintenance limits, installation environment, replacement cost, warranty coverage, safety requirements, and user skill level before comparing brands or feature lists.</p>
              <h2>Widget checklist</h2>
              <ul><li>Size</li><li>Material</li></ul>
              <table><tr><td>Basic</td><td>Advanced</td></tr></table>
              <a href="/pricing">Pricing</a>
              <a href="https://other.example/review" rel="nofollow">External review</a>
              <img src="/ok.jpg" alt="Installed widget">
              <img src="/missing.jpg">
              <img src="/decorative.jpg" alt="">
              <img src="http://cdn.example/insecure.jpg" alt="Mixed content">
              <img src="/hero-2400x1200.jpg" width="2400" height="1200" alt="Large hero">
              <img src="/gallery.jpg" srcset="/gallery-800.jpg 800w, /gallery-2600.jpg 2600w" alt="Gallery">
            </article>
          </main>
        </body>
      </html>`),
    'readability',
  )

  assert.equal(page.title, 'Widget Guide')
  assert.equal(page.metaDescription, 'A practical guide to choosing widgets.')
  assert.equal(page.canonical, '/articles/widget-guide')
  assert.equal(page.lang, 'en')
  assert.equal(page.hasViewport, true)
  assert.equal(page.xRobotsTag, 'index, follow')
  assert.deepEqual(
    page.headings.map((heading) => `${heading.level}:${heading.text}`),
    ['1:How do you choose the right widget?', '2:Widget checklist'],
  )
  assert.equal(page.links.length, 2)
  assert.equal(page.links[0]?.href, 'https://example.com/pricing')
  assert.equal(page.links[0]?.internal, true)
  assert.equal(page.links[0]?.location, 'main-content')
  assert.equal(page.links[1]?.internal, false)
  assert.deepEqual(page.hreflang, [
    {
      hreflang: 'en-gb',
      href: 'https://example.com/gb/widget-guide',
    },
  ])
  assert.equal(page.imagesTotal, 6)
  assert.equal(page.imagesMissingAlt, 1)
  assert.deepEqual(page.oversizedImageCandidates, [
    {
      src: 'https://example.com/hero-2400x1200.jpg',
      width: 2400,
      height: 1200,
      detectedFrom: 'width,filename',
    },
    {
      src: 'https://example.com/gallery.jpg',
      width: 2600,
      detectedFrom: 'srcset',
    },
  ])
  assert.deepEqual(page.mixedContentUrls.sort(), [
    'http://cdn.example/insecure.jpg',
    'http://cdn.example/insecure.js',
  ])
  assert.deepEqual(page.schemaTypes.sort(), ['Article', 'FAQPage', 'Person'])
  assert.equal(page.invalidJsonLdCount, 1)
  assert.match(page.invalidJsonLdSamples[0]?.snippet ?? '', /@context/)
  assert.equal(page.openGraph['og:title'], 'Widget Guide OG')
  assert.equal(page.openGraph['og:description'], 'Widget Guide OG description')
  assert.equal(page.openGraph['og:image'], 'https://example.com/share.jpg')
  assert.equal(page.twitter['twitter:card'], 'summary_large_image')
  assert.equal(page.author, 'Jane Editor')
  assert.equal(page.hasAuthor, true)
  assert.equal(page.hasDate, true)
  assert.equal(page.semanticHtml, true)
  assert.equal(page.questionHeadings, 1)
  assert.equal(page.listCount, 1)
  assert.equal(page.tableCount, 1)
  assert.equal(page.structuredBlocks, 2)
  assert.equal(page.answerable, true)
  assert.match(page.contentText, /Choose the right widget/)
  assert.deepEqual(page.contentExtraction, {
    requested: 'readability',
    used: 'readability',
    fallback: false,
    wordCountSource: 'local_cjk_aware',
    baseUrl: 'https://example.com/articles/widget-guide',
  })
  assert.deepEqual(page.warnings, ['fixture warning'])
})

test('extractPage combines effective Googlebot meta directives across the document', async () => {
  const result = fetchResult(`<!doctype html>
      <html>
        <head>
          <title>Robots fixture</title>
          <meta NAME="ROBOTS" content="index, follow">
          <meta name="robots" content="nofollow">
          <meta name="GoogleBot" content="NONE">
        </head>
        <body>
          <meta name="robots" content="index">
          <main><h1>Robots fixture</h1><p>Useful page content.</p></main>
        </body>
      </html>`)
  result.headers = { 'Content-Type': 'text/html', 'X-Robots-Tag': 'NONE' }
  const page = await extractPage(result, 'readability')

  assert.equal(page.metaRobots, 'index, follow, nofollow, NONE, index')
  assert.equal(page.xRobotsTag, 'NONE')
})

test('extractPage skips malformed links without discarding page evidence', async () => {
  const page = await extractPage(
    fetchResult(`<!doctype html><html><head>
      <title>Valid page evidence</title>
      <meta name="robots" content="noindex">
      <link rel="canonical" href="/valid-page">
    </head><body><main>
      <h1>Valid heading</h1>
      <a href="http://[::1">Malformed</a>
      <a href="/working">Working</a>
      <a href="mailto:editor@example.com">Email</a>
      <a href="javascript:void(0)">Script</a>
      <link rel="alternate" hreflang="fr" href="http://[::1">
      <link rel="alternate" hreflang="de" href="mailto:test@example.com">
      <link rel="alternate" hreflang="es" href="/es/working">
      <p>This useful paragraph remains available to the extractor.</p>
    </main></body></html>`),
    'readability',
  )

  assert.equal(page.title, 'Valid page evidence')
  assert.equal(page.metaRobots, 'noindex')
  assert.equal(page.canonical, '/valid-page')
  assert.deepEqual(
    page.links.map((link) => link.href),
    ['https://example.com/working'],
  )
  assert.deepEqual(page.hreflang, [
    { hreflang: 'es', href: 'https://example.com/es/working' },
  ])
  assert.match(page.warnings.join(' '), /Skipped 1 malformed link URL/)
  assert.match(page.warnings.join(' '), /Excluded 2 non-HTTP link URLs/)
  assert.match(
    page.warnings.join(' '),
    /Skipped 2 invalid or non-HTTP hreflang/,
  )
})

test('structured data preserves graph context and subject provenance', async () => {
  const page = await extractPage(
    fetchResult(`<!doctype html><html><head>
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@id": "/#page",
          "@type": "WebPage",
          "sameAs": ["/about", "mailto:wrong@example.com"],
          "@graph": [{"@id":"/#article","@type":"https://schema.org/Article"}]
        }
      </script>
    </head><body><main><h1>Graph fixture</h1></main></body></html>`),
    'readability',
  )

  assert.equal(page.jsonLd.length, 1)
  assert.equal((page.jsonLd[0] as Record<string, unknown>)['@type'], 'WebPage')
  assert.deepEqual(page.schemaTypes.sort(), ['Article', 'WebPage'])
  assert.deepEqual(page.structuredDataFormats, ['json-ld'])
  assert.deepEqual(page.schemaSameAsEvidence, [
    {
      url: 'https://example.com/about',
      block: 0,
      path: '$.sameAs[0]',
      subjectId: 'https://example.com/#page',
      subjectTypes: ['WebPage'],
    },
  ])
  assert.deepEqual(page.invalidSchemaSameAs, [
    {
      block: 0,
      path: '$.sameAs[1]',
      value: 'mailto:wrong@example.com',
    },
  ])
})

test('structured data ignores contextless and non-Schema.org type claims', async () => {
  const page = await extractPage(
    fetchResult(`<!doctype html><html><head>
      <script type="application/ld+json">{"@type":"Product"}</script>
      <script type="application/ld+json">{"@context":"https://example.org/vocab/","@type":"Article"}</script>
      <script type="application/ld+json">{"@type":"https://schema.org/Organization"}</script>
    </head><body><main><h1>Context fixture</h1></main></body></html>`),
    'readability',
  )

  assert.deepEqual(page.schemaTypes, ['Organization'])
  assert.deepEqual(page.structuredDataFormats, ['json-ld'])
  assert.deepEqual(
    page.unrecognizedJsonLdTypes?.map(({ value, reason }) => ({
      value,
      reason,
    })),
    [
      { value: 'Product', reason: 'missing-schema-context' },
      { value: 'Article', reason: 'unresolved-context' },
    ],
  )
  assert.match(page.warnings.join(' '), /Ignored 2 JSON-LD @type values/)
})

test('structured data keeps Google property checks separate from syntax', async () => {
  const page = await extractPage(
    fetchResult(`<!doctype html><html><head>
      <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"Product"}
      </script>
      <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"Article"}
      </script>
    </head><body><main><h1>Assessment fixture</h1></main></body></html>`),
    'readability',
  )

  assert.equal(page.invalidJsonLdCount, 0)
  assert.deepEqual(
    page.googleRichResults?.map(
      ({ schemaType, status, missingRequiredProperties }) => ({
        schemaType,
        status,
        missingRequiredProperties,
      }),
    ),
    [
      {
        schemaType: 'Product',
        status: 'missing-required-properties',
        missingRequiredProperties: [
          'name',
          'one of review, aggregateRating, or offers',
        ],
      },
      {
        schemaType: 'Article',
        status: 'no-required-properties',
        missingRequiredProperties: [],
      },
    ],
  )
})

test('structured data supports Microdata and RDFa without inventing trust fields', async () => {
  const page = await extractPage(
    fetchResult(`<!doctype html><html vocab="https://schema.org/"><head>
      <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"Article","author":null,"datePublished":""}
      </script>
    </head><body><main>
      <div class="author"></div>
      <time datetime="not-a-date"></time>
      <section itemscope itemtype="https://schema.org/Product">
        <span itemprop="author">Jane Editor</span>
        <meta itemprop="datePublished" content="2026-06-18">
      </section>
      <section typeof="Article"><span property="author">RDFa Editor</span></section>
    </main></body></html>`),
    'readability',
  )

  assert.deepEqual(page.schemaTypes.sort(), ['Article', 'Product'])
  assert.deepEqual(page.structuredDataFormats, ['json-ld', 'microdata', 'rdfa'])
  assert.deepEqual(
    page.googleRichResults?.map(({ format, schemaType, status }) => ({
      format,
      schemaType,
      status,
    })),
    [
      {
        format: 'json-ld',
        schemaType: 'Article',
        status: 'no-required-properties',
      },
      {
        format: 'microdata',
        schemaType: 'Product',
        status: 'not-assessed',
      },
      {
        format: 'rdfa',
        schemaType: 'Article',
        status: 'not-assessed',
      },
    ],
  )
  assert.equal(page.hasAuthor, true)
  assert.equal(page.hasDate, true)

  const empty = await extractPage(
    fetchResult(`<!doctype html><html><head>
      <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"Article","author":null,"datePublished":"2026-02-30"}
      </script>
    </head><body><main><div class="author"></div><time datetime="bad"></time></main></body></html>`),
    'readability',
  )
  assert.equal(empty.hasAuthor, false)
  assert.equal(empty.hasDate, false)
})

test('Defuddle receives the final URL and preserves its metadata and word count', async () => {
  const fetched = {
    ...fetchResult('<main><p>Original page body</p></main>'),
    url: 'https://example.com/old-location',
    finalUrl: 'https://example.com/new-location',
  }
  let receivedUrl: string | undefined
  let useAsync: boolean | undefined
  const page = await extractPage(fetched, 'defuddle', {
    parseDefuddle(_document, options) {
      receivedUrl = options.url
      useAsync = options.useAsync
      return {
        content: '<article><p>検索技術 alpha beta</p></article>',
        description: 'A parser-provided description.',
        wordCount: 6,
        extractorType: 'article',
      }
    },
  })

  assert.equal(receivedUrl, fetched.finalUrl)
  assert.equal(useAsync, false)
  assert.equal(page.contentText, '検索技術 alpha beta')
  assert.equal(page.excerpt, 'A parser-provided description.')
  assert.equal(page.wordCount, 6)
  assert.deepEqual(page.contentExtraction, {
    requested: 'defuddle',
    used: 'defuddle',
    fallback: false,
    wordCountSource: 'defuddle',
    baseUrl: fetched.finalUrl,
    extractorType: 'article',
  })
})

test('Defuddle failures use a fresh Readability document and disclose fallback', async () => {
  const fetched = fetchResult(`<!doctype html>
    <html><head><title>Fallback</title></head><body>
      <article><h1>Fallback article</h1><p>This content remains available after the primary extractor fails and is long enough for Readability to retain.</p></article>
    </body></html>`)
  const page = await extractPage(fetched, 'defuddle', {
    parseDefuddle() {
      throw new Error('fixture extractor failure')
    },
  })

  assert.match(page.contentText, /content remains available/)
  assert.deepEqual(page.contentExtraction, {
    requested: 'defuddle',
    used: 'readability',
    fallback: true,
    fallbackReason: 'defuddle_error',
    fallbackDetail: 'fixture extractor failure',
    wordCountSource: 'local_cjk_aware',
    baseUrl: fetched.finalUrl,
  })
  assert.deepEqual(page.warnings, [
    'fixture warning',
    'Defuddle extraction fell back to Readability: fixture extractor failure',
  ])
})

test('invalid Defuddle counts use local CJK-aware counting', () => {
  const content = extractMainContent(
    fetchResult(
      '<!doctype html><html><body><article><p>Original</p></article></body></html>',
    ),
    'defuddle',
    {
      parseDefuddle() {
        return {
          content: '<article><p>検索技術 alpha beta</p></article>',
          wordCount: Number.NaN,
        }
      },
    },
  )

  assert.equal(content.wordCount, 6)
  assert.equal(content.diagnostics.wordCountSource, 'local_cjk_aware')
})

test('empty Defuddle content falls back with explicit provenance', () => {
  const content = extractMainContent(
    fetchResult(`<!doctype html><html><body><article>
      <h1>Usable fallback</h1>
      <p>This readable page body remains available when Defuddle returns an empty result.</p>
    </article></body></html>`),
    'defuddle',
    {
      parseDefuddle() {
        return { content: '', wordCount: 0 }
      },
    },
  )

  assert.match(content.text, /page body remains available/)
  assert.equal(content.diagnostics.used, 'readability')
  assert.equal(content.diagnostics.fallbackReason, 'defuddle_empty')
  assert.deepEqual(content.warnings, [
    'Defuddle extraction fell back to Readability: Defuddle returned no main content',
  ])
})

test('Readability fallback word counts remain useful for CJK content', () => {
  const content = extractMainContent(
    fetchResult(
      '<!doctype html><html><body><article><p>検索技術 alpha beta</p></article></body></html>',
    ),
    'readability',
  )

  assert.equal(content.wordCount, 6)
  assert.equal(content.diagnostics.wordCountSource, 'local_cjk_aware')
})

test('classifies link placement for contextual-link evidence', async () => {
  const result = await extractPage(
    fetchResult(`<!doctype html><html><body>
      <header><nav><a href="/nav">Navigation</a></nav></header>
      <main><article><a href="/article">Article</a></article></main>
      <aside><a href="/other">Other</a></aside>
      <footer><a href="/footer">Footer</a></footer>
    </body></html>`),
    'readability',
  )

  assert.deepEqual(
    result.links.map((link) => link.location),
    ['navigation', 'main-content', 'other', 'footer'],
  )
})
