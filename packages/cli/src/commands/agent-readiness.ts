import { type AgentReadinessReport, agentReadiness, crawlSite } from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  fetchRateArg,
  jsonFlag,
  numberArg,
  projectArg,
  stringArg,
} from '../args.js'
import { resolveClientSelection } from '../selection.js'
import { printJson, printKeyValue, printTable } from '../utils.js'
import { printNotes, truncate } from './output.js'
import { resolveSavedCrawlReport } from './readiness.js'

function inputUrl(args: Record<string, unknown>): string | undefined {
  const positional = stringArg(args.agentReadinessUrl)
  const flagged = stringArg(args.url)
  if (positional && flagged && positional !== flagged) {
    throw new Error('Use either the positional URL or --url, not both.')
  }
  return positional ?? flagged
}

function printAgentReadiness(report: AgentReadinessReport): void {
  process.stdout.write(`AI agent readiness for ${report.url}\n\n`)
  printKeyValue([
    ['Profile', report.profile],
    ['Assessment', 'evidence only'],
    ['Data', report.dataStatus],
    ['Report', report.reportId],
    ['Passed', String(report.summary.passed)],
    ['Needs review', String(report.summary.warnings)],
    ['Failed', String(report.summary.failed)],
    ['Unknown', String(report.summary.unknown)],
    ['Information', String(report.summary.information)],
  ])
  process.stdout.write(`\n${report.headline}\n`)

  process.stdout.write('\nProfile scope\n')
  printTable(
    ['Profile', 'Status', 'Reason'],
    Object.entries(report.profileApplicability).map(([profile, value]) => [
      profile,
      value.status === 'notApplicable' ? 'not applicable' : value.status,
      truncate(value.reason, 96),
    ]),
  )

  if (report.topActions.length) {
    process.stdout.write('\nWhat to check next\n')
    printTable(
      ['Status', 'Check', 'Action'],
      report.topActions.map((action) => [
        action.status,
        action.title,
        truncate(action.action, 96),
      ]),
    )
  }

  printNotes('Caveats', report.caveats)
}

export const agentReadinessCommand = defineCommand({
  meta: {
    name: 'agent-readiness',
    description:
      'Check content-site access, Markdown alternatives, discovery, and identity for AI agents',
  },
  args: {
    agentReadinessUrl: {
      type: 'positional',
      required: false,
      description: 'Public site URL to check.',
    },
    url: {
      type: 'string',
      description: 'Public site URL to check.',
    },
    'report-id': {
      type: 'string',
      description: 'Saved crawl report id to analyze without fetching again.',
    },
    site: {
      type: 'string',
      description: 'GSC property URL for selecting the latest saved crawl.',
    },
    client: {
      type: 'string',
      description: 'Legacy alias for --project.',
    },
    project: {
      type: 'string',
      description: 'Saved project id or name.',
    },
    'max-pages': {
      type: 'string',
      description: 'Maximum public HTML pages to crawl.',
    },
    'fetch-interval-cap': {
      type: 'string',
      description: 'Maximum page fetches per interval per host.',
    },
    'fetch-interval-ms': {
      type: 'string',
      description: 'Fetch rate interval in milliseconds.',
    },
    refresh: {
      type: 'boolean',
      default: false,
      description: 'Bypass local HTTP cache and fetch fresh pages.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const url = inputUrl(args)
    const reportId = stringArg(args['report-id'])
    if (url && reportId) {
      throw new Error('Use either a URL or --report-id, not both.')
    }

    const crawl = url
      ? await (async () => {
          const project = projectArg(args)
          const site = stringArg(args.site)
          const selection =
            project || site
              ? await resolveClientSelection({
                  client: project,
                  site,
                  options: { json },
                })
              : undefined
          return crawlSite({
            url,
            projectId: selection?.client?.id,
            site: selection?.site,
            maxPages: numberArg(args['max-pages']),
            fetchRate: fetchRateArg(args),
            refresh: booleanArg(args.refresh),
            checkAgentDiscovery: true,
            useSitemap: true,
            checkExternal: false,
          })
        })()
      : await resolveSavedCrawlReport(args, { json })
    const readiness = agentReadiness(crawl)
    if (json) {
      printJson(readiness)
      return
    }
    printAgentReadiness(readiness)
  },
})
