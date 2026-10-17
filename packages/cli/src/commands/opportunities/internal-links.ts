import { internalLinksReport } from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, stringArg } from '../../args.js'
import { resolveProperty } from '../../selection.js'
import { printJson } from '../../utils.js'
import {
  formatCount,
  printActionDetails,
  printLimitedTable,
  printNotes,
  printReportSummary,
  truncate,
} from '../output.js'

export const internalLinksCommand = defineCommand({
  meta: {
    name: 'internal-links',
    description: 'Find verified internal-link review candidates for one URL',
  },
  args: {
    url: {
      type: 'string',
      required: true,
      description: 'Target page that should receive internal links.',
    },
    site: {
      type: 'string',
      description:
        'Search Console property, when the URL alone does not pick one.',
    },
    'start-date': { type: 'string', description: 'Optional YYYY-MM-DD.' },
    'end-date': { type: 'string', description: 'Optional YYYY-MM-DD.' },
    refresh: {
      type: 'boolean',
      default: false,
      description: 'Bypass the local cache and fetch fresh data.',
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
    const targetUrl = stringArg(args.url) ?? ''
    const site = await resolveProperty(stringArg(args.site) ?? targetUrl, {
      refresh,
    })
    const report = await internalLinksReport({
      site,
      targetUrl,
      startDate: stringArg(args['start-date']),
      endDate: stringArg(args['end-date']),
      refresh,
    })
    if (json) {
      printJson(report)
      return
    }

    printReportSummary({
      title: 'Internal link opportunities',
      target: report.targetUrl,
      status:
        report.summary.failedChecks > 0 ||
        report.summary.uncheckedCandidates > 0
          ? 'unknown'
          : 'info',
      summary: report.summary.verdict,
      metrics: [
        { label: 'Target state', value: report.target.verification },
        { label: 'Preferred target', value: report.target.preferredUrl },
        {
          label: 'Target queries',
          value: formatCount(report.summary.targetQueries),
        },
        {
          label: 'Matched sources',
          value: formatCount(report.summary.candidateSources),
        },
        {
          label: 'Checked sources',
          value: formatCount(report.summary.checkedSources),
        },
        {
          label: 'Attempted sources',
          value: formatCount(report.summary.attemptedSources),
        },
        {
          label: 'Review candidates',
          value: formatCount(report.summary.returnedSources),
        },
        {
          label: 'Technical exclusions',
          value: formatCount(report.summary.technicalExclusions),
        },
        {
          label: 'Existing links',
          value: formatCount(report.summary.existingLinksObserved),
        },
        {
          label: 'Failed checks',
          value: formatCount(report.summary.failedChecks),
        },
        {
          label: 'Unchecked sources',
          value: formatCount(report.summary.uncheckedCandidates),
        },
        { label: 'GSC completeness', value: report.source.completeness },
        { label: 'Brand queries', value: report.summary.brandFiltering },
      ],
    })
    printNotes('Why this matters', [
      'Exact-query overlap is useful affinity evidence; precision lexical matches are review evidence only.',
      'Source and target pages are checked for redirects, indexability, canonicals, and existing link placement before an action is returned.',
      'Each source names the sentence where a link fits and anchor text taken from it, when a sentence names the target.',
    ])
    printNotes('Recommended actions', report.recommendations)
    printNotes('Report caveats', report.caveats)
    if (!report.items.length) return

    printLimitedTable(
      ['Source URL', 'Matched impr', 'Match', 'Link evidence', 'Anchor'],
      report.items.map((item) => [
        truncate(item.sourceUrl, 52),
        formatCount(item.matchedQueryImpressions),
        item.bestMatchKind,
        item.linkEvidence.status,
        truncate(
          item.placement.sentences[0]?.anchors[0] ?? 'no sentence fits',
          32,
        ),
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
