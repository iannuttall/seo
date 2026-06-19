import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PageFetchResult } from '../types.js'
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
  assert.equal(page.links[1]?.internal, false)
  assert.deepEqual(page.hreflang, [
    {
      hreflang: 'en-gb',
      href: 'https://example.com/gb/widget-guide',
    },
  ])
  assert.equal(page.imagesTotal, 5)
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
  assert.deepEqual(page.warnings, ['fixture warning'])
})
