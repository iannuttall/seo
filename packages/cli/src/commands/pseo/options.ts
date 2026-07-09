import { pseoAuditOptions } from '@seo/core'
import {
  booleanArg,
  csvArg,
  strictFetchRateArg,
  strictNumberArg,
} from '../../args.js'

export function pseoOptions(args: Record<string, unknown>) {
  return pseoAuditOptions({
    days: strictNumberArg(args.days, '--days'),
    sitemaps: csvArg(args.sitemap),
    maxSitemapUrls: strictNumberArg(
      args['max-sitemap-urls'],
      '--max-sitemap-urls',
    ),
    templateLimit: strictNumberArg(args.limit, '--limit'),
    minimumTemplateUrls: strictNumberArg(
      args['minimum-template-urls'],
      '--minimum-template-urls',
    ),
    minimumTemplateShare: strictNumberArg(
      args['minimum-template-share'],
      '--minimum-template-share',
    ),
    minimumTemplateImpressions: strictNumberArg(
      args['minimum-template-impressions'],
      '--minimum-template-impressions',
    ),
    crawlSamples: strictNumberArg(args['crawl-samples'], '--crawl-samples'),
    inspectSamples: strictNumberArg(
      args['inspect-samples'],
      '--inspect-samples',
    ),
    brandTerms: csvArg(args['brand-terms']),
    includeBrand: booleanArg(args['include-brand']),
    js: booleanArg(args.js) ? true : ('auto' as const),
    refresh: booleanArg(args.refresh),
    rate: strictFetchRateArg(args),
  })
}
