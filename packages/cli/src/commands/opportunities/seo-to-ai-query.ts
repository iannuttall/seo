import { seoToAiQueryReport } from '@seo/core'
import { defineCommand } from 'citty'
import {
  booleanArg,
  jsonFlag,
  numberArg,
  stringArg,
  projectArg,
} from '../../args.js'
import { resolveClientSelection } from '../../selection.js'
import { printJson, printKeyValue } from '../../utils.js'
import { formatCount, printLimitedTable, truncate } from '../output.js'
import { cliReportArgs } from '../report-options.js'

export const seoToAiQueryCommand = defineCommand({
  meta: {
    name: 'seo-to-ai-query',
    description: 'Convert GSC search queries into AI-style monitoring prompts',
  },
  args: {
    site: { type: 'string' },
    project: { type: 'string', description: 'Saved project id or name.' },
    client: { type: 'string', description: 'Legacy alias for --project.' },
    ...cliReportArgs(
      ['days', 'limit', 'minImpressions', 'includeBrand', 'refresh'],
      {
        limit: {
          description: 'Maximum source queries to convert. Defaults to 25.',
        },
        minImpressions: {
          description: 'Minimum query impressions. Defaults to 20.',
        },
        includeBrand: {
          description: 'Include branded queries in prompt generation.',
        },
        refresh: { description: 'Bypass local GSC cache.' },
      },
    ),
    json: { type: 'boolean', default: false },
  },
  run: async ({ args }) => {
    const json = jsonFlag(args)
    const selection = await resolveClientSelection({
      client: projectArg(args),
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
