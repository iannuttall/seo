import { shouldExcludeBrandQuery } from '../brand.js'
import { querySearchAnalytics } from '../gsc/client.js'
import { defaultDateRange, normalizeText } from './shared.js'

export type CommunityIntentReport = {
  site: string
  generatedAt: string
  rangeDays: number
  summary: {
    items: number
    totalImpressions: number
    totalClicks: number
  }
  items: Array<{
    query: string
    intent: string
    clicks: number
    impressions: number
    position: number
    action: string
  }>
}

const INTENT_PATTERNS: Array<{
  intent: string
  patterns: RegExp[]
  action: string
}> = [
  {
    intent: 'forum/reddit',
    patterns: [/\breddit\b/, /\bforum\b/, /\bforums\b/],
    action:
      'Review the community discussion angle and add a practical, experience-led answer section if your page does not cover it.',
  },
  {
    intent: 'comparison',
    patterns: [/\bvs\b/, /\bversus\b/, /\balternative\b/, /\balternatives\b/],
    action:
      'Add comparison framing with clear tradeoffs, alternatives, and when each option fits.',
  },
  {
    intent: 'reviews',
    patterns: [/\breviews?\b/, /\bcomplaints?\b/, /\bworth it\b/],
    action:
      'Add proof-led review framing: pros, cons, caveats, and what real users should check before deciding.',
  },
  {
    intent: 'experience',
    patterns: [/\breal\b/, /\bexperience\b/, /\bpeople say\b/, /\buser\b/],
    action:
      'Add lived-experience style answers, examples, or first-party evidence rather than generic summary copy.',
  },
  {
    intent: 'recommendation',
    patterns: [/\bbest\b/, /\brecommend(ed|ation|ations)?\b/, /\btop\b/],
    action:
      'Make selection criteria explicit and explain why your recommendation fits different use cases.',
  },
]

export function classifyCommunityIntent(query: string):
  | {
      intent: string
      action: string
    }
  | undefined {
  const normalized = normalizeText(query)
  const match = INTENT_PATTERNS.find((pattern) =>
    pattern.patterns.some((regex) => regex.test(normalized)),
  )
  return match ? { intent: match.intent, action: match.action } : undefined
}

export async function communityIntentReport(input: {
  site: string
  days?: number
  limit?: number
  minImpressions?: number
  brandTerms?: string[]
  includeBrand?: boolean
  refresh?: boolean
}): Promise<CommunityIntentReport> {
  const days = input.days ?? 28
  const range = defaultDateRange(days)
  const { rows } = await querySearchAnalytics(
    input.site,
    {
      ...range,
      dimensions: ['query'],
      type: 'web',
      dataState: 'final',
    },
    { refresh: input.refresh },
  )

  const items = rows
    .map((row) => ({
      query: row.keys[0] ?? '',
      clicks: row.clicks,
      impressions: row.impressions,
      position: row.position,
      classified: classifyCommunityIntent(row.keys[0] ?? ''),
    }))
    .filter(
      (
        item,
      ): item is {
        query: string
        clicks: number
        impressions: number
        position: number
        classified: { intent: string; action: string }
      } =>
        Boolean(item.query) &&
        Boolean(item.classified) &&
        item.impressions >= (input.minImpressions ?? 20) &&
        !shouldExcludeBrandQuery({
          query: item.query,
          siteUrl: input.site,
          brandTerms: input.brandTerms,
          includeBrand: input.includeBrand,
        }),
    )
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, input.limit ?? 25)
    .map((item) => ({
      query: item.query,
      intent: item.classified.intent,
      clicks: item.clicks,
      impressions: item.impressions,
      position: item.position,
      action: item.classified.action,
    }))

  return {
    site: input.site,
    generatedAt: new Date().toISOString(),
    rangeDays: days,
    summary: {
      items: items.length,
      totalImpressions: items.reduce((sum, item) => sum + item.impressions, 0),
      totalClicks: items.reduce((sum, item) => sum + item.clicks, 0),
    },
    items,
  }
}
