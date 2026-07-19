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
import { printJson, printSemanticReport } from '../utils.js'
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
  const status =
    report.summary.failed > 0
      ? 'fail'
      : report.summary.warnings > 0
        ? 'warning'
        : report.summary.unknown > 0
          ? 'unknown'
          : 'pass'
  printSemanticReport({
    title: 'AI agent readiness',
    target: report.url,
    status,
    summary: report.headline,
    metrics: [
      { label: 'Passed', value: report.summary.passed, status: 'pass' },
      {
        label: 'Review',
        value: report.summary.warnings,
        status: 'warning',
      },
      { label: 'Failed', value: report.summary.failed, status: 'fail' },
      { label: 'Unknown', value: report.summary.unknown, status: 'unknown' },
    ],
    sections: report.sections.map((section) => ({
      title: section.title,
      diagnostics: section.checks
        .filter((check) => !['info', 'notApplicable'].includes(check.status))
        .map((check) => ({
          status: check.status,
          title: check.title,
          explanation: check.plainEnglish,
          fix: check.status === 'pass' ? undefined : check.action,
          evidence: (check.urls ?? []).slice(0, 5),
        })),
    })),
    notes: [
      `Profile: ${report.profile}. Data: ${report.dataStatus}. Report: ${report.reportId}.`,
      ...report.caveats,
    ],
  })
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
