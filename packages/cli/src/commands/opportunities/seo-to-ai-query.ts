import { seoToAiQueryReport } from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, numberArg, stringArg } from '../../args.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson, printKeyValue } from '../../utils.js'
import { formatCount, printLimitedTable, truncate } from '../output.js'

export const seoToAiQueryCommand = defineCommand({
  meta: {
    name: 'seo-to-ai-query',
    description: 'Convert GSC search queries into AI-style monitoring prompts',
  },
  args: {
    site: { type: 'string' },
    client: { type: 'string' },
    days: {
      type: 'string',
      description: 'GSC lookback window. Defaults to 28.',
    },
    limit: {
      type: 'string',
      description: 'Maximum source queries to convert. Defaults to 25.',
    },
    'min-impressions': {
      type: 'string',
      description: 'Minimum query impressions. Defaults to 20.',
    },
    'include-brand': {
      type: 'boolean',
      default: false,
      description: 'Include branded queries in prompt generation.',
    },
    refresh: {
      type: 'boolean',
      default: false,
      description: 'Bypass local GSC cache.',
    },
    json: { type: 'boolean', default: false },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const selection = await resolveClientSelection({
      client: stringArg(args.client),
      site: stringArg(args.site),
      options: { json, refresh: booleanArg(args.refresh) },
    })
    const report = await seoToAiQueryReport({
      site: selection.site,
      days: numberArg(args.days),
      limit: numberArg(args.limit),
      minImpressions: numberArg(args['min-impressions']),
      brandTerms: selection.client?.brandTerms,
      includeBrand: booleanArg(args['include-brand']),
      refresh: booleanArg(args.refresh),
    })

    if (json) {
      printJson(report)
      return
    }

    printKeyValue([
      ['Property', report.site],
      ['Source queries', formatCount(report.summary.sourceQueries)],
      ['Prompts', formatCount(report.summary.prompts)],
    ])

    printLimitedTable(
      ['Query', 'Impr', 'Prompt'],
      report.items.flatMap((item) =>
        item.prompts.map((prompt) => [
          truncate(item.query, 42),
          formatCount(item.impressions),
          truncate(prompt, 86),
        ]),
      ),
    )
  },
})
