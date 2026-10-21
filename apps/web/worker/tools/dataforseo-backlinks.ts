import {
  basicAuthorization,
  dataForSeoTask,
  fetchProviderJson,
  isRecord,
  nonNegativeInteger,
  normalizeProviderDomainOrPage,
  type ProviderAdapterDependencies,
  type ProviderDataStatus,
  providerCheckedAt,
  safeHttpUrl,
} from './provider-adapter.ts'

const BASE = 'https://api.dataforseo.com/v3/backlinks'
const ENDPOINTS = {
  summary: `${BASE}/summary/live`,
  backlinks: `${BASE}/backlinks/live`,
  anchors: `${BASE}/anchors/live`,
  history: `${BASE}/history/live`,
} as const
const BACKLINK_LIMIT = 100
const ANCHOR_LIMIT = 20
const HISTORY_MONTHS = 12
const BREAKDOWN_LIMIT = 8
const TEXT_LIMIT = 300

export type DataForSeoBacklinksInput = {
  target: string
  login: string
  password: string
}

type Count = { name: string; count: number }

export type DataForSeoBacklink = {
  sourceUrl: string
  sourceDomain: string
  sourceTitle: string | null
  targetUrl: string | null
  anchor: string | null
  linkType: string | null
  dofollow: boolean
  domainRank: number | null
  spamScore: number | null
  placement: string | null
  firstSeen: string | null
  lastSeen: string | null
  isNew: boolean
  isBroken: boolean
}

export type DataForSeoAnchor = {
  anchor: string
  referringDomains: number | null
  referringDomainsNofollow: number | null
  backlinks: number | null
}

export type DataForSeoBacklinkMonth = {
  month: string
  backlinks: number | null
  referringDomains: number | null
  newReferringDomains: number | null
  lostReferringDomains: number | null
}

export type DataForSeoBacklinksResult = {
  schema: 1
  target: string
  targetType: 'domain' | 'page'
  dataStatus: ProviderDataStatus
  summary: {
    backlinks: number | null
    referringDomains: number | null
    referringDomainsNofollow: number | null
    referringPages: number | null
    brokenBacklinks: number | null
    rank: number | null
    spamScore: number | null
    firstSeen: string | null
    linkTypes: Count[]
    attributes: Count[]
    placements: Count[]
    tlds: Count[]
  }
  backlinks: DataForSeoBacklink[]
  backlinkDomainsTotal: number | null
  anchors: DataForSeoAnchor[]
  anchorsTotal: number | null
  history: DataForSeoBacklinkMonth[]
  warnings: Array<{
    code:
      | 'provider-estimate'
      | 'backlinks-unavailable'
      | 'anchors-unavailable'
      | 'history-unavailable'
    message: string
  }>
  provenance: {
    provider: 'dataforseo'
    endpoints: typeof ENDPOINTS
    checkedAt: string
    providerCostUsd: number | null
    rankScale: '0 to 100'
    limits: {
      backlinks: 100
      anchors: 20
      historyMonths: 12
    }
  }
}

export async function checkDataForSeoBacklinks(
  input: DataForSeoBacklinksInput,
  dependencies: ProviderAdapterDependencies = {},
): Promise<DataForSeoBacklinksResult> {
  const target = normalizeProviderDomainOrPage(input.target)
  const targetType = target.includes('/') ? 'page' : 'domain'
  const checkedAt = providerCheckedAt(dependencies)
  const authorization = basicAuthorization(input.login, input.password)
  const post = (url: string, task: Record<string, unknown>) =>
    fetchProviderJson(
      url,
      {
        method: 'POST',
        headers: {
          authorization,
          accept: 'application/json',
          'content-type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify([{ target, rank_scale: 'one_hundred', ...task }]),
      },
      dependencies,
    )
  const live = { backlinks_status_type: 'live', include_subdomains: true }
  const now = new Date(checkedAt)
  const historyFrom = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - HISTORY_MONTHS, 1),
  )
    .toISOString()
    .slice(0, 10)

  const [summary, backlinks, anchors, history] = await Promise.allSettled([
    post(ENDPOINTS.summary, live),
    post(ENDPOINTS.backlinks, {
      ...live,
      mode: 'one_per_domain',
      order_by: ['domain_from_rank,desc'],
      limit: BACKLINK_LIMIT,
    }),
    post(ENDPOINTS.anchors, {
      ...live,
      order_by: ['referring_domains,desc'],
      limit: ANCHOR_LIMIT,
    }),
    targetType === 'domain'
      ? post(ENDPOINTS.history, { date_from: historyFrom })
      : Promise.reject(new Error('Pages have no history.')),
  ])

  // The summary is the core of the result, so its failure fails the check.
  if (summary.status === 'rejected') throw summary.reason
  const summaryTask = dataForSeoTask(summary.value)
  const costs: number[] = []
  if (summaryTask.costUsd !== null) costs.push(summaryTask.costUsd)
  const optional = (settled: PromiseSettledResult<unknown>) => {
    if (settled.status === 'rejected') return null
    try {
      const task = dataForSeoTask(settled.value)
      if (task.costUsd !== null) costs.push(task.costUsd)
      return task.result
    } catch {
      return null
    }
  }
  const backlinkResult = optional(backlinks)
  const anchorResult = optional(anchors)
  const historyResult = targetType === 'domain' ? optional(history) : null

  const warnings: DataForSeoBacklinksResult['warnings'] = [
    {
      code: 'provider-estimate',
      message:
        'Backlink counts come from DataForSEO’s link index. They are not a complete list of every link on the web.',
    },
  ]
  const links = normalizeBacklinks(backlinkResult?.items)
  if (!backlinkResult) {
    warnings.push({
      code: 'backlinks-unavailable',
      message: 'DataForSEO did not return the backlink list.',
    })
  }
  const anchorRows = normalizeAnchors(anchorResult?.items)
  if (!anchorResult) {
    warnings.push({
      code: 'anchors-unavailable',
      message: 'DataForSEO did not return the anchor text.',
    })
  }
  const months = normalizeHistory(historyResult?.items)
  if (targetType === 'domain' && !historyResult) {
    warnings.push({
      code: 'history-unavailable',
      message: 'DataForSEO did not return the backlink history.',
    })
  }

  const result = summaryTask.result
  const providerCostUsd = costs.length
    ? Number(costs.reduce((sum, cost) => sum + cost, 0).toFixed(6))
    : null
  const missingPart =
    !backlinkResult ||
    !anchorResult ||
    (targetType === 'domain' && !historyResult)

  return {
    schema: 1,
    target,
    targetType,
    dataStatus: missingPart ? 'partial' : 'complete',
    summary: {
      backlinks: nonNegativeInteger(result.backlinks),
      referringDomains: nonNegativeInteger(result.referring_domains),
      referringDomainsNofollow: nonNegativeInteger(
        result.referring_domains_nofollow,
      ),
      referringPages: nonNegativeInteger(result.referring_pages),
      brokenBacklinks: nonNegativeInteger(result.broken_backlinks),
      rank: scaled(result.rank),
      spamScore: scaled(result.backlinks_spam_score),
      firstSeen: providerDate(result.first_seen),
      linkTypes: counts(result.referring_links_types),
      attributes: counts(result.referring_links_attributes),
      placements: counts(result.referring_links_semantic_locations),
      tlds: counts(result.referring_links_tld),
    },
    backlinks: links,
    backlinkDomainsTotal: backlinkResult
      ? nonNegativeInteger(backlinkResult.total_count)
      : null,
    anchors: anchorRows,
    anchorsTotal: anchorResult
      ? nonNegativeInteger(anchorResult.total_count)
      : null,
    history: months,
    warnings,
    provenance: {
      provider: 'dataforseo',
      endpoints: ENDPOINTS,
      checkedAt,
      providerCostUsd,
      rankScale: '0 to 100',
      limits: {
        backlinks: BACKLINK_LIMIT,
        anchors: ANCHOR_LIMIT,
        historyMonths: HISTORY_MONTHS,
      },
    },
  }
}

function scaled(value: unknown): number | null {
  const number = nonNegativeInteger(value)
  return number !== null && number <= 100 ? number : null
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null
  let cleaned = ''
  for (const character of value) {
    const codepoint = character.codePointAt(0) ?? 0
    cleaned += codepoint < 32 || codepoint === 127 ? ' ' : character
  }
  cleaned = cleaned.replace(/\s+/gu, ' ').trim()
  return cleaned ? cleaned.slice(0, TEXT_LIMIT) : null
}

function providerDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = /^(\d{4}-\d{2}-\d{2})/u.exec(value)
  return match?.[1] ?? null
}

function counts(value: unknown): Count[] {
  if (!isRecord(value)) return []
  const rows: Count[] = []
  for (const [key, raw] of Object.entries(value)) {
    const count = nonNegativeInteger(raw)
    const name = text(key) ?? 'unknown'
    if (count !== null && count > 0) rows.push({ name, count })
  }
  return rows
    .sort(
      (left, right) =>
        right.count - left.count ||
        (left.name < right.name ? -1 : left.name > right.name ? 1 : 0),
    )
    .slice(0, BREAKDOWN_LIMIT)
}

function normalizeBacklinks(value: unknown): DataForSeoBacklink[] {
  if (!Array.isArray(value)) return []
  const links: DataForSeoBacklink[] = []
  const seen = new Set<string>()
  for (const item of value) {
    if (!isRecord(item)) continue
    const sourceUrl = safeHttpUrl(item.url_from)
    if (!sourceUrl || seen.has(sourceUrl)) continue
    seen.add(sourceUrl)
    links.push({
      sourceUrl,
      sourceDomain:
        text(item.domain_from) ?? new URL(sourceUrl).hostname.toLowerCase(),
      sourceTitle: text(item.page_from_title),
      targetUrl: safeHttpUrl(item.url_to),
      anchor: text(item.anchor),
      linkType: text(item.item_type),
      dofollow: item.dofollow === true,
      domainRank: scaled(item.domain_from_rank),
      spamScore: scaled(item.backlink_spam_score),
      placement: text(item.semantic_location),
      firstSeen: providerDate(item.first_seen),
      lastSeen: providerDate(item.last_seen),
      isNew: item.is_new === true,
      isBroken: item.is_broken === true,
    })
  }
  return links
    .sort(
      (left, right) =>
        (right.domainRank ?? -1) - (left.domainRank ?? -1) ||
        (left.sourceUrl < right.sourceUrl ? -1 : 1),
    )
    .slice(0, BACKLINK_LIMIT)
}

function normalizeAnchors(value: unknown): DataForSeoAnchor[] {
  if (!Array.isArray(value)) return []
  const anchors: DataForSeoAnchor[] = []
  for (const item of value) {
    if (!isRecord(item)) continue
    anchors.push({
      anchor: text(item.anchor) ?? '',
      referringDomains: nonNegativeInteger(item.referring_domains),
      referringDomainsNofollow: nonNegativeInteger(
        item.referring_domains_nofollow,
      ),
      backlinks: nonNegativeInteger(item.backlinks),
    })
  }
  return anchors
    .sort(
      (left, right) =>
        (right.referringDomains ?? -1) - (left.referringDomains ?? -1) ||
        (left.anchor < right.anchor ? -1 : left.anchor > right.anchor ? 1 : 0),
    )
    .slice(0, ANCHOR_LIMIT)
}

function normalizeHistory(value: unknown): DataForSeoBacklinkMonth[] {
  if (!Array.isArray(value)) return []
  const byMonth = new Map<string, DataForSeoBacklinkMonth>()
  for (const item of value) {
    if (!isRecord(item)) continue
    const month = providerDate(item.date)?.slice(0, 7)
    if (!month || byMonth.has(month)) continue
    byMonth.set(month, {
      month,
      backlinks: nonNegativeInteger(item.backlinks),
      referringDomains: nonNegativeInteger(item.referring_domains),
      newReferringDomains: nonNegativeInteger(item.new_referring_domains),
      lostReferringDomains: nonNegativeInteger(item.lost_referring_domains),
    })
  }
  return [...byMonth.values()]
    .sort((left, right) => (left.month < right.month ? -1 : 1))
    .slice(-HISTORY_MONTHS)
}
