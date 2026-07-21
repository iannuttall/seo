import { listKeywordSets } from '@seo/core'
import { defineCommand } from 'citty'
import { jsonFlag } from '../../../args.js'
import { printJson } from '../../../utils.js'
import { printKeywordSetList } from './output.js'
import {
  keywordSetJsonArg,
  keywordSetProjectArgs,
  selectedProject,
} from './shared.js'

export const keywordSetListCommand = defineCommand({
  meta: { name: 'list', description: 'List saved keyword sets for a project' },
  args: { ...keywordSetProjectArgs, json: keywordSetJsonArg },
  run: async ({ args }) => {
    const project = await selectedProject(args)
    const sets = listKeywordSets({ projectId: project.id })
    if (jsonFlag(args)) printJson({ projectId: project.id, sets })
    else printKeywordSetList(sets)
  },
})
