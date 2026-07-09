import { internalLinksReport } from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  csvArg,
  jsonFlag,
  projectArg,
  strictFetchRateArg,
  strictNumberArg,
  stringArg,
} from '../../args.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson, printKeyValue } from '../../utils.js'
import {
  formatCount,
  printActionDetails,
  printLimitedTable,
  printNotes,
  truncate,
} from '../output.js'
import { cliReportArgs } from '../report-options.js'

export const internalLinksCommand = defineCommand({
  meta: {
    name: 'internal-links',
    description: 'Find verified internal-link review candidates for one URL',
  },
  args: {
    site: {
      type: 'string',
      description: 'GSC property URL, for example sc-domain:example.com.',
    },
    project: { type: 'string', description: 'Saved project id or name.' },
    client: { type: 'string', description: 'Legacy alias for --project.' },
    url: {
      type: 'string',
      required: true,
      description: 'Target page that should receive relevant internal links.',
    },
    ...cliReportArgs([
      'days',
      'limit',
      'checkLimit',
      'minImpressions',
      'includeBrand',
      'js',
      'fetchConcurrency',
      'fetchIntervalCap',
      'fetchIntervalMs',
      'refresh',
    ]),
    'brand-terms': {
      type: 'string',
      description: 'Comma-separated brand terms to exclude.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const refresh = booleanArg(args.refresh)
    const days = strictNumberArg(args.days, '--days')
    const limit = strictNumberArg(args.limit, '--limit')
    const checkLimit = strictNumberArg(args['check-limit'], '--check-limit')
    const minImpressions = strictNumberArg(
      args['min-impressions'],
      '--min-impressions',
    )
    const rate = strictFetchRateArg(args)
    const selection = await resolveClientSelection({
      client: projectArg(args),
      site: stringArg(args.site),
      options: { json, refresh },
    })
    const report = await internalLinksReport({
      site: selection.site,
      targetUrl: stringArg(args.url) ?? '',
      days,
      limit,
      checkLimit,
      minImpressions,
      brandTerms: [
        ...(selection.client?.brandTerms ?? []),
        ...(csvArg(args['brand-terms']) ?? []),
      ],
      includeBrand: booleanArg(args['include-brand']),
      js: booleanArg(args.js) ? true : undefined,
      rate,
      refresh,
    })
    if (json) {
      printJson(report)
      return
    }

    printKeyValue([
      ['Site', report.site],
      ['Target', report.targetUrl],
      ['Preferred target', report.target.preferredUrl],
      ['Target state', report.target.verification],
      ['Target queries', formatCount(report.summary.targetQueries)],
      ['Matched sources', formatCount(report.summary.candidateSources)],
      ['Checked sources', formatCount(report.summary.checkedSources)],
      ['Review candidates', formatCount(report.summary.returnedSources)],
      [
        'Existing contextual links',
        formatCount(report.summary.existingLinksObserved),
      ],
      ['Technical exclusions', formatCount(report.summary.technicalExclusions)],
      ['Failed checks', formatCount(report.summary.failedChecks)],
      ['Unchecked sources', formatCount(report.summary.uncheckedCandidates)],
      ['GSC completeness', report.source.completeness],
      ['Brand queries', report.summary.brandFiltering],
      ['Verdict', report.summary.verdict],
    ])
    printNotes('Why this matters', [
      'Exact-query overlap is useful affinity evidence; precision lexical matches are review evidence only.',
      'Source and target pages are checked for redirects, indexability, canonicals, and existing link placement before an action is returned.',
    ])
    printNotes('Recommended actions', report.recommendations)
    printNotes('Report caveats', report.caveats)
    if (!report.items.length) return

    printLimitedTable(
      ['Source URL', 'Matched impr', 'Match', 'Link evidence', 'Action'],
      report.items.map((item) => [
        truncate(item.sourceUrl, 52),
        formatCount(item.matchedQueryImpressions),
        item.bestMatchKind,
        item.linkEvidence.status,
        item.actionType,
      ]),
    )
    printActionDetails(
      'Top internal-link reviews',
      report.items.map((item) => ({
        label: truncate(item.sourceUrl, 96),
        context: `${formatCount(item.matchedQueryImpressions)} matched-query impressions; ${item.bestMatchKind}`,
        action: item.recommendation.action,
      })),
    )
    printNotes('Provider usage', [report.ledgerSummary])
  },
})
