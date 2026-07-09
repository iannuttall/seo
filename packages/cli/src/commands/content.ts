import { contentOptimizationReport } from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  defaultTrueBooleanArg,
  jsonFlag,
  numberArg,
  projectArg,
  stringArg,
} from '../args.js'
import { resolveClientSelection } from '../selection.js'
import { printJson, printKeyValue } from '../utils.js'
import {
  formatCount,
  printActionDetails,
  printLimitedTable,
  printNotes,
  truncate,
} from './output.js'

export const contentCommand = defineCommand({
  meta: {
    name: 'content',
    description: 'Optimize page content from real GSC queries',
  },
  subCommands: {
    optimize: defineCommand({
      meta: {
        name: 'optimize',
        description: 'Build a content optimization report for one URL',
      },
      args: {
        site: { type: 'string' },
        client: { type: 'string', description: 'Legacy alias for --project.' },
        project: { type: 'string', description: 'Saved project id or name.' },
        url: { type: 'string', required: true },
        days: {
          type: 'string',
          description: 'GSC lookback days. Defaults to 28.',
        },
        limit: {
          type: 'string',
          description: 'Maximum GSC queries to inspect. Defaults to 25.',
        },
        'min-impressions': {
          type: 'string',
          description: 'Minimum query impressions. Defaults to 10.',
        },
        'include-brand': {
          type: 'boolean',
          default: false,
          description: 'Include branded queries.',
        },
        'verify-content': defaultTrueBooleanArg(
          'Fetch the page for content checks. Defaults to true.',
          'Skip fetching the page for content checks.',
        ),
        js: {
          type: 'boolean',
          default: false,
          description: 'Force JavaScript rendering for page extraction.',
        },
        refresh: {
          type: 'boolean',
          default: false,
          description: 'Bypass local GSC and HTTP cache.',
        },
        json: { type: 'boolean', default: false },
      },
      run: async ({ args }) => {
        const json = jsonFlag(args)
        const selection = await resolveClientSelection({
          client: projectArg(args),
          site: stringArg(args.site),
          options: { json, refresh: booleanArg(args.refresh) },
        })
        const report = await contentOptimizationReport({
          site: selection.site,
          url: stringArg(args.url) ?? '',
          days: numberArg(args.days),
          limit: numberArg(args.limit),
          minImpressions: numberArg(args['min-impressions']),
          brandTerms: selection.client?.brandTerms,
          includeBrand: booleanArg(args['include-brand']),
          verifyContent: booleanArg(args['verify-content']) !== false,
          js: booleanArg(args.js) ? true : 'auto',
          refresh: booleanArg(args.refresh),
        })
        if (json) {
          printJson(report)
          return
        }

        printKeyValue([
          ['Property', report.site],
          ['URL', report.url],
          ['Score', `${report.summary.score}/100`],
          ['Primary intent', report.summary.primaryIntent],
          ['Primary query', report.summary.primaryQuery ?? 'none'],
          ['Queries', formatCount(report.summary.queries)],
          ['Opportunities', formatCount(report.summary.opportunities)],
          ['Estimated lift', formatCount(report.summary.estimatedClickLift)],
          ['Verdict', report.summary.verdict],
        ])

        printActionDetails(
          'Top actions',
          report.topActions.map((action) => ({
            label: action.title,
            action: action.action,
            context: action.plainEnglish,
          })),
        )

        if (report.brief.sections.length) {
          process.stdout.write('\nSuggested sections\n')
          printLimitedTable(
            ['Heading', 'Queries'],
            report.brief.sections.map((section) => [
              truncate(section.heading, 48),
              truncate(section.queries.join(', '), 80),
            ]),
          )
        }

        if (report.intentMix.length) {
          process.stdout.write('\nIntent mix\n')
          printLimitedTable(
            ['Intent', 'Queries', 'Impressions', 'Clicks'],
            report.intentMix.map((intent) => [
              intent.intent,
              formatCount(intent.queries),
              formatCount(intent.impressions),
              formatCount(intent.clicks),
            ]),
          )
        }

        printNotes('Caveats', report.caveats)
      },
    }),
  },
})
