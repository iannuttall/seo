import type { CrawlPageSnapshot } from '../monitoring/types.js'

export function crawlPage(
  input: Partial<CrawlPageSnapshot> = {},
): CrawlPageSnapshot {
  const url = input.url ?? 'https://example.com/page'
  const finalUrl = input.finalUrl ?? url
  const canonical = 'canonical' in input ? input.canonical : finalUrl
  return {
    status: 200,
    contentType: 'text/html',
    title: 'A useful page title for search teams',
    metaDescription:
      'A useful page description that explains the page value for search teams.',
    h1: 'Useful page',
    h1Count: 1,
    h2Count: 2,
    h3Count: 1,
    indexable: true,
    wordCount: 500,
    contentHash: 'hash',
    hasViewport: true,
    lang: 'en',
    imagesTotal: 1,
    imagesMissingAlt: 0,
    outgoingInternalCount: 1,
    schemaTypes: ['Article'],
    invalidJsonLdCount: 0,
    invalidJsonLdSamples: [],
    openGraphTitle: 'A useful page title for search teams',
    openGraphDescription:
      'A useful page description that explains the page value for sharing.',
    openGraphImage: 'https://example.com/share.jpg',
    twitterCard: 'summary',
    geo: {
      semanticHtml: true,
      structuredData: true,
      hasAuthor: true,
      hasDate: true,
      questionHeadings: 1,
      structuredBlocks: 1,
      answerable: true,
    },
    ...input,
    url,
    finalUrl,
    canonical,
  }
}
