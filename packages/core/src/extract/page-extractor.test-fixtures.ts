export interface ExtractionFixture {
  name: string
  url: string
  html: string
  includes: string[]
  excludes: string[]
  minimumWords: number
}

export const extractionFixtures: ExtractionFixture[] = [
  {
    name: 'wordpress article',
    url: 'https://example.com/guides/technical-seo/',
    html: `<!doctype html><html lang="en"><head>
      <title>Technical SEO Guide</title>
      <link rel="canonical" href="/guides/technical-seo/">
    </head><body class="single-post">
      <header><nav><a href="/">Home navigation</a></nav></header>
      <main><article class="post type-post"><h1>Technical SEO Guide</h1>
        <div class="entry-content">
          <p>Technical SEO helps search engines discover, render, index, and understand important pages without wasting crawl resources.</p>
          <p>Start with response codes, robots directives, canonical signals, internal links, structured data, and rendered page content.</p>
        </div>
      </article><aside class="sidebar">Unrelated popular posts</aside></main>
      <footer>Newsletter and legal navigation</footer>
    </body></html>`,
    includes: ['Technical SEO helps search engines', 'canonical signals'],
    excludes: ['Unrelated popular posts', 'Newsletter and legal navigation'],
    minimumWords: 25,
  },
  {
    name: 'shopify product',
    url: 'https://shop.example.com/products/field-notebook',
    html: `<!doctype html><html lang="en"><head>
      <title>Field Notebook</title><meta property="og:type" content="product">
      <link rel="canonical" href="/products/field-notebook">
    </head><body>
      <header><nav><a href="/collections/all">Shop navigation</a></nav></header>
      <main id="MainContent"><section class="product"><h1>Field Notebook</h1>
        <div class="product__description rte">
          <p>A weather-resistant field notebook made for survey notes, site sketches, measurements, and durable project records.</p>
          <p>The stitched binding opens flat, while numbered pages and a contents index keep observations easy to retrieve.</p>
        </div><form><button>Add to cart</button></form>
      </section><section class="recommendations">Customers also bought unrelated pens</section></main>
      <footer>Returns and privacy links</footer>
    </body></html>`,
    includes: ['weather-resistant field notebook', 'stitched binding'],
    excludes: ['Shop navigation', 'Returns and privacy links'],
    minimumWords: 25,
  },
  {
    name: 'japanese article',
    url: 'https://example.jp/seo/technical/',
    html: `<!doctype html><html lang="ja"><head><title>技術的SEOガイド</title></head><body>
      <nav>サイトナビゲーション</nav><main><article><h1>技術的SEOガイド</h1>
        <p>技術的な検索最適化では、クロール、インデックス、正規化、内部リンク、表示速度を順番に確認します。</p>
        <p>問題の根拠を記録し、重要なページから修正して、変更後に同じ条件で再検証します。</p>
      </article></main><footer>購読案内</footer>
    </body></html>`,
    includes: ['クロール', '問題の根拠'],
    excludes: ['サイトナビゲーション', '購読案内'],
    minimumWords: 40,
  },
  {
    name: 'malformed article',
    url: 'https://example.com/broken-markup',
    html: `<!doctype html><html><head><title>Broken Markup</title></head><body>
      <nav>Discard this menu<main><article><h1>Recoverable article</h1>
      <p>This useful paragraph has malformed surrounding markup but still contains stable technical SEO evidence for extraction.
      <p>A second useful paragraph confirms that one broken closing tag does not erase the primary page content.
      <footer>Discard this footer`,
    includes: ['malformed surrounding markup', 'broken closing tag'],
    excludes: [],
    minimumWords: 25,
  },
]
