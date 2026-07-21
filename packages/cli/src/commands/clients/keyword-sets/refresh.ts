import { refreshKeywordSet, SeoError } from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, numberArg, stringArg } from '../../../args.js'
import { printJson, printKeyValue } from '../../../utils.js'
import {
  keywordSetJsonArg,
  keywordSetProjectArgs,
  selectedProject,
} from './shared.js'

export const keywordSetRefreshCommand = defineCommand({
  meta: {
    name: 'refresh',
    description: 'Preview or refresh saved keyword metrics',
  },
  args: {
    ...keywordSetProjectArgs,
    set: {
      type: 'string',
      description: 'Keyword set id or name.',
      required: true,
    },
    provider: { type: 'string', description: 'Optional keyword provider.' },
    limit: {
      type: 'string',
      default: '1000',
      description: 'Keywords to refresh, from 1 to 1000.',
    },
    offset: {
      type: 'string',
      default: '0',
      description: 'Saved keyword offset, from 0 to 100000.',
    },
    yes: {
      type: 'boolean',
      default: false,
      description: 'Run the paid refresh after estimating its cost.',
    },
    json: keywordSetJsonArg,
  },
  run: async ({ args }) => {
    const limit = numberArg(args.limit)
    const offset = numberArg(args.offset)
    if (!Number.isSafeInteger(limit)) {
      throw new SeoError('INVALID_INPUT', '--limit must be an integer.')
    }
    if (!Number.isSafeInteger(offset)) {
      throw new SeoError('INVALID_INPUT', '--offset must be an integer.')
    }
    const project = await selectedProject(args)
    const report = await refreshKeywordSet({
      projectId: project.id,
      idOrName: stringArg(args.set) ?? '',
      provider: stringArg(args.provider) as
        | 'dataforseo'
        | 'semrush'
        | 'ahrefs'
        | undefined,
      limit,
      offset,
      execute: booleanArg(args.yes),
    })
    if (jsonFlag(args)) {
      printJson(report)
      return
    }
    printKeyValue([
      ['Set', report.set.name],
      ['Mode', report.mode],
      ['Keywords', String(report.selection.selectedKeywords)],
      ['Offset', String(report.selection.offset)],
      ['Requests', String(report.cost.requestCount)],
      [
        'Estimated cost',
        report.cost.estimatedMicros === null
          ? 'unavailable'
          : `$${(report.cost.estimatedMicros / 1_000_000).toFixed(4)}`,
      ],
      ...(report.execution
        ? ([
            ['Saved snapshots', String(report.execution.savedSnapshots)],
            ['Partial batches', String(report.execution.partialBatches)],
            ['Failed batches', String(report.execution.failedBatches)],
            [
              'Actual cost',
              report.execution.actualMicros === null
                ? 'unavailable'
                : `$${(report.execution.actualMicros / 1_000_000).toFixed(4)}`,
            ],
          ] satisfies Array<[string, string]>)
        : []),
    ])
    if (report.mode === 'preview') {
      process.stdout.write(
        `\nRun again with --yes to refresh these ${report.selection.selectedKeywords} keywords.\n`,
      )
    }
  },
})
