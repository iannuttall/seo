import type { InternalLinksReport } from '@seo/core/hosted'

// What the internal linking tool page keeps of a run's report: its facts,
// with long lists capped and their full counts kept.

const SHOWN_LINKS = 300
const SHOWN_PAGES = 200

export type LinksResult = {
  property: string
  generatedAt: string
  dataStatus: InternalLinksReport['dataStatus']
  verdict: string
  crawl: Pick<
    InternalLinksReport['crawl'],
    | 'method'
    | 'pageLimit'
    | 'pagesCrawled'
    | 'capReached'
    | 'crawlDelaySeconds'
    | 'skipped'
  >
  judge: Pick<
    InternalLinksReport['judge'],
    'status' | 'model' | 'requests' | 'pagesClassified' | 'pairsJudged'
  >
  searchConsole: InternalLinksReport['searchConsole']['status']
  summary: Omit<InternalLinksReport['summary'], 'verdict'>
  links: Array<
    Pick<
      InternalLinksReport['items'][number],
      | 'source'
      | 'target'
      | 'tier'
      | 'probability'
      | 'role'
      | 'anchor'
      | 'sentence'
      | 'sharedQueries'
    >
  >
  orphans: { shown: string[]; total: number }
  weak: { shown: Array<{ url: string; links: number }>; total: number }
  redirects: InternalLinksReport['redirectedLinks']
  generic: InternalLinksReport['genericAnchors']
  warnings: string[]
}

export function resultOf(
  property: string,
  report: InternalLinksReport,
): LinksResult {
  const { verdict, ...summary } = report.summary
  const orphans = report.pageInventory
    .filter((page) => page.inboundLinksAnywhere === 0 && page.type !== 'home')
    .map((page) => page.url)
    .sort()
  const weak = report.pageInventory
    .filter((page) => page.inboundLinks < 3 && page.type !== 'home')
    .map((page) => ({ url: page.url, links: page.inboundLinks }))
  return {
    property,
    generatedAt: report.generatedAt,
    dataStatus: report.dataStatus,
    verdict,
    crawl: {
      method: report.crawl.method,
      pageLimit: report.crawl.pageLimit,
      pagesCrawled: report.crawl.pagesCrawled,
      capReached: report.crawl.capReached,
      crawlDelaySeconds: report.crawl.crawlDelaySeconds,
      skipped: report.crawl.skipped,
    },
    judge: {
      status: report.judge.status,
      model: report.judge.model,
      requests: report.judge.requests,
      pagesClassified: report.judge.pagesClassified,
      pairsJudged: report.judge.pairsJudged,
    },
    searchConsole: report.searchConsole.status,
    summary,
    links: report.items.slice(0, SHOWN_LINKS).map((item) => ({
      source: item.source,
      target: item.target,
      tier: item.tier,
      probability: item.probability,
      role: item.role,
      anchor: item.anchor,
      sentence: item.sentence,
      sharedQueries: item.sharedQueries,
    })),
    orphans: { shown: orphans.slice(0, SHOWN_PAGES), total: orphans.length },
    weak: { shown: weak.slice(0, SHOWN_PAGES), total: weak.length },
    redirects: report.redirectedLinks,
    generic: report.genericAnchors,
    warnings: report.warnings,
  }
}
