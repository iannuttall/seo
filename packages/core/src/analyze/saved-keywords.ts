import { SeoError } from '../errors.js'
import { getKeywordSet, type KeywordSetDetail } from '../keyword-sets/index.js'

const DEFAULT_STALE_DAYS = 45

export type SavedKeywordSetReport = {
  schemaVersion: 1
  generatedAt: string
  dataStatus: 'complete' | 'partial' | 'unavailable'
  summary: {
    name: string
    totalKeywords: number
    matchedKeywords: number
    returnedKeywords: number
    metricSnapshots: number
    observedVolumes: number
    observedZeroVolumes: number
    unavailableVolumeSnapshots: number
    staleMetricSnapshots: number
    mappedKeywords: number
    targetPages: number
    proposedPages: number
    distinctTags: number
    verdict: string
  }
  evidence: KeywordSetDetail
  analysis: {
    metricFreshnessDays: number
    tagGroups: Array<{ tag: string; keywordCount: number }>
    pageMappings: Array<{
      url: string
      kind: 'target' | 'proposed'
      keywordCount: number
    }>
  }
  findings: Array<{
    code:
      | 'missing-metrics'
      | 'unavailable-volume-evidence'
      | 'stale-metrics'
      | 'unmapped-keywords'
    evidenceRef: string
    detail: string
    action: string
  }>
  caveats: string[]
  nextSteps: string[]
}

export function savedKeywordSetReport(
  input: {
    projectId: string
    idOrName: string
    tag?: string
    limit?: number
    offset?: number
    staleDays?: number
  },
  dependencies: {
    getKeywordSet?: typeof getKeywordSet
    now?: () => Date
  } = {},
): SavedKeywordSetReport {
  const staleDays = input.staleDays ?? DEFAULT_STALE_DAYS
  if (!Number.isSafeInteger(staleDays) || staleDays < 1 || staleDays > 365) {
    throw new SeoError(
      'INVALID_INPUT',
      'Metric freshness must be from 1 to 365 days.',
    )
  }
  const now = (dependencies.now ?? (() => new Date()))()
  const evidence = (dependencies.getKeywordSet ?? getKeywordSet)(input)
  const snapshots = evidence.items.filter((item) => item.latestMetric)
  const observedVolumes = snapshots.filter(
    (item) =>
      item.latestMetric?.metric.monthlySearchVolume.state === 'observed',
  )
  const staleCutoff = now.getTime() - staleDays * 86_400_000
  const staleSnapshots = snapshots.filter(
    (item) => Date.parse(item.latestMetric?.observedAt ?? '') < staleCutoff,
  )
  const mapped = evidence.items.filter((item) => item.page)
  const tagGroups = groupedCounts(
    evidence.items.flatMap((item) => item.tags),
  ).map(([tag, keywordCount]) => ({ tag, keywordCount }))
  const pageMappings = groupedMappings(evidence)
  const missingMetrics = evidence.items.length - snapshots.length
  const unavailableVolumeSnapshots = snapshots.length - observedVolumes.length
  const unmapped = evidence.items.length - mapped.length
  const partial =
    evidence.pagination.nextOffset !== null ||
    evidence.pagination.offset > 0 ||
    evidence.pagination.total !== evidence.set.keywordCount
  const dataStatus =
    evidence.items.length === 0
      ? ('unavailable' as const)
      : partial
        ? ('partial' as const)
        : ('complete' as const)
  return {
    schemaVersion: 1,
    generatedAt: now.toISOString(),
    dataStatus,
    summary: {
      name: evidence.set.name,
      totalKeywords: evidence.set.keywordCount,
      matchedKeywords: evidence.pagination.total,
      returnedKeywords: evidence.items.length,
      metricSnapshots: snapshots.length,
      observedVolumes: observedVolumes.length,
      observedZeroVolumes: observedVolumes.filter(
        (item) => item.latestMetric?.metric.monthlySearchVolume.value === 0,
      ).length,
      unavailableVolumeSnapshots,
      staleMetricSnapshots: staleSnapshots.length,
      mappedKeywords: mapped.length,
      targetPages: pageMappings.filter((item) => item.kind === 'target').length,
      proposedPages: pageMappings.filter((item) => item.kind === 'proposed')
        .length,
      distinctTags: tagGroups.length,
      verdict: `${evidence.items.length} saved keywords were returned; search volume is observed for ${observedVolumes.length}, unavailable in ${unavailableVolumeSnapshots} saved snapshot${unavailableVolumeSnapshots === 1 ? '' : 's'}, and ${mapped.length} have page mappings.`,
    },
    evidence,
    analysis: { metricFreshnessDays: staleDays, tagGroups, pageMappings },
    findings: [
      ...(missingMetrics > 0
        ? [
            {
              code: 'missing-metrics' as const,
              evidenceRef: 'evidence.items[*].latestMetric',
              detail: `${missingMetrics} returned keywords have no saved provider metric snapshot.`,
              action:
                'Preview a keyword-set refresh before using provider metrics to prioritize them.',
            },
          ]
        : []),
      ...(unavailableVolumeSnapshots > 0
        ? [
            {
              code: 'unavailable-volume-evidence' as const,
              evidenceRef:
                'evidence.items[*].latestMetric.metric.monthlySearchVolume',
              detail: `${unavailableVolumeSnapshots} saved metric snapshot${unavailableVolumeSnapshots === 1 ? '' : 's'} ${unavailableVolumeSnapshots === 1 ? 'has' : 'have'} no observed search volume. This is not an observed zero.`,
              action:
                'Keep these terms separate from observed-zero terms and verify them with another source or a later refresh before using demand as a filter.',
            },
          ]
        : []),
      ...(staleSnapshots.length > 0
        ? [
            {
              code: 'stale-metrics' as const,
              evidenceRef: 'evidence.items[*].latestMetric.observedAt',
              detail: `${staleSnapshots.length} saved metric snapshots are older than ${staleDays} days.`,
              action:
                'Preview and selectively refresh the stale provider evidence.',
            },
          ]
        : []),
      ...(unmapped > 0
        ? [
            {
              code: 'unmapped-keywords' as const,
              evidenceRef: 'evidence.items[*].page',
              detail: `${unmapped} returned keywords have no existing or proposed page mapping.`,
              action:
                'Review shared intent and current results before mapping terms to an existing page or a proposed page.',
            },
          ]
        : []),
    ],
    caveats: [
      'Tags are user-managed research labels, not proof that keywords share one intent or should use one page.',
      'Provider metrics are market estimates; missing evidence differs from an observed zero.',
      'Page mappings record planning state and do not prove that a page ranks, is indexed, or should be created.',
      ...(partial
        ? [
            'This view is filtered or paginated and cannot support a complete-set all-clear.',
          ]
        : []),
    ],
    nextSteps: [
      'Compare relevant saved terms with Search Console evidence for the project before changing priorities.',
      'Inspect current results in the same market before turning a tag group into a page or programmatic template.',
      'Use the refresh preview to check provider cost before updating saved metric snapshots.',
    ],
  }
}

function groupedCounts(values: string[]): Array<[string, number]> {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts]
    .sort(
      ([left, leftCount], [right, rightCount]) =>
        rightCount - leftCount || (left < right ? -1 : left > right ? 1 : 0),
    )
    .slice(0, 50)
}

function groupedMappings(
  evidence: KeywordSetDetail,
): SavedKeywordSetReport['analysis']['pageMappings'] {
  const counts = new Map<
    string,
    { url: string; kind: 'target' | 'proposed'; count: number }
  >()
  for (const item of evidence.items) {
    if (!item.page) continue
    const key = `${item.page.kind}\u0000${item.page.url}`
    const current = counts.get(key)
    counts.set(key, {
      ...item.page,
      count: (current?.count ?? 0) + 1,
    })
  }
  return [...counts.values()]
    .sort(
      (left, right) =>
        right.count - left.count ||
        (left.url < right.url ? -1 : left.url > right.url ? 1 : 0),
    )
    .slice(0, 50)
    .map(({ count, ...mapping }) => ({ ...mapping, keywordCount: count }))
}
