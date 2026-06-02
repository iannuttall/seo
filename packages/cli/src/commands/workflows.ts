import {
  diagnosePropertyWorkflow,
  refreshPrioritiesWorkflow,
  technicalWatchWorkflow,
  updatePostmortemWorkflow,
} from '@seo/core'
import { defineCommand } from 'citty'
import { resolveClientSelection } from '../selection.js'
import { printJson, printKeyValue, printTable } from '../utils.js'

const stringArg = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined

const booleanArg = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined

const numberArg = (value: unknown): number | undefined => {
  if (typeof value === 'number') return value
  if (typeof value !== 'string' || !value.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const jsonFlag = (args: Record<string, unknown>): boolean => args.json === true

function urlList(value: unknown): string[] {
  const raw = stringArg(value)
  if (!raw) return []
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function startUrlForSite(site: string): string | undefined {
  if (site.startsWith('http://') || site.startsWith('https://')) return site
  if (site.startsWith('sc-domain:')) return `https://${site.slice(10)}/`
  return undefined
}

function printWorkflow(report: {
  workflow: string
  site: string
  summary: string
  steps: Array<{ tool: string; status: string; summary: string }>
  actions: Array<{ title: string; confidence: string; action: string }>
}): void {
  printKeyValue([
    ['Workflow', report.workflow],
    ['Property', report.site],
    ['Summary', report.summary],
  ])
  printTable(
    ['Tool', 'Status', 'Summary'],
    report.steps.map((step) => [step.tool, step.status, step.summary]),
  )
  if (report.actions.length) {
    printTable(
      ['Priority', 'Confidence', 'Action'],
      report.actions.map((action) => [
        action.title,
        action.confidence,
        action.action,
      ]),
    )
  }
}

export const diagnosePropertyWorkflowCommand = defineCommand({
  meta: {
    name: 'diagnose-property',
    description: 'Agent workflow for full property diagnosis and next actions',
  },
  args: {
    site: {
      type: 'string',
      description: 'GSC property URL, for example sc-domain:example.com.',
    },
    client: {
      type: 'string',
      description: 'Saved client id or name.',
    },
    days: {
      type: 'string',
      description: 'Diagnosis window length in days. Defaults to 90.',
    },
    recent: {
      type: 'string',
      description: 'Recent anomaly window in days. Defaults to 14.',
    },
    limit: {
      type: 'string',
      description: 'Maximum rows per section. Defaults to 10.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
    refresh: {
      type: 'boolean',
      default: false,
      description: 'Bypass local cache and fetch fresh data.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const selection = await resolveClientSelection({
      client: stringArg(args.client),
      site: stringArg(args.site),
      options: { json, refresh: booleanArg(args.refresh) },
    })
    const report = await diagnosePropertyWorkflow({
      site: selection.site,
      days: numberArg(args.days),
      recentDays: numberArg(args.recent),
      limit: numberArg(args.limit),
      refresh: booleanArg(args.refresh),
    })
    if (json) {
      printJson(report)
      return
    }
    process.stdout.write(`${report.output.narrative.markdown}\n\n`)
    printWorkflow(report)
  },
})

export const updatePostmortemCommand = defineCommand({
  meta: {
    name: 'update-postmortem',
    description: 'Agent workflow for Google update winner/loser analysis',
  },
  args: {
    site: {
      type: 'string',
      description: 'GSC property URL, for example sc-domain:example.com.',
    },
    client: {
      type: 'string',
      description: 'Saved client id or name.',
    },
    days: {
      type: 'string',
      description: 'Diagnosis window length in days. Defaults to 90.',
    },
    recent: {
      type: 'string',
      description: 'Recent anomaly window in days. Defaults to 14.',
    },
    limit: {
      type: 'string',
      description: 'Maximum winners/losers per segment. Defaults to 20.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
    refresh: {
      type: 'boolean',
      default: false,
      description: 'Bypass local cache and fetch fresh data.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const selection = await resolveClientSelection({
      client: stringArg(args.client),
      site: stringArg(args.site),
      options: { json, refresh: booleanArg(args.refresh) },
    })
    const report = await updatePostmortemWorkflow({
      site: selection.site,
      days: numberArg(args.days),
      recentDays: numberArg(args.recent),
      limit: numberArg(args.limit),
      refresh: booleanArg(args.refresh),
    })
    if (json) {
      printJson(report)
      return
    }
    printWorkflow(report)
    printTable(
      ['Direction', 'Page', 'Clicks'],
      [
        ...report.output.segments.page.winners.map((item) => [
          'winner',
          item.key,
          item.clickDelta,
        ]),
        ...report.output.segments.page.losers.map((item) => [
          'loser',
          item.key,
          item.clickDelta,
        ]),
      ],
    )
  },
})

export const technicalWatchCommand = defineCommand({
  meta: {
    name: 'technical-watch',
    description: 'Agent workflow for crawl-diff and index-watch monitoring',
  },
  args: {
    site: {
      type: 'string',
      description: 'GSC property URL, for example sc-domain:example.com.',
    },
    client: {
      type: 'string',
      description: 'Saved client id or name.',
    },
    url: {
      type: 'string',
      description:
        'Start URL to crawl. Defaults from the GSC property when possible.',
    },
    urls: {
      type: 'string',
      description: 'Comma-separated URLs to inspect with URL Inspection.',
    },
    limit: {
      type: 'string',
      description: 'Maximum pages to crawl. Defaults to 50.',
    },
    language: {
      type: 'string',
      description: 'Optional URL Inspection language code.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
    refresh: {
      type: 'boolean',
      default: false,
      description: 'Bypass local HTTP/GSC cache where supported.',
    },
    js: {
      type: 'boolean',
      default: false,
      description: 'Force JavaScript rendering when Playwright is installed.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const selection = await resolveClientSelection({
      client: stringArg(args.client),
      site: stringArg(args.site),
      options: { json, refresh: booleanArg(args.refresh) },
    })
    const watchUrls = urlList(args.urls)
    const startUrl =
      stringArg(args.url) ??
      selection.client?.startUrl ??
      startUrlForSite(selection.site)
    const report = await technicalWatchWorkflow({
      site: selection.site,
      startUrl,
      urls: watchUrls.length ? watchUrls : selection.client?.watchUrls,
      limit: numberArg(args.limit),
      languageCode: stringArg(args.language),
      refresh: booleanArg(args.refresh),
      js: booleanArg(args.js) ? true : 'auto',
    })
    if (json) {
      printJson(report)
      return
    }
    printWorkflow(report)
  },
})

export const refreshPrioritiesCommand = defineCommand({
  meta: {
    name: 'refresh-priorities',
    description: 'Agent workflow for a ranked SEO action queue',
  },
  args: {
    site: {
      type: 'string',
      description: 'GSC property URL, for example sc-domain:example.com.',
    },
    client: {
      type: 'string',
      description: 'Saved client id or name.',
    },
    days: {
      type: 'string',
      description: 'Diagnosis window length in days. Defaults to 90.',
    },
    recent: {
      type: 'string',
      description: 'Recent anomaly window in days. Defaults to 14.',
    },
    limit: {
      type: 'string',
      description: 'Maximum queue items to print. Defaults to 25.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
    refresh: {
      type: 'boolean',
      default: false,
      description: 'Bypass local cache and fetch fresh data.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const selection = await resolveClientSelection({
      client: stringArg(args.client),
      site: stringArg(args.site),
      options: { json, refresh: booleanArg(args.refresh) },
    })
    const report = await refreshPrioritiesWorkflow({
      site: selection.site,
      days: numberArg(args.days),
      recentDays: numberArg(args.recent),
      limit: numberArg(args.limit),
      refresh: booleanArg(args.refresh),
    })
    if (json) {
      printJson(report)
      return
    }
    printWorkflow(report)
    printTable(
      ['Source', 'Score', 'Target', 'Action'],
      report.output.queue.map((item) => [
        item.source,
        item.score,
        item.target,
        item.action,
      ]),
    )
  },
})
