import { crawlDiff, indexWatch } from '../monitoring.js'
import { workflowReport } from './report.js'
import type { WorkflowReport } from './types.js'

export async function technicalWatchWorkflow(input: {
  site: string
  startUrl?: string
  urls?: string[]
  limit?: number
  refresh?: boolean
  js?: boolean | 'auto'
  languageCode?: string
}): Promise<
  WorkflowReport<{
    crawl?: Awaited<ReturnType<typeof crawlDiff>>
    index?: Awaited<ReturnType<typeof indexWatch>>
  }>
> {
  if (!input.startUrl && !input.urls?.length) {
    throw new Error('Pass startUrl, urls, or both for technical-watch.')
  }

  const [crawl, index] = await Promise.all([
    input.startUrl
      ? crawlDiff({
          site: input.site,
          startUrl: input.startUrl,
          limit: input.limit,
          refresh: input.refresh,
          js: input.js,
        })
      : undefined,
    input.urls?.length
      ? indexWatch({
          site: input.site,
          urls: input.urls,
          languageCode: input.languageCode,
        })
      : undefined,
  ])

  const alertCount =
    (crawl?.summary.newErrors ?? 0) +
    (crawl?.summary.indexabilityFlips ?? 0) +
    (index?.summary.alerts ?? 0)

  return workflowReport({
    workflow: 'technical-watch',
    site: input.site,
    summary: `${alertCount} material technical alert(s) found.`,
    steps: [
      {
        tool: 'seo_crawl_diff',
        status: crawl ? 'completed' : 'skipped',
        summary: crawl
          ? `Crawled ${crawl.summary.crawled} URLs; ${crawl.summary.changed} changed.`
          : 'No start URL passed.',
      },
      {
        tool: 'seo_index_watch',
        status: index ? 'completed' : 'skipped',
        summary: index
          ? `Inspected ${index.summary.inspected} URLs; ${index.summary.alerts} alerts.`
          : 'No inspection URLs passed.',
      },
    ],
    actions:
      alertCount > 0
        ? [
            {
              title: 'Triage technical alerts',
              action:
                'Prioritize new status errors, indexability flips, and URL Inspection alerts before content work.',
              confidence: 'high',
            },
          ]
        : [
            {
              title: 'No material technical alert',
              action:
                'Keep the saved crawl and index snapshots for the next run.',
              confidence: 'medium',
            },
          ],
    output: { crawl, index },
  })
}
