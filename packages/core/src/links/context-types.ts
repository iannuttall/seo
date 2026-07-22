import type { LinkTargetCount } from './types.js'

export type LinkTargetCrawlEvidence =
  | {
      state: 'observed'
      reportId: string
      observedAt: string
      status: number
      finalUrl: string
      indexable: boolean
      canonical: string | null
      issueIds: string[]
    }
  | { state: 'not-observed' | 'unavailable'; reason: string }

export type LinkTargetSearchEvidence =
  | {
      state: 'observed'
      clicks: number
      impressions: number
      ctr: number
      position: number
    }
  | { state: 'not-retained' | 'unavailable'; reason: string }

export type LinkTargetContextRow = LinkTargetCount & {
  crawl: LinkTargetCrawlEvidence
  searchConsole: LinkTargetSearchEvidence
}

export type LinkTargetFinding = {
  code:
    | 'linked-broken-target'
    | 'linked-redirect-target'
    | 'linked-canonical-conflict'
    | 'linked-non-indexable-target'
  priority: 'high' | 'medium' | 'low'
  heuristic: true
  targetUrl: string
  observedLinks: number
  evidenceRefs: string[]
  principle: string
  evidence: string
  action: string
  verify: string
}

export type LinkTargetContext = {
  schemaVersion: 1
  dataStatus: 'complete' | 'partial' | 'unavailable'
  selection: {
    availableTargets: number
    returnedTargets: number
    omittedTargets: number
    limit: number
  }
  provenance: {
    crawl: {
      status: 'joined' | 'unavailable'
      reportId: string | null
      observedAt: string | null
      availablePages: number
      matchedTargets: number
    }
    searchConsole: {
      status: 'joined' | 'partial' | 'unavailable'
      site: string | null
      range: { startDate: string; endDate: string; days: number } | null
      calls: number
      rowsFetched: number
      retainedRowLimit: number
      retainedRowLimitReached: boolean
      matchedTargets: number
    }
  }
  rows: LinkTargetContextRow[]
  findings: LinkTargetFinding[]
  warnings: string[]
}
