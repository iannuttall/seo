export type CrawlLimitProfileId =
  | 'local'
  | 'hosted_free'
  | 'hosted_starter'
  | 'hosted_pro'
  | 'hosted_enterprise'

export type CrawlLimitProfile = {
  id: CrawlLimitProfileId
  label: string
  paid: boolean
  maxPagesPerCrawl: number | null
  jsRenderPagesPerCrawl: number | null
  schedulesPerProject: number
  reportHistoryPerProject: number | null
  externalLinkChecksPerCrawl: number | null
  notes: string[]
}

export const CRAWLER_LIMIT_PROFILES: CrawlLimitProfile[] = [
  {
    id: 'local',
    label: 'Local',
    paid: false,
    maxPagesPerCrawl: null,
    jsRenderPagesPerCrawl: null,
    schedulesPerProject: 0,
    reportHistoryPerProject: null,
    externalLinkChecksPerCrawl: null,
    notes: [
      'Local mode is not a paid tier and should only enforce user-supplied crawl caps.',
      'No hosted schedules are available in local mode.',
    ],
  },
  {
    id: 'hosted_free',
    label: 'Hosted Free',
    paid: false,
    maxPagesPerCrawl: 100,
    jsRenderPagesPerCrawl: 0,
    schedulesPerProject: 0,
    reportHistoryPerProject: 10,
    externalLinkChecksPerCrawl: 200,
    notes: [
      'Designed for a small manual audit and API trial.',
      'JavaScript rendering and scheduled crawls stay paid-only.',
    ],
  },
  {
    id: 'hosted_starter',
    label: 'Hosted Starter',
    paid: true,
    maxPagesPerCrawl: 1_000,
    jsRenderPagesPerCrawl: 100,
    schedulesPerProject: 5,
    reportHistoryPerProject: 100,
    externalLinkChecksPerCrawl: 2_500,
    notes: ['Designed for small client sites and weekly technical checks.'],
  },
  {
    id: 'hosted_pro',
    label: 'Hosted Pro',
    paid: true,
    maxPagesPerCrawl: 10_000,
    jsRenderPagesPerCrawl: 1_000,
    schedulesPerProject: 50,
    reportHistoryPerProject: 1_000,
    externalLinkChecksPerCrawl: 25_000,
    notes: ['Designed for agencies and content-heavy sites.'],
  },
  {
    id: 'hosted_enterprise',
    label: 'Hosted Enterprise',
    paid: true,
    maxPagesPerCrawl: 100_000,
    jsRenderPagesPerCrawl: 10_000,
    schedulesPerProject: 500,
    reportHistoryPerProject: 10_000,
    externalLinkChecksPerCrawl: 250_000,
    notes: [
      'Designed for negotiated hosted/API contracts.',
      'Keep this profile configurable before enforcing it in production.',
    ],
  },
]

export function crawlLimitProfile(id: CrawlLimitProfileId): CrawlLimitProfile {
  const profile = CRAWLER_LIMIT_PROFILES.find((item) => item.id === id)
  if (!profile) throw new Error(`Unknown crawl limit profile: ${id}`)
  return profile
}
