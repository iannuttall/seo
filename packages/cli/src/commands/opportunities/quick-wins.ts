import { quickWinsReport } from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  csvArg,
  fetchRateArg,
  jsonFlag,
  numberArg,
  projectArg,
  stringArg,
} from '../../args.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson, printKeyValue } from '../../utils.js'
import {
  formatCount,
  formatPercent,
  formatPosition,
  printActionDetails,
  printLimitedTable,
  printNotes,
  truncate,
  verificationSummary,
} from '../output.js'
import { cliReportArgs } from '../report-options.js'
import { formatContentCheck, formatFetchDiagnostics } from '../shared.js'

export const quickWinsCommand = defineCommand({
  meta: {
    name: 'quick-wins',
    description: 'Find high-ranking low-CTR query/page opportunities',
  },
  args: {
    site: { type: 'string' },
    project: { type: 'string', description: 'Saved project id or name.' },
    client: { type: 'string', description: 'Legacy alias for --project.' },
    ...cliReportArgs([
      'days',
      'limit',
      'includeBrand',
      'minImpressions',
      'verifyContent',
      'verifyLimit',
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
    json: { type: 'boolean', default: false },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const verifyLimit = numberArg(args['verify-limit'])
    const verifyContent =
      booleanArg(args['verify-content']) === true || verifyLimit !== undefined
    const selection = await resolveClientSelection({
      client: projectArg(args),
      site: stringArg(args.site),
      options: { json },
    })
    const report = await quickWinsReport({
      site: selection.site,
      days: numberArg(args.days),
      limit: numberArg(args.limit),
      minImpressions: numberArg(args['min-impressions']),
      brandTerms: [
        ...(selection.client?.brandTerms ?? []),
        ...(csvArg(args['brand-terms']) ?? []),
      ],
      includeBrand: booleanArg(args['include-brand']),
      verifyContent,
      verifyLimit,
      js: booleanArg(args.js) ? true : undefined,
      rate: fetchRateArg(args),
      refresh: booleanArg(args.refresh),
    })
    if (json) {
      printJson(report)
      return
    }
    printKeyValue([
      ['Site', report.site],
      ['Eligible rows', formatCount(report.summary.eligibleRows)],
      ['Returned rows', formatCount(report.summary.returnedRows)],
      [
        'Repeated-query clusters',
        formatCount(report.summary.repeatedQueryGroups),
      ],
      ['Template patterns', formatCount(report.summary.templatePatterns)],
      [
        'CTR click shortfall',
        formatCount(report.summary.returnedEstimatedCtrClickShortfall),
      ],
      ['Brand queries', report.summary.brandFiltering],
      ['Verification', verificationSummary(report)],
      ['Verdict', report.summary.verdict],
    ])
    printNotes('Why this matters', [
      'These rows have GSC average positions from 4 to 10 and observed CTR below a site-peer or versioned fallback target.',
      'Page evidence is needed before treating a CTR shortfall as a title, content, or technical finding.',
    ])
    printNotes('Recommended actions', report.recommendations)
    printNotes('Report caveats', report.caveats)

    if (!report.items.length) {
      return
    }

    if (report.templateRecommendations.length) {
      printLimitedTable(
        ['Template', 'URLs', 'Rows', 'Shortfall', 'Impr', 'Action'],
        report.templateRecommendations.map((template) => [
          truncate(template.templateLabel, 34),
          formatCount(template.urlCount),
          formatCount(template.rowCount),
          formatCount(template.totalEstimatedCtrClickShortfall),
          formatCount(template.totalImpressions),
          truncate(template.action, 72),
        ]),
      )
      printActionDetails(
        'Top template actions',
        report.templateRecommendations.map((template) => ({
          label: template.templateLabel,
          context: `${formatCount(template.urlCount)} URLs, ${formatCount(template.totalEstimatedCtrClickShortfall)} heuristic CTR click shortfall`,
          action: `${template.action} ${template.evidence}`,
        })),
      )
    }

    if (report.groups.length) {
      printLimitedTable(
        [
          'Cluster',
          'URLs',
          'Rows',
          'Shortfall',
          'Impr',
          'Sample URL',
          'Action',
        ],
        report.groups.map((group) => [
          truncate(group.label, 44),
          formatCount(group.urlCount),
          formatCount(group.rowCount),
          formatCount(group.totalEstimatedCtrClickShortfall),
          formatCount(group.totalImpressions),
          truncate(group.sampleUrls[0] ?? '-', 46),
          truncate(group.recommendation, 72),
        ]),
      )
      printActionDetails(
        'Top cluster actions',
        report.groups.map((group) => ({
          label: group.label,
          context: `${formatCount(group.urlCount)} URLs, ${formatCount(group.totalEstimatedCtrClickShortfall)} heuristic CTR click shortfall`,
          action: group.recommendation,
        })),
      )
    }

    printLimitedTable(
      [
        'Query',
        'Template',
        'URL',
        'Pos',
        'Impr',
        'CTR / target',
        'Shortfall',
        'Fetch',
        'Check',
        'Action',
      ],
      report.items.map((item) => [
        truncate(item.query, 36),
        truncate(item.template.label, 24),
        truncate(item.url, 48),
        formatPosition(item.position),
        formatCount(item.impressions),
        `${formatPercent(item.ctr)} / ${formatPercent(item.targetCtr)}`,
        formatCount(item.estimatedCtrClickShortfall),
        formatFetchDiagnostics(item.contentVerification?.fetchDiagnostics),
        formatContentCheck(item.contentVerification?.classification),
        truncate(item.recommendation.action, 64),
      ]),
    )
    printActionDetails(
      'Top opportunity actions',
      report.items.map((item) => ({
        label: item.query,
        context: `${item.template.label}, pos ${formatPosition(item.position)}, ${formatCount(item.impressions)} impressions`,
        action: item.recommendation.action,
      })),
    )
  },
})
