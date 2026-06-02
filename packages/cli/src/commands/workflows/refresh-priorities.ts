import { refreshPrioritiesWorkflow } from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, numberArg, stringArg } from '../../args.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson, printTable } from '../../utils.js'
import { printActionDetails } from '../output.js'
import { cliReportArgs } from '../report-options.js'
import { printWorkflow } from './output.js'

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
    ...cliReportArgs(
      ['days', 'recentDays', 'limit', 'includeBrand', 'refresh'],
      {
        days: {
          description: 'Diagnosis window length in days. Defaults to 90.',
        },
        limit: {
          description: 'Maximum queue items to print. Defaults to 25.',
        },
      },
    ),
    'ga4-property': {
      type: 'string',
      description:
        'GA4 property ID to use for analytics value. Defaults from the selected client.',
    },
    'verify-content': {
      type: 'boolean',
      default: true,
      description:
        'Verify top opportunities against page title, meta, and content. Defaults to true.',
    },
    'verify-limit': {
      type: 'string',
      description: 'Maximum opportunity URLs to verify. Defaults to 5.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
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
      brandTerms: selection.client?.brandTerms,
      includeBrand: booleanArg(args['include-brand']),
      ga4PropertyId:
        stringArg(args['ga4-property']) ?? selection.client?.ga4PropertyId,
      verifyContent: booleanArg(args['verify-content']),
      verifyLimit: numberArg(args['verify-limit']),
      refresh: booleanArg(args.refresh),
    })
    if (json) {
      printJson(report)
      return
    }
    printWorkflow(report)
    printTable(
      [
        'Source',
        'Category',
        'Score',
        'Findings',
        'Template',
        'GA4',
        'Target',
        'Action',
      ],
      report.output.queue.map((item) => [
        item.source,
        item.category,
        item.score,
        item.grouped?.count ?? 1,
        item.template?.label ?? '-',
        item.analytics?.sessions ?? '-',
        item.target,
        item.action,
      ]),
    )
    printActionDetails(
      'Queue action details',
      report.output.queue.map((item) => ({
        label: item.target,
        context: `${item.category}, score ${item.score}`,
        action: item.action,
      })),
    )
  },
})
