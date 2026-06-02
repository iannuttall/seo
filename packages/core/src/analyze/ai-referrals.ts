import { ga4RowsToObjects, runGa4Report } from '../ga4/client.js'

type AiSource = {
  id: string
  label: string
  patterns: string[]
}

const AI_SOURCES: AiSource[] = [
  { id: 'chatgpt', label: 'ChatGPT', patterns: ['chatgpt', 'openai'] },
  { id: 'perplexity', label: 'Perplexity', patterns: ['perplexity'] },
  { id: 'claude', label: 'Claude', patterns: ['claude', 'anthropic'] },
  { id: 'gemini', label: 'Gemini', patterns: ['gemini', 'bard.google'] },
  { id: 'copilot', label: 'Copilot', patterns: ['copilot.microsoft'] },
  { id: 'grok', label: 'Grok', patterns: ['grok', 'x.ai'] },
  { id: 'deepseek', label: 'DeepSeek', patterns: ['deepseek'] },
  { id: 'meta-ai', label: 'Meta AI', patterns: ['meta.ai'] },
  { id: 'you', label: 'You.com', patterns: ['you.com'] },
  { id: 'poe', label: 'Poe', patterns: ['poe.com'] },
  { id: 'phind', label: 'Phind', patterns: ['phind.com'] },
]

export type AiReferralReport = {
  property: string
  generatedAt: string
  range: {
    startDate: string
    endDate: string
  }
  summary: {
    sessions: number
    totalUsers: number
    eventCount: number
    sources: number
    landingPages: number
    verdict: string
    caveat: string
  }
  sources: Array<{
    source: string
    sessions: number
    totalUsers: number
    eventCount: number
    share: number
  }>
  landingPages: Array<{
    landingPage: string
    sessions: number
    totalUsers: number
    eventCount: number
    topSource: string
  }>
  daily: Array<{
    date: string
    sessions: number
    totalUsers: number
    eventCount: number
  }>
}

function sourceForRow(row: Record<string, string>): AiSource | undefined {
  const haystack = [
    row.sessionSource,
    row.sessionMedium,
    row.pageReferrer,
    row.landingPagePlusQueryString,
  ]
    .join(' ')
    .toLowerCase()

  return AI_SOURCES.find((source) =>
    source.patterns.some((pattern) => haystack.includes(pattern)),
  )
}

function addMetrics(
  current: { sessions: number; totalUsers: number; eventCount: number },
  row: Record<string, string>,
): void {
  current.sessions += Number(row.sessions) || 0
  current.totalUsers += Number(row.totalUsers) || 0
  current.eventCount += Number(row.eventCount) || 0
}

function sortableDate(value: string): string {
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
  }
  return value
}

export async function aiReferralsReport(input: {
  property: string
  startDate?: string
  endDate?: string
  limit?: number
}): Promise<AiReferralReport> {
  const startDate = input.startDate ?? '28daysAgo'
  const endDate = input.endDate ?? 'yesterday'
  const result = await runGa4Report(input.property, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [
      { name: 'date' },
      { name: 'sessionSource' },
      { name: 'sessionMedium' },
      { name: 'pageReferrer' },
      { name: 'landingPagePlusQueryString' },
    ],
    metrics: [
      { name: 'sessions' },
      { name: 'totalUsers' },
      { name: 'eventCount' },
    ],
    limit: input.limit ?? 10_000,
  })
  const rows = ga4RowsToObjects(result)
    .map((row) => ({ row, source: sourceForRow(row) }))
    .filter((item): item is { row: Record<string, string>; source: AiSource } =>
      Boolean(item.source),
    )

  const sourceTotals = new Map<
    string,
    { sessions: number; totalUsers: number; eventCount: number }
  >()
  const pageTotals = new Map<
    string,
    {
      sessions: number
      totalUsers: number
      eventCount: number
      sources: Map<string, number>
    }
  >()
  const dailyTotals = new Map<
    string,
    { sessions: number; totalUsers: number; eventCount: number }
  >()

  for (const { row, source } of rows) {
    const sourceTotal = sourceTotals.get(source.label) ?? {
      sessions: 0,
      totalUsers: 0,
      eventCount: 0,
    }
    addMetrics(sourceTotal, row)
    sourceTotals.set(source.label, sourceTotal)

    const landingPage = row.landingPagePlusQueryString || '(not set)'
    const pageTotal = pageTotals.get(landingPage) ?? {
      sessions: 0,
      totalUsers: 0,
      eventCount: 0,
      sources: new Map<string, number>(),
    }
    addMetrics(pageTotal, row)
    pageTotal.sources.set(
      source.label,
      (pageTotal.sources.get(source.label) ?? 0) + (Number(row.sessions) || 0),
    )
    pageTotals.set(landingPage, pageTotal)

    const day = sortableDate(row.date ?? '')
    const dailyTotal = dailyTotals.get(day) ?? {
      sessions: 0,
      totalUsers: 0,
      eventCount: 0,
    }
    addMetrics(dailyTotal, row)
    dailyTotals.set(day, dailyTotal)
  }

  const total = [...sourceTotals.values()].reduce(
    (sum, item) => ({
      sessions: sum.sessions + item.sessions,
      totalUsers: sum.totalUsers + item.totalUsers,
      eventCount: sum.eventCount + item.eventCount,
    }),
    { sessions: 0, totalUsers: 0, eventCount: 0 },
  )

  return {
    property: input.property,
    generatedAt: new Date().toISOString(),
    range: { startDate, endDate },
    summary: {
      ...total,
      sources: sourceTotals.size,
      landingPages: pageTotals.size,
      verdict: total.sessions
        ? 'Detected AI referral traffic in GA4.'
        : 'No AI referral traffic detected in GA4 for this period.',
      caveat:
        'GA4 only shows referrals that arrive with usable source/referrer data; some AI visits may appear as direct or unassigned.',
    },
    sources: [...sourceTotals.entries()]
      .map(([source, metrics]) => ({
        source,
        ...metrics,
        share: total.sessions ? metrics.sessions / total.sessions : 0,
      }))
      .sort((a, b) => b.sessions - a.sessions),
    landingPages: [...pageTotals.entries()]
      .map(([landingPage, metrics]) => ({
        landingPage,
        sessions: metrics.sessions,
        totalUsers: metrics.totalUsers,
        eventCount: metrics.eventCount,
        topSource:
          [...metrics.sources.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
          'unknown',
      }))
      .sort((a, b) => b.sessions - a.sessions),
    daily: [...dailyTotals.entries()]
      .map(([date, metrics]) => ({ date, ...metrics }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  }
}
