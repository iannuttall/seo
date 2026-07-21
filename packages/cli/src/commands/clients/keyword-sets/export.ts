import { writeFile } from 'node:fs/promises'
import {
  getKeywordSet,
  type ProviderValue,
  renderCsv,
  SeoError,
} from '@seo/core'
import { defineCommand } from 'citty'
import { numberArg, stringArg } from '../../../args.js'
import { keywordSetProjectArgs, selectedProject } from './shared.js'

export const keywordSetExportCommand = defineCommand({
  meta: { name: 'export', description: 'Export a bounded saved keyword set' },
  args: {
    ...keywordSetProjectArgs,
    set: {
      type: 'string',
      description: 'Keyword set id or name.',
      required: true,
    },
    format: {
      type: 'string',
      default: 'csv',
      description: 'Output format: csv or json.',
    },
    output: {
      type: 'string',
      description: 'Output file, or - for stdout.',
      required: true,
    },
    tag: { type: 'string', description: 'Only export keywords with this tag.' },
    limit: {
      type: 'string',
      default: '1000',
      description: 'Rows to export, from 1 to 1000.',
    },
    offset: { type: 'string', default: '0', description: 'Rows to skip.' },
  },
  run: async ({ args }) => {
    const format = stringArg(args.format)
    if (format !== 'csv' && format !== 'json') {
      throw new SeoError('INVALID_INPUT', '--format must be csv or json.')
    }
    const limit = numberArg(args.limit)
    const offset = numberArg(args.offset)
    if (!Number.isSafeInteger(limit) || !Number.isSafeInteger(offset)) {
      throw new SeoError(
        'INVALID_INPUT',
        '--limit and --offset must be integers.',
      )
    }
    const project = await selectedProject(args)
    const detail = getKeywordSet({
      projectId: project.id,
      idOrName: stringArg(args.set) ?? '',
      tag: stringArg(args.tag),
      limit,
      offset,
    })
    const body =
      format === 'json'
        ? `${JSON.stringify(detail, null, 2)}\n`
        : keywordSetCsv(detail)
    const output = stringArg(args.output) ?? ''
    if (output === '-') process.stdout.write(body)
    else {
      try {
        await writeFile(output, body, {
          encoding: 'utf8',
          flag: 'wx',
          mode: 0o600,
        })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
          throw new SeoError(
            'INVALID_INPUT',
            `Refusing to overwrite the existing file at ${output}.`,
          )
        }
        throw error
      }
      process.stdout.write(
        `Wrote ${detail.items.length} keywords to ${output}.\n`,
      )
    }
  },
})

function keywordSetCsv(detail: ReturnType<typeof getKeywordSet>): string {
  return renderCsv(
    detail.items.map((item) => {
      const metric = item.latestMetric?.metric
      return {
        keyword: item.keyword,
        normalized_keyword: item.normalizedKeyword,
        tags: item.tags.join('; '),
        page_kind: item.page?.kind,
        page_url: item.page?.url,
        metric_provider: item.latestMetric?.provider,
        metric_observed_at: item.latestMetric?.observedAt,
        monthly_search_volume: observedMetricValue(metric?.monthlySearchVolume),
        cpc_usd: observedMetricValue(metric?.cpcUsd),
        paid_competition: observedMetricValue(metric?.paidCompetition),
        keyword_difficulty: observedMetricValue(metric?.keywordDifficulty),
        intent:
          metric?.intent.state === 'observed' ? metric.intent.value : null,
        result_count: observedMetricValue(metric?.resultCount),
      }
    }),
    [
      'keyword',
      'normalized_keyword',
      'tags',
      'page_kind',
      'page_url',
      'metric_provider',
      'metric_observed_at',
      'monthly_search_volume',
      'cpc_usd',
      'paid_competition',
      'keyword_difficulty',
      'intent',
      'result_count',
    ],
  )
}

function observedMetricValue<T>(value: ProviderValue<T> | undefined): T | null {
  return value?.state === 'observed' ? value.value : null
}
