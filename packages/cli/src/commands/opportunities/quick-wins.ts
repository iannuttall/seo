import { quickWinsReport } from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
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
      minImpressions: numberArg(args['min-impressions']),
      brandTerms: selection.client?.brandTerms,
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
      ['Quick wins', formatCount(report.summary.rows)],
      [
        'Repeated-query clusters',
        formatCount(report.summary.repeatedQueryGroups),
      ],
      ['Template patterns', formatCount(report.summary.templatePatterns)],
      ['Estimated lift', formatCount(report.summary.totalEstimatedClickLift)],
      ['Brand queries', report.summary.brandFiltering],
      ['Verification', verificationSummary(report)],
      ['Verdict', report.summary.verdict],
    ])
    printNotes('Why this matters', [
      'Quick wins already rank on page one, so better SERP framing and clearer on-page intent can recover clicks without creating new pages.',
      'Template patterns show when the same fix can be applied across many similar pages.',
    ])
    printNotes('Recommended actions', report.recommendations)
    printNotes('Report caveats', report.caveats)

    if (!report.items.length) {
      return
    }

    if (report.templateRecommendations.length) {
      printLimitedTable(
        ['Template', 'Rows', 'Lift', 'Impr', 'Action'],
        report.templateRecommendations.map((template) => [
          truncate(template.templateLabel, 34),
          formatCount(template.count),
          formatCount(template.totalEstimatedClickLift),
          formatCount(template.totalImpressions),
          truncate(template.action, 72),
        ]),
      )
      printActionDetails(
        'Top template actions',
        report.templateRecommendations.map((template) => ({
          label: template.templateLabel,
          context: `${formatCount(template.count)} rows, ${formatCount(template.totalEstimatedClickLift)} estimated click lift`,
          action: `${template.action} ${template.evidence}`,
        })),
      )
    }

    if (report.groups.length) {
      printLimitedTable(
        ['Cluster', 'Rows', 'Lift', 'Impr', 'Sample URL', 'Action'],
        report.groups.map((group) => [
          truncate(group.label, 44),
          formatCount(group.count),
          formatCount(group.totalEstimatedClickLift),
          formatCount(group.totalImpressions),
          truncate(group.sampleUrls[0] ?? '-', 46),
          truncate(group.recommendation, 72),
        ]),
      )
      printActionDetails(
        'Top cluster actions',
        report.groups.map((group) => ({
          label: group.label,
          context: `${formatCount(group.count)} rows, ${formatCount(group.totalEstimatedClickLift)} estimated click lift`,
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
        'CTR / expected',
        'Lift',
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
        `${formatPercent(item.ctr)} / ${formatPercent(item.expectedCtr)}`,
        formatCount(item.estimatedClickLift),
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
