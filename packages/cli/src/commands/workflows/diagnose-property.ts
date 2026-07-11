import {
  diagnosePropertyWorkflow,
  resolveTechnicalBaseline,
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
    summary: report.summary,
    topFixes: topFixes(report, { limit: 5 }),
  }
}

function printTechnicalSection(
  section: ReturnType<typeof technicalSection>,
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
  if (!section.topFixes.length) {
    process.stdout.write('No prioritised technical fixes were found.\n')
    return
  }
  process.stdout.write(
    section.searchDataJoined
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
    return
  }
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
  process.stdout.write(
    'Search Console is not connected for this run. The crawl below shows local technical evidence only. Run `seo start` when you want traffic, query, and ranking evidence in the same report.\n',
  )
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
        printJson(
          technicalCrawl || followups
            ? {
                ...outputReport,
                ...(technicalCrawl ? { technicalCrawl } : {}),
                ...(followups ? { nextCommands: followups } : {}),
              }
            : outputReport,
        )
        return
      }
      if (useSearchData) {
        process.stdout.write(`${outputReport.output.narrative.markdown}\n\n`)
        printWorkflow(outputReport)
      } else {
        printTechnicalOnlyIntro(site)
      }
      if (technicalCrawl) printTechnicalSection(technicalCrawl)
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
