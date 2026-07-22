import { urlKey } from './context-sources.js'
import type {
  LinkTargetContextRow,
  LinkTargetCrawlEvidence,
  LinkTargetFinding,
  LinkTargetSearchEvidence,
} from './context-types.js'

const MAX_FINDINGS = 50

function findingPriority(input: {
  code: LinkTargetFinding['code']
  observedLinks: number
  crawl: Extract<LinkTargetCrawlEvidence, { state: 'observed' }>
  search: LinkTargetSearchEvidence
}): LinkTargetFinding['priority'] {
  const searchValue =
    input.search.state === 'observed' &&
    (input.search.clicks > 0 || input.search.impressions >= 100)
  if (input.code === 'linked-broken-target' || searchValue) return 'high'
  if (input.observedLinks >= 5) return 'medium'
  return 'low'
}

function finding(input: {
  row: LinkTargetContextRow
  code: LinkTargetFinding['code']
}): LinkTargetFinding {
  const crawl = input.row.crawl
  if (crawl.state !== 'observed') {
    throw new Error('A link finding requires observed crawl evidence.')
  }
  const searchEvidence =
    input.row.searchConsole.state === 'observed'
      ? ` Search Console retained ${input.row.searchConsole.clicks.toFixed(0)} clicks and ${input.row.searchConsole.impressions.toFixed(0)} impressions for this page in the selected window.`
      : ''
  const common = {
    priority: findingPriority({
      code: input.code,
      observedLinks: input.row.observedLinks,
      crawl,
      search: input.row.searchConsole,
    }),
    heuristic: true as const,
    targetUrl: input.row.targetUrl,
    observedLinks: input.row.observedLinks,
    evidenceRefs: [input.row.targetUrl, crawl.reportId],
  }
  if (input.code === 'linked-broken-target') {
    return {
      ...common,
      code: input.code,
      principle: 'Linked target pages should resolve intentionally.',
      evidence: `The saved crawl observed status ${crawl.status} for a target with ${input.row.observedLinks} retained representative links.${searchEvidence}`,
      action:
        'Confirm whether the page should exist. Restore it or add one direct redirect to a genuinely equivalent live page when the missing URL is unintended.',
      verify:
        'Run redirect-trace for the target, then recrawl it and confirm a stable intended response.',
    }
  }
  if (input.code === 'linked-redirect-target') {
    return {
      ...common,
      code: input.code,
      principle: 'External links should reach a stable final destination.',
      evidence: `The saved crawl observed ${input.row.targetUrl} resolving to ${crawl.finalUrl}.${searchEvidence}`,
      action:
        'Check that the redirect is intentional, direct and semantically equivalent. Update links you control to the final URL and ask important external sources to update only when the change is worth the effort.',
      verify:
        'Run redirect-trace and confirm one stable hop to the intended indexable page.',
    }
  }
  if (input.code === 'linked-canonical-conflict') {
    return {
      ...common,
      code: input.code,
      principle: 'Canonical hints should agree with the intended linked page.',
      evidence: `The saved crawl observed canonical ${crawl.canonical} on a linked target that resolved to ${crawl.finalUrl}.${searchEvidence}`,
      action:
        'Confirm the preferred URL. Align the canonical and redirect only if the current disagreement is unintended.',
      verify:
        'Audit the final page and inspect the declared and Google-selected canonical before changing it.',
    }
  }
  return {
    ...common,
    code: input.code,
    principle:
      'A linked page should be indexable when search visibility is intended.',
    evidence: `The saved crawl marked a linked target as non-indexable.${searchEvidence}`,
    action:
      'Confirm whether non-indexing is intentional. Remove the blocking signal or redirect to an equivalent indexable page only when this URL should appear in search.',
    verify:
      'Audit the page, then use URL Inspection when the intended state is indexable.',
  }
}

export function linkTargetFindings(
  rows: LinkTargetContextRow[],
): LinkTargetFinding[] {
  return rows
    .flatMap((row): LinkTargetFinding[] => {
      const crawl = row.crawl
      if (crawl.state !== 'observed') return []
      if (crawl.status >= 400) {
        return [finding({ row, code: 'linked-broken-target' })]
      }
      if (urlKey(crawl.finalUrl) !== urlKey(row.targetUrl)) {
        return [finding({ row, code: 'linked-redirect-target' })]
      }
      if (
        crawl.canonical &&
        urlKey(crawl.canonical) !== urlKey(crawl.finalUrl)
      ) {
        return [finding({ row, code: 'linked-canonical-conflict' })]
      }
      if (!crawl.indexable) {
        return [finding({ row, code: 'linked-non-indexable-target' })]
      }
      return []
    })
    .sort(
      (left, right) =>
        ({ high: 0, medium: 1, low: 2 })[left.priority] -
          { high: 0, medium: 1, low: 2 }[right.priority] ||
        right.observedLinks - left.observedLinks ||
        (left.targetUrl < right.targetUrl
          ? -1
          : left.targetUrl > right.targetUrl
            ? 1
            : 0),
    )
    .slice(0, MAX_FINDINGS)
}
