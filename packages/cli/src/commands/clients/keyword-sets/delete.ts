import { deleteKeywordSet, SeoError } from '@seo/core'
import { defineCommand } from 'citty'
import { booleanArg, jsonFlag, stringArg } from '../../../args.js'
import { printJson } from '../../../utils.js'
import {
  keywordSetJsonArg,
  keywordSetProjectArgs,
  selectedProject,
} from './shared.js'

export const keywordSetDeleteCommand = defineCommand({
  meta: { name: 'delete', description: 'Delete a saved keyword set' },
  args: {
    ...keywordSetProjectArgs,
    set: {
      type: 'string',
      description: 'Keyword set id or name.',
      required: true,
    },
    yes: {
      type: 'boolean',
      default: false,
      description: 'Confirm permanent deletion.',
    },
    json: keywordSetJsonArg,
  },
  run: async ({ args }) => {
    if (!booleanArg(args.yes)) {
      throw new SeoError(
        'INVALID_INPUT',
        'Pass --yes to delete the keyword set.',
      )
    }
    const project = await selectedProject(args)
    const idOrName = stringArg(args.set) ?? ''
    const deleted = deleteKeywordSet({ projectId: project.id, idOrName })
    if (!deleted)
      throw new SeoError('INVALID_INPUT', `Keyword set not found: ${idOrName}`)
    const result = { deleted: true, projectId: project.id, set: idOrName }
    if (jsonFlag(args)) printJson(result)
    else process.stdout.write(`Deleted keyword set ${idOrName}.\n`)
  },
})
