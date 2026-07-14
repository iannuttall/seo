import {
  type CrawlReport,
  diagnosePropertyWorkflow,
  resolveTechnicalBaseline,
  reviewObservations,
  SeoError,
  type TechnicalBaseline,
  topFixes,
} from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  defaultTrueBooleanArg,
  jsonFlag,
  negatedBooleanArg,
  numberArg,
  projectArg,
  stringArg,
} from '../../args.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson, printTable } from '../../utils.js'
import { truncate } from '../output.js'
import { cliReportArgs } from '../report-options.js'
import { startUrlForSite } from '../shared.js'
import { printWorkflow } from './output.js'

type DiagnoseWorkflowReport = Awaited<
  ReturnType<typeof diagnosePropertyWorkflow>
>

function compactMainReportJson(
  report: DiagnoseWorkflowReport,
  workflowName?: string,
) {
  const { narrative } = report.output
  const { diagnosis } = narrative

  return {
    ...report,
    ...(workflowName ? { workflow: workflowName } : {}),
    output: {
      narrative: {
        site: narrative.site,
        generatedAt: narrative.generatedAt,
        dataStatus: narrative.dataStatus,
        periodDays: narrative.periodDays,
        period: narrative.period,
        headline: narrative.headline,
        caveats: narrative.caveats,
        sections: narrative.sections,
        priorities: narrative.priorities,
        diagnosis: {
          site: diagnosis.site,
          generatedAt: diagnosis.generatedAt,
          dataStatus: diagnosis.dataStatus,
          summary: diagnosis.summary,
          skippedSections: diagnosis.skippedSections,
          partialReasons: diagnosis.partialReasons,
          priorities: diagnosis.priorities,
        },
      },
    },
  }
}

function shellArg(value: string): string {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) {
    return value
  }
  return `'${value.replaceAll("'", "'\\''")}'`
}

function siteForDirectUrl(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    throw new SeoError('INVALID_INPUT', 'Pass a valid absolute URL with --url.')
  }
}

function addFollowup(
  commands: Array<{ command: string; why: string }>,
  command: string,
  why: string,
): void {
  if (commands.some((item) => item.command === command)) {
    return
  }
  commands.push({ command, why })
}

function crawlDataSourceLines(
  dataSources: CrawlReport['dataSources'],
): string[] {
  if (!dataSources) return []

  const sourceLine = (input: {
    label: string
    status: string
    joinedPages: number
    totalPages: number
    window?: { days: number }
    warning?: string
  }): string => {
    const range = input.window ? ` in the last ${input.window.days} days` : ''
    const coverage = `for ${input.joinedPages} of ${input.totalPages} crawled URLs`

    if (input.status === 'skipped') return `${input.label}: not connected.`
    if (input.status === 'unavailable') {
      return `${input.label}: unavailable. ${input.warning ?? 'No data was joined.'}`
    }
    if (input.status === 'partial') {
      return `${input.label}: partial data ${coverage}${range}. ${input.warning ?? ''}`.trim()
    }
    if (input.status === 'none') {
      return `${input.label}: no matching crawled URLs${range}.`
    }
    return `${input.label}: joined ${coverage}${range}.`
  }

  return [
    sourceLine({
      label: 'Search Console',
      status: dataSources.searchConsole.status,
      joinedPages: Math.max(
        dataSources.searchConsole.joinedMetricPages,
        dataSources.searchConsole.joinedQueryPages,
      ),
      totalPages: dataSources.searchConsole.totalPages,
      window: dataSources.searchConsole.window,
      warning: dataSources.searchConsole.warning,
    }),
    sourceLine({
      label: 'GA4',
      status: dataSources.analytics.status,
      joinedPages: dataSources.analytics.joinedPages,
      totalPages: dataSources.analytics.totalPages,
      window: dataSources.analytics.window,
      warning: dataSources.analytics.warning,
    }),
  ]
}

function technicalSection(baseline: TechnicalBaseline) {
  const report = baseline.report
  if (!report) {
    return {
      status: baseline.status,
      ...(baseline.reason ? { reason: baseline.reason } : {}),
    }
  }
  return {
    status: baseline.status,
    ...(baseline.reason ? { reason: baseline.reason } : {}),
    reportId: report.id,
    generatedAt: report.generatedAt,
    crawlStatus: report.status,
    capped: report.summary.pageLimitReached,
    maxPages: report.config.maxPages,
    searchDataJoined:
      (report.dataSources?.searchConsole.joinedMetricPages ?? 0) > 0 ||
      (report.dataSources?.searchConsole.joinedQueryPages ?? 0) > 0,
    dataSources: report.dataSources,
    summary: report.summary,
    topFixes: topFixes(report, { limit: 5 }),
    reviewObservations: reviewObservations(report, { limit: 5 }),
  }
}

function compactTechnicalFinding(finding: ReturnType<typeof topFixes>[number]) {
  return {
    ruleId: finding.ruleId,
    title: finding.title,
    category: finding.category,
    severity: finding.severity,
    recommendation: finding.recommendation,
    count: finding.count,
    sampleUrls: finding.sampleUrls.slice(0, 3),
    score: finding.score,
    scoreFactors: finding.scoreFactors,
    whyThisRanks: finding.whyThisRanks,
    detailsCommand: `seo explain --rule ${finding.ruleId}`,
  }
}

function compactTechnicalSection(section: ReturnType<typeof technicalSection>) {
  if (!('topFixes' in section)) return section

  return {
    ...section,
    topFixes: section.topFixes.slice(0, 3).map(compactTechnicalFinding),
    reviewObservations: section.reviewObservations
      .slice(0, 3)
      .map(compactTechnicalFinding),
  }
}

function printTechnicalSection(
  section: ReturnType<typeof technicalSection>,
  options: { providerFree?: boolean } = {},
): void {
  if (!('topFixes' in section)) {
    process.stdout.write(
      `\nTechnical crawl evidence: ${section.reason ?? section.status}\n`,
    )
    return
  }

  const coverage = section.status === 'reused' ? 'saved' : 'new'
  process.stdout.write(`\nTechnical crawl evidence (${coverage})\n`)
  if (section.reason) process.stdout.write(`${section.reason}\n`)
  if (section.capped) {
    process.stdout.write(
      `Coverage is capped at ${section.maxPages} pages. Run \`seo crawl\` for a broader investigation.\n`,
    )
  }
  if (!options.providerFree) {
    for (const line of crawlDataSourceLines(section.dataSources)) {
      process.stdout.write(`${line}\n`)
    }
  }
  if (!section.topFixes.length) {
    process.stdout.write('No prioritised technical fixes were found.\n')
    if (section.reviewObservations.length) {
      process.stdout.write(
        `${section.reviewObservations.length} review observation${section.reviewObservations.length === 1 ? '' : 's'} need confirmation before they become implementation work.\n`,
      )
    }
    return
  }
  process.stdout.write(
    options.providerFree
      ? '\nPrioritised technical fixes\n'
      : section.searchDataJoined
        ? '\nTechnical fixes with search value\n'
        : '\nTechnical fixes (no Search Console data joined)\n',
  )
  if (!section.searchDataJoined) {
    printTable(
      ['#', 'Rule', 'Severity', 'Affected URLs', 'Verify'],
      section.topFixes.map((fix, index) => [
        index + 1,
        fix.ruleId,
        fix.severity,
        fix.count,
        truncate(fix.howToVerify, 72),
      ]),
    )
  } else {
    printTable(
      ['Score', 'Rule', 'Severity', 'Search value', 'Verify'],
      section.topFixes.map((fix) => [
        fix.score,
        fix.ruleId,
        fix.severity,
        `${fix.scoreFactors.clicks} clicks / ${fix.scoreFactors.sessions} sessions / ${fix.scoreFactors.conversions} conv.`,
        truncate(fix.howToVerify, 72),
      ]),
    )
  }
  if (section.reviewObservations.length) {
    process.stdout.write(
      `\n${section.reviewObservations.length} review observation${section.reviewObservations.length === 1 ? '' : 's'} were kept out of this action queue.\n`,
    )
  }
}

function printSkippedProviderSections(
  section: ReturnType<typeof technicalSection>,
): void {
  process.stdout.write('\nProvider-backed sections skipped\n')
  const observedLines =
    'dataSources' in section ? crawlDataSourceLines(section.dataSources) : []
  const lines = observedLines.length
    ? observedLines
    : ['Search Console: not connected.', 'GA4: not connected.']
  for (const line of lines) {
    process.stdout.write(`${line}\n`)
  }
  process.stdout.write(
    'Run `seo start` when you want traffic, query, ranking, and analytics evidence added to the report.\n',
  )
}

function technicalFirstSummary(
  section: ReturnType<typeof technicalSection>,
): string {
  if (!('topFixes' in section)) {
    return `Technical crawl evidence was ${section.status}. Search Console and GA4 sections were skipped because they are not connected.`
  }

  const source = section.status === 'reused' ? 'Loaded' : 'Completed'
  const pages = section.summary.crawledUrls
  return `${source} a technical crawl of ${pages} ${pages === 1 ? 'page' : 'pages'}. Search Console and GA4 sections were skipped because they are not connected.`
}

function technicalWorkflowStep(section: ReturnType<typeof technicalSection>): {
  tool: string
  status: 'completed' | 'skipped'
  summary: string
} {
  if (!('topFixes' in section)) {
    return {
      tool: 'seo_crawl',
      status: 'skipped',
      summary:
        section.reason ?? `Technical crawl evidence was ${section.status}.`,
    }
  }

  const pages = section.summary.crawledUrls
  return {
    tool: 'seo_crawl',
    status: 'completed',
    summary: `${section.status === 'reused' ? 'Loaded' : 'Completed'} technical evidence for ${pages} crawled ${pages === 1 ? 'page' : 'pages'}.`,
  }
}

export function reportFollowups(
  report: DiagnoseWorkflowReport,
  input: {
    crawlStartUrl?: string
    projectId?: string
    technicalBaselineStatus?: TechnicalBaseline['status']
    searchDataAvailable?: boolean
  } = {},
) {
  if (input.searchDataAvailable === false) {
    const commands: Array<{ command: string; why: string }> = []
    if (
      input.crawlStartUrl &&
      input.technicalBaselineStatus !== 'created' &&
      input.technicalBaselineStatus !== 'refreshed' &&
      input.technicalBaselineStatus !== 'reused'
    ) {
      addFollowup(
        commands,
        `seo crawl --url ${shellArg(input.crawlStartUrl)} --save`,
        'Create the technical crawl that this report needs before opening a page-level follow-up.',
      )
    } else if (input.crawlStartUrl) {
      addFollowup(
        commands,
        `seo audit-page --url ${shellArg(input.crawlStartUrl)}`,
        'Inspect one important page in detail after the site-level crawl.',
      )
    }
    addFollowup(
      commands,
      'seo start',
      'Connect Search Console when you want traffic, query, and ranking evidence alongside the crawl.',
    )
    return commands
  }

  const identity = input.projectId
    ? `--project ${shellArg(input.projectId)}`
    : `--site ${shellArg(report.site)}`
  const diagnosis = report.output.narrative.diagnosis
  const days = diagnosis.decay.rangeDays
  const commands: Array<{ command: string; why: string }> = []
  const skippedNames = new Set(
    (diagnosis.skippedSections ?? []).map((section) => section.section),
  )

  addFollowup(
    commands,
    `seo refresh-priorities ${identity} --days ${days} --verify-content --limit 25`,
    'Turn the report into a ranked action queue with content checks.',
  )

  if (diagnosis.decay.summary.eligibleRows > 0) {
    addFollowup(
      commands,
      `seo decaying ${identity} --days ${days} --limit 25`,
      'Inspect query/page declines observed in both retained-row windows.',
    )
  }

  if (diagnosis.cannibalization.items.length > 0) {
    addFollowup(
      commands,
      `seo cannibal ${identity} --days ${days} --limit 25`,
      'Find queries split across competing URLs.',
    )
  }

  if (diagnosis.quickWins.summary.eligibleRows > 0) {
    addFollowup(
      commands,
      `seo quick-wins ${identity} --days ${days} --verify-content --verify-limit 5`,
      'Review average-position rows below their heuristic CTR target with optional page evidence.',
    )
  }

  if (diagnosis.strikingDistance.summary.eligibleRows > 0) {
    addFollowup(
      commands,
      `seo second-page ${identity} --days ${days} --verify-content --verify-limit 5`,
      'Work pages sitting just outside page-one rankings.',
    )
  }

  if (
    skippedNames.has('traffic anomaly') ||
    skippedNames.has('update correlation')
  ) {
    addFollowup(
      commands,
      `seo quick-wins ${identity} --days ${days} --min-impressions 10 --verify-content --verify-limit 5`,
      'Sparse GSC data: lower thresholds and look for early content wins.',
    )
    addFollowup(
      commands,
      `seo second-page ${identity} --days ${days} --min-impressions 10 --verify-content --verify-limit 5`,
      'Sparse GSC data: inspect early second-page opportunities.',
    )
  }

  const topMovedPage = diagnosis.segments.page.items.find((item) =>
    item.key.startsWith('http'),
  )
  if (topMovedPage) {
    addFollowup(
      commands,
      `seo audit-page --url ${shellArg(topMovedPage.key)}`,
      'Audit the biggest moved URL for title, metadata, links, and schema.',
    )
  }

  if (
    input.crawlStartUrl &&
    input.technicalBaselineStatus !== 'created' &&
    input.technicalBaselineStatus !== 'refreshed' &&
    input.technicalBaselineStatus !== 'reused'
  ) {
    addFollowup(
      commands,
      `seo crawl --url ${shellArg(input.crawlStartUrl)} ${identity} --save`,
      'Create the first technical crawler baseline with plain-English fixes and JSON-ready issue data.',
    )
  }

  addFollowup(
    commands,
    `seo technical-watch ${identity} --limit 50`,
    'Save a crawl/index baseline so future reports can flag technical drift.',
  )

  return commands.slice(0, 6)
}

function printReportFollowups(
  commands: Array<{ command: string; why: string }>,
): void {
  if (!commands.length) {
    return
  }
  process.stdout.write('\nRecommended next commands\n')
  printTable(
    ['Command', 'Why'],
    commands.map((item) => [item.command, item.why]),
  )
}

function printTechnicalOnlyIntro(site: string): void {
  process.stdout.write(`# Technical SEO report: ${site}\n\n`)
}

function workflowCommandMeta(input: {
  name: string
  description: string
  workflowName?: string
  printFollowups?: boolean
}) {
  return defineCommand({
    meta: input,
    args: {
      site: {
        type: 'string',
        description: 'GSC property URL, for example sc-domain:example.com.',
      },
      ...(input.printFollowups
        ? {
            url: {
              type: 'string' as const,
              description:
                'Crawl URL for a technical-only report. Search Console analyses are skipped unless you also pass --site or --project.',
            },
          }
        : {}),
      client: {
        type: 'string',
        description: 'Legacy alias for --project.',
      },
      project: {
        type: 'string',
        description: 'Saved project id or name.',
      },
      ...cliReportArgs(
        ['days', 'recentDays', 'limit', 'includeBrand', 'refresh'],
        {
          days: {
            description: 'Search performance window in days. Defaults to 90.',
          },
          limit: {
            description: 'Maximum rows per section. Defaults to 10.',
          },
        },
      ),
      ...(input.printFollowups
        ? {
            crawl: defaultTrueBooleanArg(
              'Create or reuse a bounded technical crawl before the report.',
              'Skip technical crawl evidence for this report.',
            ),
            'crawl-max-pages': {
              type: 'string' as const,
              description:
                'Maximum pages for the report crawl. Defaults to 100.',
            },
            'crawl-max-depth': {
              type: 'string' as const,
              description:
                'Maximum link depth for the report crawl. Defaults to 4.',
            },
            full: {
              type: 'boolean' as const,
              default: false,
              description:
                'Include the full report in JSON output. Default JSON is a compact summary for agents.',
            },
          }
        : {}),
      json: {
        type: 'boolean',
        default: false,
        description: 'Print machine-readable JSON.',
      },
    },
    run: async ({ args }) => {
      const json = jsonFlag(args)
      const full = input.printFollowups && booleanArg(args.full)
      const project = projectArg(args)
      const explicitSite = stringArg(args.site)
      const directUrl = input.printFollowups ? stringArg(args.url) : undefined
      const useSearchData = Boolean(project || explicitSite || !directUrl)
      const selection = useSearchData
        ? await resolveClientSelection({
            client: project,
            site: explicitSite,
            options: { json, refresh: booleanArg(args.refresh) },
          })
        : undefined
      const site = selection?.site ?? siteForDirectUrl(directUrl ?? '')
      const report = await diagnosePropertyWorkflow({
        site,
        days: numberArg(args.days),
        recentDays: numberArg(args.recent),
        limit: numberArg(args.limit),
        brandTerms: selection?.client?.brandTerms,
        includeBrand: booleanArg(args['include-brand']),
        refresh: booleanArg(args.refresh),
        skipSearchData: !useSearchData,
      })
      const outputReport = input.workflowName
        ? { ...report, workflow: input.workflowName }
        : report
      const technicalBaseline = input.printFollowups
        ? await resolveTechnicalBaseline({
            site,
            searchSite: selection?.site,
            url:
              directUrl ?? selection?.client?.startUrl ?? startUrlForSite(site),
            projectId: selection?.client?.id,
            ga4PropertyId: selection?.client?.ga4PropertyId,
            crawl: !negatedBooleanArg(args, 'crawl'),
            refresh: booleanArg(args.refresh),
            maxPages: numberArg(args['crawl-max-pages']),
            maxDepth: numberArg(args['crawl-max-depth']),
          })
        : undefined
      const technicalCrawl = technicalBaseline
        ? technicalSection(technicalBaseline)
        : undefined
      const followups = input.printFollowups
        ? reportFollowups(outputReport, {
            crawlStartUrl:
              directUrl ?? selection?.client?.startUrl ?? startUrlForSite(site),
            projectId: selection?.client?.id,
            technicalBaselineStatus: technicalBaseline?.status,
            searchDataAvailable: useSearchData,
          })
        : undefined
      if (json) {
        const jsonReport =
          input.printFollowups && !full
            ? compactMainReportJson(report, input.workflowName)
            : outputReport
        const reportWithTechnicalEvidence =
          !useSearchData && technicalCrawl
            ? {
                ...jsonReport,
                summary: technicalFirstSummary(technicalCrawl),
                steps: [
                  technicalWorkflowStep(technicalCrawl),
                  ...jsonReport.steps,
                ],
              }
            : jsonReport
        printJson(
          technicalCrawl || followups
            ? {
                ...reportWithTechnicalEvidence,
                ...(input.printFollowups
                  ? { detail: full ? 'full' : 'summary' }
                  : {}),
                ...(technicalCrawl
                  ? {
                      technicalCrawl:
                        input.printFollowups && !full
                          ? compactTechnicalSection(technicalCrawl)
                          : technicalCrawl,
                    }
                  : {}),
                ...(followups ? { nextCommands: followups } : {}),
              }
            : jsonReport,
        )
        return
      }
      if (useSearchData) {
        process.stdout.write(`${outputReport.output.narrative.markdown}\n\n`)
        printWorkflow(outputReport)
      } else {
        printTechnicalOnlyIntro(site)
      }
      if (technicalCrawl) {
        printTechnicalSection(technicalCrawl, { providerFree: !useSearchData })
        if (!useSearchData) printSkippedProviderSections(technicalCrawl)
      }
      if (followups) printReportFollowups(followups)
    },
  })
}

export const diagnosePropertyWorkflowCommand = workflowCommandMeta({
  name: 'diagnose-property',
  description: 'Find what changed in Google Search and what to inspect next',
})

export const mainReportCommand = workflowCommandMeta({
  name: 'report',
  workflowName: 'report',
  printFollowups: true,
  description:
    'Run the main SEO report and recommend the next best follow-up commands',
})
