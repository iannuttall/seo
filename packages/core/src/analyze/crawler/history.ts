import type { CrawlPageSnapshot } from '../monitoring/types.js'
import {
  type CrawlComparisonMetadata,
  crawlComparisonMetadata,
} from './history-provenance.js'
import type { CrawlIssueGroup, CrawlReport } from './report.js'

export type CrawlSnapshotPageChange = {
  url: string
  kind: 'added' | 'removed' | 'changed'
  changes: string[]
  before?: Pick<
    CrawlPageSnapshot,
    | 'url'
    | 'finalUrl'
    | 'status'
    | 'title'
    | 'metaDescription'
    | 'canonical'
    | 'h1'
    | 'indexable'
    | 'wordCount'
  >
  after?: Pick<
    CrawlPageSnapshot,
    | 'url'
    | 'finalUrl'
    | 'status'
    | 'title'
    | 'metaDescription'
    | 'canonical'
    | 'h1'
    | 'indexable'
    | 'wordCount'
  >
}

export type CrawlSnapshotIssueChange = {
  ruleId: string
  title: string
  severity: string
  category: string
  before: number
  after: number
  delta: number
}

export type CrawlSnapshotDiffReport = {
  schemaVersion: 1
  before: CrawlComparisonMetadata['before']
  after: CrawlComparisonMetadata['after']
  comparability: CrawlComparisonMetadata['comparability']
  completeness: CrawlComparisonMetadata['completeness']
  caveats: string[]
  summary: {
    pageDelta: number
    issueDelta: number
    addedPages: number
    removedPages: number
    changedPages: number
    newStatusErrors: number
    fixedStatusErrors: number
    indexabilityFlips: number
    titleChanges: number
    contentChanges: number
    issueGroupsWorse: number
    issueGroupsBetter: number
  }
  headline: string
  topActions: Array<{
    title: string
    plainEnglish: string
    action: string
    urls?: string[]
  }>
  pageChanges: CrawlSnapshotPageChange[]
  issueChanges: CrawlSnapshotIssueChange[]
}

function pagePick(page: CrawlPageSnapshot): CrawlSnapshotPageChange['before'] {
  return {
    url: page.url,
    finalUrl: page.finalUrl,
    status: page.status,
    title: page.title,
    metaDescription: page.metaDescription,
    canonical: page.canonical,
    h1: page.h1,
    indexable: page.indexable,
    wordCount: page.wordCount,
  }
}

function statusBecameError(
  before?: CrawlPageSnapshot,
  after?: CrawlPageSnapshot,
) {
  return (before?.status ?? 200) < 400 && (after?.status ?? 200) >= 400
}

function statusWasFixed(before?: CrawlPageSnapshot, after?: CrawlPageSnapshot) {
  return (before?.status ?? 200) >= 400 && (after?.status ?? 500) < 400
}

function comparePage(
  before: CrawlPageSnapshot,
  after: CrawlPageSnapshot,
): string[] {
  const changes: string[] = []
  if (before.finalUrl !== after.finalUrl) changes.push('final_url')
  if (before.status !== after.status) changes.push('status')
  if (before.title !== after.title) changes.push('title')
  if (before.metaDescription !== after.metaDescription) {
    changes.push('meta_description')
  }
  if (before.canonical !== after.canonical) changes.push('canonical')
  if (before.h1 !== after.h1) changes.push('h1')
  if (before.indexable !== after.indexable) changes.push('indexability')
  if (before.contentHash !== after.contentHash) changes.push('content')
  if (before.wordCount !== after.wordCount) changes.push('word_count')
  return changes
}

function pageChanges(
  beforeReport: CrawlReport,
  afterReport: CrawlReport,
): CrawlSnapshotPageChange[] {
  const before = new Map(beforeReport.pages.map((page) => [page.url, page]))
  const after = new Map(afterReport.pages.map((page) => [page.url, page]))
  const changes: CrawlSnapshotPageChange[] = []

  for (const [url, page] of after) {
    const previous = before.get(url)
    if (!previous) {
      changes.push({
        url,
        kind: 'added',
        changes: ['url_added'],
        after: pagePick(page),
      })
      continue
    }
    const fields = comparePage(previous, page)
    if (fields.length) {
      changes.push({
        url,
        kind: 'changed',
        changes: fields,
        before: pagePick(previous),
        after: pagePick(page),
      })
    }
  }

  for (const [url, page] of before) {
    if (!after.has(url)) {
      changes.push({
        url,
        kind: 'removed',
        changes: ['url_removed'],
        before: pagePick(page),
      })
    }
  }

  return changes.sort((a, b) => {
    const rank = { changed: 0, added: 1, removed: 2 }
    return rank[a.kind] - rank[b.kind] || a.url.localeCompare(b.url)
  })
}

function issueMap(groups: CrawlIssueGroup[]): Map<string, CrawlIssueGroup> {
  return new Map(groups.map((group) => [group.ruleId, group]))
}

function issueChanges(
  beforeReport: CrawlReport,
  afterReport: CrawlReport,
): CrawlSnapshotIssueChange[] {
  const before = issueMap(beforeReport.issueGroups)
  const after = issueMap(afterReport.issueGroups)
  const ruleIds = new Set([...before.keys(), ...after.keys()])
  const changes: CrawlSnapshotIssueChange[] = []

  for (const ruleId of ruleIds) {
    const oldGroup = before.get(ruleId)
    const newGroup = after.get(ruleId)
    const oldCount = oldGroup?.count ?? 0
    const newCount = newGroup?.count ?? 0
    if (oldCount === newCount) continue
    const group = newGroup ?? oldGroup
    if (!group) continue
    changes.push({
      ruleId,
      title: group.title,
      severity: group.severity,
      category: group.category,
      before: oldCount,
      after: newCount,
      delta: newCount - oldCount,
    })
  }

  return changes.sort(
    (a, b) =>
      Math.abs(b.delta) - Math.abs(a.delta) || a.ruleId.localeCompare(b.ruleId),
  )
}

function headline(summary: CrawlSnapshotDiffReport['summary']): string {
  if (
    summary.addedPages === 0 &&
    summary.removedPages === 0 &&
    summary.changedPages === 0 &&
    summary.issueDelta === 0
  ) {
    return 'No material crawl changes were found between these saved reports.'
  }
  if (
    summary.newStatusErrors > 0 ||
    summary.issueGroupsWorse > summary.issueGroupsBetter
  ) {
    return 'The newer crawl has regressions that should be reviewed before more SEO work.'
  }
  if (
    summary.fixedStatusErrors > 0 ||
    summary.issueGroupsBetter > summary.issueGroupsWorse
  ) {
    return 'The newer crawl looks healthier, with some technical issues reduced or fixed.'
  }
  return 'The newer crawl changed, but the overall technical picture is broadly similar.'
}

function actions(input: {
  changes: CrawlSnapshotPageChange[]
  issues: CrawlSnapshotIssueChange[]
  summary: CrawlSnapshotDiffReport['summary']
}): CrawlSnapshotDiffReport['topActions'] {
  const actions: CrawlSnapshotDiffReport['topActions'] = []
  const newErrors = input.changes.filter((item) =>
    statusBecameError(
      item.before as CrawlPageSnapshot | undefined,
      item.after as CrawlPageSnapshot | undefined,
    ),
  )
  if (newErrors.length) {
    actions.push({
      title: 'New status errors appeared',
      plainEnglish: `${newErrors.length} URL now returns a 4xx or 5xx status when it did not before.`,
      action:
        'Check deploys, redirects, routing, and canonical URL changes before changing content.',
      urls: newErrors.slice(0, 10).map((item) => item.url),
    })
  }

  const indexability = input.changes.filter((item) =>
    item.changes.includes('indexability'),
  )
  if (indexability.length) {
    actions.push({
      title: 'Indexability changed',
      plainEnglish: `${indexability.length} URL changed indexability state.`,
      action:
        'Confirm noindex, robots, canonical, auth, and rendering changes were intentional.',
      urls: indexability.slice(0, 10).map((item) => item.url),
    })
  }

  const worseIssues = input.issues.filter((item) => item.delta > 0)
  if (worseIssues.length) {
    const issue = worseIssues[0]
    actions.push({
      title: issue?.title ?? 'Crawl issues increased',
      plainEnglish: `${issue?.ruleId ?? 'A rule'} increased by ${issue?.delta ?? 0} affected pages.`,
      action:
        'Review the affected rule and compare changed templates before shipping more pages.',
    })
  }

  const titleChanges = input.changes.filter((item) =>
    item.changes.includes('title'),
  )
  if (titleChanges.length) {
    actions.push({
      title: 'Titles changed',
      plainEnglish: `${titleChanges.length} page title changed between snapshots.`,
      action:
        'Compare title changes against top GSC queries before treating traffic movement as content decay.',
      urls: titleChanges.slice(0, 10).map((item) => item.url),
    })
  }

  if (!actions.length && input.summary.changedPages > 0) {
    actions.push({
      title: 'Review changed pages',
      plainEnglish: `${input.summary.changedPages} page changed without an obvious technical regression.`,
      action:
        'Use the JSON output to inspect changed fields, then decide whether to annotate the change as an SEO test.',
    })
  }

  return actions
}

export function compareCrawlReports(input: {
  before: CrawlReport
  after: CrawlReport
}): CrawlSnapshotDiffReport {
  const metadata = crawlComparisonMetadata(input)
  const changes = pageChanges(input.before, input.after)
  const issues = issueChanges(input.before, input.after)
  const summary = {
    pageDelta: input.after.summary.totalPages - input.before.summary.totalPages,
    issueDelta: input.after.issues.length - input.before.issues.length,
    addedPages: changes.filter((item) => item.kind === 'added').length,
    removedPages: changes.filter((item) => item.kind === 'removed').length,
    changedPages: changes.filter((item) => item.kind === 'changed').length,
    newStatusErrors: changes.filter((item) =>
      statusBecameError(
        item.before as CrawlPageSnapshot | undefined,
        item.after as CrawlPageSnapshot | undefined,
      ),
    ).length,
    fixedStatusErrors: changes.filter((item) =>
      statusWasFixed(
        item.before as CrawlPageSnapshot | undefined,
        item.after as CrawlPageSnapshot | undefined,
      ),
    ).length,
    indexabilityFlips: changes.filter((item) =>
      item.changes.includes('indexability'),
    ).length,
    titleChanges: changes.filter((item) => item.changes.includes('title'))
      .length,
    contentChanges: changes.filter((item) => item.changes.includes('content'))
      .length,
    issueGroupsWorse: issues.filter((item) => item.delta > 0).length,
    issueGroupsBetter: issues.filter((item) => item.delta < 0).length,
  }

  return {
    schemaVersion: 1,
    ...metadata,
    summary,
    headline: headline(summary),
    topActions: actions({ changes, issues, summary }),
    pageChanges: changes,
    issueChanges: issues,
  }
}
