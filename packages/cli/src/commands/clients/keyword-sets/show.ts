import { getKeywordSet, SeoError } from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag, numberArg, stringArg } from '../../../args.js'
import { printJson } from '../../../utils.js'
import { printKeywordSet } from './output.js'
import {
  keywordSetJsonArg,
  keywordSetProjectArgs,
  selectedProject,
} from './shared.js'

export const keywordSetShowCommand = defineCommand({
  meta: { name: 'show', description: 'Show a bounded saved keyword set view' },
  args: {
    ...keywordSetProjectArgs,
    set: {
      type: 'string',
      description: 'Keyword set id or name.',
      required: true,
    },
    tag: { type: 'string', description: 'Only return keywords with this tag.' },
    limit: {
      type: 'string',
      default: '100',
      description: 'Rows to return, from 1 to 1000.',
    },
    offset: { type: 'string', default: '0', description: 'Rows to skip.' },
    json: keywordSetJsonArg,
  },
  run: async ({ args }) => {
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
    if (jsonFlag(args)) printJson(detail)
    else printKeywordSet(detail)
  },
})
