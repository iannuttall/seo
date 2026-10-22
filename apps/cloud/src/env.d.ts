interface Env {
  DB: D1Database
  SITE: DurableObjectNamespace<import('./crawler.ts').SiteCrawler>
  POC_TOKEN: string
  // The URL Inspection endpoint. The fixture serves a stand-in locally.
  INSPECT_API: string
  POC_GOOGLE_TOKEN?: string
}
