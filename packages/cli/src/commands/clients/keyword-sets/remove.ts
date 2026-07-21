import { removeKeywordsFromSet } from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag, stringArg } from '../../../args.js'
import { printJson, printKeyValue } from '../../../utils.js'
import {
  keywordInputs,
  keywordSetJsonArg,
  keywordSetProjectArgs,
  selectedProject,
} from './shared.js'

export const keywordSetRemoveCommand = defineCommand({
  meta: { name: 'remove', description: 'Remove keywords from a saved set' },
  args: {
    ...keywordSetProjectArgs,
    set: {
      type: 'string',
      description: 'Keyword set id or name.',
      required: true,
    },
    keyword: { type: 'string', description: 'One keyword.' },
    keywords: { type: 'string', description: 'Comma-separated keywords.' },
    file: { type: 'string', description: 'Newline-delimited keyword file.' },
    json: keywordSetJsonArg,
  },
  run: async ({ args }) => {
    const project = await selectedProject(args)
    const result = removeKeywordsFromSet({
      projectId: project.id,
      idOrName: stringArg(args.set) ?? '',
      keywords: await keywordInputs(args),
    })
    if (jsonFlag(args)) printJson(result)
    else
      printKeyValue([
        ['Set', result.setId],
        ['Removed', String(result.removed)],
        ['Keywords', String(result.keywordCount)],
      ])
  },
})
