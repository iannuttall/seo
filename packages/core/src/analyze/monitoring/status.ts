import { countLabel } from '../../phrasing.js'
import { latestCrawlSummaries } from './crawl-store.js'
import { latestIndexWatchSummary } from './index-watch.js'
import { latestLinkRecoverSummary } from './link-recover-store.js'

type CheckStatus = 'clear' | 'attention' | 'stale' | 'not-run'

export type MonitoringStatusCheck = {
  name: 'crawl' | 'index' | 'link-recovery'
  status: CheckStatus
  lastRunAt?: string
  summary: string
  action?: string
}

export type MonitoringStatusReport = {
  site: string
  generatedAt: string
  health: CheckStatus
  summary: {
    checks: number
    attention: number
    stale: number
    notRun: number
  }
  checks: MonitoringStatusCheck[]
}

function isStale(date: string | undefined, staleAfterDays: number): boolean {
  if (!date) return false
  const timestamp = Date.parse(date)
  if (!Number.isFinite(timestamp)) return false
  return Date.now() - timestamp > staleAfterDays * 86_400_000
}

function rollupStatus(checks: MonitoringStatusCheck[]): CheckStatus {
  if (checks.some((check) => check.status === 'attention')) return 'attention'
  if (checks.some((check) => check.status === 'stale')) return 'stale'
  if (checks.some((check) => check.status === 'not-run')) return 'not-run'
  return 'clear'
}

export function monitoringStatus(input: {
  site: string
  staleAfterDays?: number
}): MonitoringStatusReport {
  const staleAfterDays = input.staleAfterDays ?? 8
  const crawl = latestCrawlSummaries(input.site, 1)[0]
  const index = latestIndexWatchSummary(input.site)
  const recovery = latestLinkRecoverSummary(input.site)
  const checks: MonitoringStatusCheck[] = []

  if (!crawl) {
    checks.push({
      name: 'crawl',
      status: 'not-run',
      summary: 'No saved crawl-diff run.',
      action: 'Run monitoring with a start URL to establish a crawl baseline.',
    })
  } else {
    const attention = crawl.highPriorityRecommendations > 0
    checks.push({
      name: 'crawl',
      status: attention
        ? 'attention'
        : isStale(crawl.createdAt, staleAfterDays)
          ? 'stale'
          : 'clear',
      lastRunAt: crawl.createdAt,
      summary: `${countLabel(crawl.urlCount, 'URL')}, ${countLabel(crawl.statusErrors, 'status error')}, ${crawl.nonIndexable} non-indexable, ${countLabel(crawl.highPriorityRecommendations, 'high-priority action')}.`,
      action: attention
        ? (crawl.topRecommendation?.action ??
          'Review the saved crawl recommendations.')
        : undefined,
    })
  }

  if (!index.latestInspectedAt) {
    checks.push({
      name: 'index',
      status: 'not-run',
      summary: 'No saved URL Inspection snapshot.',
      action:
        'Run monitoring with URLs or sitemaps to establish index status history.',
    })
  } else {
    const attention = index.nonPass > 0 || index.blocked > 0
    checks.push({
      name: 'index',
      status: attention
        ? 'attention'
        : isStale(index.latestInspectedAt, staleAfterDays)
          ? 'stale'
          : 'clear',
      lastRunAt: index.latestInspectedAt,
      summary: `${countLabel(index.inspectedUrls, 'URL')} tracked, ${countLabel(index.nonPass, 'non-PASS verdict')}, ${countLabel(index.blocked, 'blocked signal')}.`,
      action: attention
        ? 'Review non-PASS and blocked URL Inspection results before content changes.'
        : undefined,
    })
  }

  if (!recovery) {
    checks.push({
      name: 'link-recovery',
      status: 'not-run',
      summary: 'No saved link-recover run.',
      action:
        'Run monitoring with link recovery enabled to find search-value URLs that now fail.',
    })
  } else {
    const attention = recovery.high > 0 || recovery.medium > 0
    checks.push({
      name: 'link-recovery',
      status: attention
        ? 'attention'
        : isStale(recovery.createdAt, staleAfterDays)
          ? 'stale'
          : 'clear',
      lastRunAt: recovery.createdAt,
      summary: `${countLabel(recovery.checked, 'URL')} checked, ${recovery.recoverable} recoverable, ${recovery.high} high severity, ${recovery.clicksAtRisk.toFixed(0)} clicks at risk.`,
      action: attention
        ? (recovery.topAction ?? 'Fix recoverable search-value URL issues.')
        : undefined,
    })
  }

  return {
    site: input.site,
    generatedAt: new Date().toISOString(),
    health: rollupStatus(checks),
    summary: {
      checks: checks.length,
      attention: checks.filter((check) => check.status === 'attention').length,
      stale: checks.filter((check) => check.status === 'stale').length,
      notRun: checks.filter((check) => check.status === 'not-run').length,
    },
    checks,
  }
}
