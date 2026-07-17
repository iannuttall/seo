import type { CrawlerIdentity } from '../types.js'
import { SEO_VERSION } from '../version.js'

export const SEO_CRAWLER_TOKEN = 'SEO-Skill'
export const SEO_CRAWLER_USER_AGENT = `${SEO_CRAWLER_TOKEN}/${SEO_VERSION} (+https://seoskill.dev)`

export const SEO_CRAWLER_IDENTITY: CrawlerIdentity = {
  name: 'SEO Skill',
  robotsToken: SEO_CRAWLER_TOKEN,
  version: SEO_VERSION,
  userAgent: SEO_CRAWLER_USER_AGENT,
  documentationUrl: 'https://seoskill.dev/docs/crawler/',
}
