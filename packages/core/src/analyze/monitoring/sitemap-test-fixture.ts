import type { SitemapFetchResult } from './sitemaps.js'

export function completeSitemapResult(
  sitemapUrl: string,
  urls: string[] = [],
): SitemapFetchResult {
  return {
    sitemapUrl,
    dataStatus: 'complete',
    urls,
    nestedSitemaps: [],
    source: {
      sitemapsFetched: 1,
      urlLocs: urls.length,
      sitemapLocs: 0,
      duplicateUrlLocs: 0,
      duplicateSitemapLocs: 0,
      invalidLocs: { count: 0, samples: [] },
      documents: [
        {
          url: sitemapUrl,
          dataStatus: 'complete',
          status: 200,
          contentType: 'application/xml',
          compression: 'none',
          bytes: 0,
          uncompressedBytes: 0,
          root: 'urlset',
        },
      ],
    },
    truncation: {
      possiblyTruncated: false,
      urlLimitExceeded: false,
      nestedSitemapLimitExceeded: false,
      omittedUrlsAtLeast: 0,
      unprocessedSitemaps: 0,
      limits: { urls: 50_000, sitemaps: 50 },
    },
    warnings: [],
  }
}
