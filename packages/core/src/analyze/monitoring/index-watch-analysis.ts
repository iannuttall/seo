import type { UrlInspectionResult } from '../../gsc/client.js'
import type {
  IndexWatchChange,
  IndexWatchChangeKind,
  IndexWatchIssueCode,
  IndexWatchItem,
  IndexWatchPrevious,
} from './types.js'

const STATUS_FIELDS = [
  'verdict',
  'indexingState',
  'robotsTxtState',
  'pageFetchState',
  'googleCanonical',
  'userCanonical',
] as const

function indexStatus(verdict?: string): IndexWatchItem['indexStatus'] {
  if (verdict === 'PASS') return 'indexed'
  if (verdict === 'NEUTRAL') return 'excluded'
  if (verdict === 'FAIL') return 'invalid'
  return 'unknown'
}

function canonicalKey(value?: string): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    url.hash = ''
    return url.toString()
  } catch {
    return value
  }
}

export function indexWatchIssueCodes(status: {
  verdict?: string
  indexingState?: string
  robotsTxtState?: string
  pageFetchState?: string
  googleCanonical?: string
  userCanonical?: string
}): IndexWatchIssueCode[] {
  const issues: IndexWatchIssueCode[] = []
  if (status.verdict === 'FAIL') issues.push('verdict_invalid')
  if (status.verdict === 'NEUTRAL') issues.push('verdict_excluded')
  if (status.robotsTxtState === 'DISALLOWED') {
    issues.push('robots_disallowed')
  }
  if (status.indexingState === 'BLOCKED_BY_META_TAG') {
    issues.push('indexing_blocked_meta')
  }
  if (status.indexingState === 'BLOCKED_BY_HTTP_HEADER') {
    issues.push('indexing_blocked_header')
  }
  if (
    status.pageFetchState &&
    !['PAGE_FETCH_STATE_UNSPECIFIED', 'SUCCESSFUL'].includes(
      status.pageFetchState,
    )
  ) {
    issues.push('page_fetch_failed')
  }
  if (
    status.googleCanonical &&
    status.userCanonical &&
    canonicalKey(status.googleCanonical) !== canonicalKey(status.userCanonical)
  ) {
    issues.push('canonical_mismatch')
  }
  return issues
}

function changesFromPrevious(
  previous: IndexWatchPrevious | undefined,
  current: IndexWatchItem,
): IndexWatchChange[] {
  if (!previous) return []
  return STATUS_FIELDS.flatMap((field) => {
    const before = previous[field]
    const after = current[field]
    const equal =
      field === 'googleCanonical' || field === 'userCanonical'
        ? canonicalKey(before) === canonicalKey(after)
        : before === after
    return equal ? [] : [{ field, before, after }]
  })
}

function changeKind(input: {
  previous?: IndexWatchPrevious
  changes: IndexWatchChange[]
  currentIssue: boolean
}): IndexWatchChangeKind {
  if (!input.previous) return 'baseline'
  if (!input.changes.length) return 'unchanged'
  const previousIssue = indexWatchIssueCodes(input.previous).length > 0
  if (!previousIssue && input.currentIssue) return 'regression'
  if (previousIssue && !input.currentIssue) return 'recovery'
  return 'changed'
}

export function indexWatchItemFromInspection(input: {
  rootSite: string
  property: string
  url: string
  inspectedAt: string
  result: UrlInspectionResult
  previous?: IndexWatchPrevious
}): IndexWatchItem {
  const status = input.result.inspectionResult?.indexStatusResult
  const item: IndexWatchItem = {
    rootSite: input.rootSite,
    property: input.property,
    url: input.url,
    inspectedAt: input.inspectedAt,
    inspectionStatus: 'succeeded',
    requestSent: true,
    indexStatus: indexStatus(status?.verdict),
    verdict: status?.verdict,
    coverageState: status?.coverageState,
    indexingState: status?.indexingState,
    robotsTxtState: status?.robotsTxtState,
    pageFetchState: status?.pageFetchState,
    googleCanonical: status?.googleCanonical,
    userCanonical: status?.userCanonical,
    lastCrawlTime: status?.lastCrawlTime,
    previous: input.previous,
    issueCodes: [],
    currentIssue: false,
    severity: 'none',
    changes: [],
    changeKind: 'baseline',
    changed: false,
    regression: false,
    recovery: false,
    alert: false,
  }
  item.issueCodes = indexWatchIssueCodes(item)
  item.currentIssue = item.issueCodes.length > 0
  item.severity = item.issueCodes.some((issue) =>
    [
      'verdict_invalid',
      'robots_disallowed',
      'indexing_blocked_meta',
      'indexing_blocked_header',
      'page_fetch_failed',
    ].includes(issue),
  )
    ? 'high'
    : item.currentIssue
      ? 'medium'
      : 'none'
  item.changes = changesFromPrevious(input.previous, item)
  item.changeKind = changeKind({
    previous: input.previous,
    changes: item.changes,
    currentIssue: item.currentIssue,
  })
  item.changed = item.changes.length > 0
  item.regression = item.changeKind === 'regression'
  item.recovery = item.changeKind === 'recovery'
  item.alert =
    item.regression || (item.changeKind === 'baseline' && item.currentIssue)
  return item
}

export function indexWatchFailureItem(input: {
  rootSite: string
  property: string
  url: string
  inspectedAt: string
  errorCode: string
  errorMessage: string
  retryAt?: string
  quotaBlocked?: boolean
  deferred?: boolean
  requestSent?: boolean
}): IndexWatchItem {
  return {
    rootSite: input.rootSite,
    property: input.property,
    url: input.url,
    inspectedAt: input.inspectedAt,
    inspectionStatus: input.deferred
      ? 'deferred'
      : input.quotaBlocked
        ? 'quota-blocked'
        : 'failed',
    requestSent: input.requestSent ?? true,
    indexStatus: 'unknown',
    issueCodes: [
      input.quotaBlocked ? 'inspection_quota_blocked' : 'inspection_failed',
    ],
    currentIssue: false,
    severity: 'none',
    changes: [],
    changeKind: 'not-comparable',
    changed: false,
    regression: false,
    recovery: false,
    alert: false,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    retryAt: input.retryAt,
  }
}
